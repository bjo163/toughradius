package app

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/bjo163/mwx-isp/internal/billing"
	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/internal/tenancy"
	"github.com/bjo163/mwx-isp/pkg/metrics"
	"github.com/robfig/cron/v3"
	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/process"
	"go.uber.org/zap"
)

var cronParser = cron.NewParser(
	cron.SecondOptional | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor,
)

func (a *Application) initJob() {
	loc, _ := time.LoadLocation(a.appConfig.System.Location)
	a.sched = cron.New(cron.WithLocation(loc), cron.WithParser(cronParser))

	var err error
	_, err = a.sched.AddFunc("@every 30s", func() {
		go a.SchedSystemMonitorTask()
		go a.SchedProcessMonitorTask()
		go a.SchedNetworkMonitorTask()
		go a.SchedNotificationOutboxTask()
	})
	if err != nil {
		zap.S().Errorf("init job error %s", err.Error())
	}

	_, err = a.sched.AddFunc("@daily", func() {
		a.gormDB.
			Where("opt_time < ? ", time.Now().
				Add(-time.Hour*24*365)).Delete(domain.SysOprLog{})
	})

	if err != nil {
		zap.S().Errorf("init job error %s", err.Error())
	}

	_, err = a.sched.AddFunc("@daily", func() {
		a.SchedClearExpireData()
	})

	if err != nil {
		zap.S().Errorf("init job error %s", err.Error())
	}

	_, err = a.sched.AddFunc("@daily", func() {
		a.SchedISPBillingTask()
	})
	if err != nil {
		zap.S().Errorf("init ISP billing job error %s", err.Error())
	}

	a.sched.Start()
}

// SchedISPBillingTask creates due monthly invoices, processes overdue invoices
// when automatic suspension is enabled, and disconnects sessions for accounts
// suspended by billing enforcement. It logs failures and returns without
// stopping the application scheduler; the next scheduled run retries unfinished
// work. Database errors are not returned to the cron runner.
func (a *Application) SchedISPBillingTask() {
	defer func() {
		if err := recover(); err != nil {
			zap.L().Error("ISP billing scheduler panic", zap.Any("error", err))
			a.enqueueSchedulerFailure("isp-billing", "scheduler recovered from a task error")
		}
	}()
	now := time.Now()
	dueDays := int(a.GetSettingsInt64Value("isp", "DefaultDueDays"))
	if dueDays < 0 || dueDays > 90 {
		dueDays = 10
	}
	// Settings are installation-wide today; each active tenant gets the same
	// billing policy while all database reads/writes remain tenant scoped.
	autoSuspend := a.GetSettingsBoolValue("isp", "AutoSuspend")
	var tenants []domain.Tenant
	if err := a.gormDB.Where("status = ?", "active").Order("id ASC").Find(&tenants).Error; err != nil {
		zap.S().Error("active tenant query failed for ISP billing", zap.Error(err))
		a.enqueueSchedulerFailure("isp-billing-tenants", "active tenant query failed")
		return
	}
	for _, tenant := range tenants {
		if err := a.runBillingForTenant(tenant.ID, now, dueDays, autoSuspend); err != nil {
			zap.S().Error("tenant ISP billing run failed", zap.Int64("tenant_id", tenant.ID), zap.Error(err))
			a.enqueueSchedulerFailure("isp-billing", fmt.Sprintf("billing failed for tenant %d", tenant.ID))
		}
	}
}

