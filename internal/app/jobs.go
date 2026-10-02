package app

import (
	"context"
	"os"
	"time"

	"github.com/robfig/cron/v3"
	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/process"
	"github.com/talkincode/toughradius/v9/internal/billing"
	"github.com/talkincode/toughradius/v9/internal/domain"
	"github.com/talkincode/toughradius/v9/pkg/metrics"
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
		}
	}()
	now := time.Now()
	dueDays := int(a.GetSettingsInt64Value("isp", "DefaultDueDays"))
	if dueDays < 0 || dueDays > 90 {
		dueDays = 10
	}
	if _, err := billing.GenerateMonthlyInvoices(a.gormDB, now, dueDays); err != nil {
		zap.S().Error("monthly invoice generation failed", zap.Error(err))
		return
	}
	if !a.GetSettingsBoolValue("isp", "AutoSuspend") {
		return
	}
	if err := billing.ProcessOverdueInvoices(a.gormDB, now); err != nil {
		zap.S().Error("overdue invoice processing failed", zap.Error(err))
		return
	}
	if err := billing.SuspendOverdueSubscriptions(a.gormDB, now); err != nil {
		zap.S().Error("overdue subscription suspension failed", zap.Error(err))
		return
	}
	handler := a.sessionDisconnectHandler()
	if handler == nil {
		return
	}
	var subs []domain.Subscription
	if err := a.gormDB.Where("status = ? AND suspension_reason = ?", domain.SubscriptionSuspended, domain.SuspensionBillingOverdue).Find(&subs).Error; err != nil {
		zap.S().Error("billing-suspended subscription query failed", zap.Error(err))
		return
	}
	for _, sub := range subs {
		var user domain.RadiusUser
		if sub.RadiusUserID == 0 || a.gormDB.First(&user, sub.RadiusUserID).Error != nil {
			continue
		}
		var sessions []domain.RadiusOnline
		if err := a.gormDB.Where("username = ?", user.Username).Find(&sessions).Error; err != nil {
			zap.S().Warn("could not load online sessions for billing suspension", zap.Error(err))
			continue
		}
		for _, session := range sessions {
			if err := handler(context.Background(), session); err != nil {
				zap.S().Warn("billing suspension disconnect failed", zap.String("username", user.Username), zap.Error(err))
			}
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
// It performs two independent cleanups:
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
// Any panic is recovered and logged so a cleanup failure never crashes the
// scheduler goroutine.
func (a *Application) SchedClearExpireData() {
	defer func() {
		if err := recover(); err != nil {
			zap.S().Error(err)
		}
	}()

	// Reclaim dangling online sessions. A healthy session refreshes every
	// AcctInterimInterval, so only delete rows that have missed several updates
	// to avoid dropping live sessions.
	interim := a.ConfigMgr().GetInt("radius", "AcctInterimInterval")
	if interim <= 0 {
		interim = 300
	}
	onlineStaleWindow := time.Duration(interim*3) * time.Second
	a.gormDB.Where("last_update <= ?",
		time.Now().Add(-onlineStaleWindow)).
		Delete(&domain.RadiusOnline{})

	// Clean up accounting history. radius.AccountingHistoryDays is the retention
	// window in days; 0 disables accounting cleanup (matching the config schema's
	// "0=disabled" semantics), so a missing or zero value never silently purges
	// data. The acct_stop_time > epoch guard excludes active sessions, whose
	// AcctStopTime is the zero value (0001-01-01) until Accounting-Stop and would
	// otherwise sort before every cutoff and be deleted immediately.
	idays := a.ConfigMgr().GetInt("radius", "AccountingHistoryDays")
	if idays > 0 {
		cutoff := time.Now().Add(-time.Hour * 24 * time.Duration(idays))
		a.gormDB.
			Where("acct_stop_time > ? AND acct_stop_time < ?", time.Unix(0, 0), cutoff).
			Delete(domain.RadiusAccounting{})
	}
}