func (a *Application) runBillingForTenant(tenantID int64, now time.Time, dueDays int, autoSuspend bool) error {
	if tenantID <= 0 {
		return fmt.Errorf("invalid tenant ID %d", tenantID)
	}
	ctx := tenancy.WithTenantID(context.Background(), tenantID)
	db := a.gormDB.WithContext(ctx)
	if _, err := billing.GenerateMonthlyInvoices(db, now, dueDays); err != nil {
		return fmt.Errorf("generate monthly invoices: %w", err)
	}
	if !autoSuspend {
		return nil
	}
	if err := billing.ProcessOverdueInvoices(db, now); err != nil {
		return fmt.Errorf("process overdue invoices: %w", err)
	}
	if err := billing.SuspendOverdueSubscriptions(db, now); err != nil {
		return fmt.Errorf("suspend overdue subscriptions: %w", err)
	}
	handler := a.sessionDisconnectHandler()
	if handler == nil {
		return nil
	}
	var subs []domain.Subscription
	if err := db.Where("status = ? AND suspension_reason = ?", domain.SubscriptionSuspended, domain.SuspensionBillingOverdue).Find(&subs).Error; err != nil {
		return fmt.Errorf("load billing-suspended subscriptions: %w", err)
	}
	for _, sub := range subs {
		var user domain.RadiusUser
		if sub.RadiusUserID == 0 || db.First(&user, sub.RadiusUserID).Error != nil {
			continue
		}
		var sessions []domain.RadiusOnline
		if err := db.Where("username = ?", user.Username).Find(&sessions).Error; err != nil {
			return fmt.Errorf("load online sessions for %q: %w", user.Username, err)
		}
		for _, session := range sessions {
			if err := handler(ctx, session); err != nil {
				zap.S().Warn("billing suspension disconnect failed", zap.Int64("tenant_id", tenantID), zap.String("username", user.Username), zap.Error(err))
			}
		}
	}
	return nil
}

func (a *Application) enqueueSchedulerFailure(job, summary string) {
	if a.notificationOutbox == nil {
		return
	}
	now := time.Now()
	key := fmt.Sprintf("scheduler:%s:%s", job, now.Format("200601021504"))
	if err := a.notificationOutbox.Enqueue("scheduler.failure", key, "MWX-ISP: "+summary+". Review the scheduler and application logs."); err != nil {
		zap.L().Warn("enqueue scheduler failure notification failed", zap.Error(err))
	}
}

// SchedNetworkMonitorTask polls explicitly configured network targets.
func (a *Application) SchedNetworkMonitorTask() {
	if a.networkMonitor == nil || a.gormDB == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	var tenants []domain.Tenant
	if err := a.gormDB.WithContext(ctx).Where("status = ?", "active").Order("id ASC").Find(&tenants).Error; err != nil {
		zap.L().Warn("active tenant query failed for network monitor", zap.Error(err))
		a.enqueueSchedulerFailure("network-monitor-tenants", "active tenant query failed")
		return
	}
	for _, tenant := range tenants {
		tenantCtx := tenancy.WithTenantID(ctx, tenant.ID)
		if err := a.networkMonitor.PollDue(tenantCtx, time.Now()); err != nil {
			zap.L().Warn("tenant network monitor poll failed", zap.Int64("tenant_id", tenant.ID), zap.Error(err))
			a.enqueueSchedulerFailure("network-monitor", fmt.Sprintf("network monitor polling failed for tenant %d", tenant.ID))
		}
	}
}

// SchedNotificationOutboxTask enqueues recent billing changes and delivers a
// bounded batch of opt-in operator notifications.
func (a *Application) SchedNotificationOutboxTask() {
	if a.notificationOutbox == nil || a.gormDB == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	var tenants []domain.Tenant
	if err := a.gormDB.WithContext(ctx).Where("status = ?", "active").Order("id ASC").Find(&tenants).Error; err != nil {
		zap.L().Warn("active tenant query failed for notification dispatcher", zap.Error(err))
		return
	}
	for _, tenant := range tenants {
		tenantCtx := tenancy.WithTenantID(ctx, tenant.ID)
		if err := a.NotifyBillingEvents(tenantCtx, time.Now().Add(-2*time.Minute)); err != nil {
			zap.L().Warn("tenant billing notification enqueue failed", zap.Int64("tenant_id", tenant.ID), zap.Error(err))
		}
		if err := a.notificationOutbox.ProcessOnce(tenantCtx, time.Now()); err != nil {
			zap.L().Warn("tenant notification outbox processing failed", zap.Int64("tenant_id", tenant.ID), zap.Error(err))
		}
	}
}

// SchedSystemMonitorTask system monitor
func (a *Application) SchedSystemMonitorTask() {
	defer func() {
		if err := recover(); err != nil {
			zap.S().Error(err)
		}
	}()

	// Collect CPU usage
	_cpuuse, err := cpu.Percent(0, false)
	if err == nil && len(_cpuuse) > 0 {
		metrics.SetGauge("system_cpuuse", int64(_cpuuse[0]*100)) // Store as percentage * 100
	}

	// Collect memory usage
	_meminfo, err := mem.VirtualMemory()
	if err == nil {
		metrics.SetGauge("system_memuse", int64(_meminfo.Used/1024/1024)) //nolint:gosec // G115: memory MB value fits in int64
	}
}

// SchedProcessMonitorTask app process monitor
func (a *Application) SchedProcessMonitorTask() {
	defer func() {
		if err := recover(); err != nil {
			zap.S().Error(err)
		}
	}()

	p, err := process.NewProcess(int32(os.Getpid())) //nolint:gosec // G115: PID is always within int32 range
	if err != nil {
		return
	}

	// Collect process CPU usage
	cpuuse, err := p.CPUPercent()
	if err == nil {
		metrics.SetGauge("toughradius_cpuuse", int64(cpuuse*100)) // Store as percentage * 100
	}

	// Collect process memory usage
	meminfo, err := p.MemoryInfo()
	if err == nil {
		metrics.SetGauge("toughradius_memuse", int64(meminfo.RSS/1024/1024)) //nolint:gosec // G115: memory MB value fits in int64
	}
}

// SchedClearExpireData purges stale operational data and is registered as a
// @daily cron job by initJob.
//
// It performs tenant-scoped cleanup for every organization:
//   - radius_online: deletes rows that have not refreshed for at least three
//     radius.AcctInterimInterval periods, reclaiming sessions left dangling by a
//     missed Accounting-Stop. A live session updates every interim interval, so
//     requiring several missed updates avoids dropping active sessions (which
//     would also under-count the per-user concurrency limit).
//   - radius_accounting: deletes terminated records whose AcctStopTime predates
//     the radius.AccountingHistoryDays retention window. The window defaults to
//     90 days (config seed); a value of 0 disables accounting cleanup entirely.
//     Active sessions carry a zero AcctStopTime (stamped only at Accounting-Stop)
//     and are always excluded, so an online session never loses its billing row.
//
// Legacy sys_opr_log retention remains installation-wide because that older
// table does not carry tenant ownership. Any panic is recovered and logged so
// a cleanup failure never crashes the scheduler goroutine.
func (a *Application) SchedClearExpireData() {
	defer func() {
		if err := recover(); err != nil {
			zap.S().Error(err)
		}
	}()

	var tenants []domain.Tenant
	if err := a.gormDB.Find(&tenants).Error; err != nil {
		zap.L().Error("load tenants for session retention", zap.Error(err))
		return
	}
	if len(tenants) == 0 {
		// Keep cleanup working on legacy/test installations before tenant rows
		// have been initialized; the migration assigns their data to tenant 1.
		tenants = []domain.Tenant{{ID: domain.DefaultTenantID}}
	}

	// Reclaim dangling sessions and accounting history within each tenant.
	interim := a.ConfigMgr().GetInt("radius", "AcctInterimInterval")
	if interim <= 0 {
		interim = 300
	}
	onlineStaleWindow := time.Duration(interim*3) * time.Second
	idays := a.ConfigMgr().GetInt("radius", "AccountingHistoryDays")
	for _, tenant := range tenants {
		db := a.gormDB.WithContext(tenancy.WithTenantID(context.Background(), tenant.ID))
		if err := db.Where("last_update <= ?", time.Now().Add(-onlineStaleWindow)).Delete(&domain.RadiusOnline{}).Error; err != nil {
			zap.L().Error("prune stale tenant sessions", zap.Int64("tenant_id", tenant.ID), zap.Error(err))
		}
		// A zero retention setting disables accounting cleanup. The epoch guard
		// excludes active sessions with a zero AcctStopTime.
		if idays > 0 {
			cutoff := time.Now().Add(-time.Hour * 24 * time.Duration(idays))
			if err := db.Where("acct_stop_time > ? AND acct_stop_time < ?", time.Unix(0, 0), cutoff).Delete(&domain.RadiusAccounting{}).Error; err != nil {
				zap.L().Error("prune tenant accounting history", zap.Int64("tenant_id", tenant.ID), zap.Error(err))
			}
		}
	}
}
