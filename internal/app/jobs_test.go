package app

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/bjo163/mwx-isp/config"
	"github.com/bjo163/mwx-isp/internal/billing"
	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/internal/tenancy"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestRunBillingForTenantScopesInvoiceGenerationAndDisconnect(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, tenancy.RegisterCallbacks(db))
	require.NoError(t, db.AutoMigrate(
		&domain.Customer{}, &domain.InternetPackage{}, &domain.Subscription{}, &domain.Invoice{},
		&domain.InvoiceItem{}, &domain.BillingEvent{}, &domain.RadiusUser{}, &domain.RadiusOnline{},
		&domain.DocumentSequence{},
	))

	now := time.Date(2026, time.October, 1, 0, 0, 0, 0, time.UTC)
	for _, tenantID := range []int64{10, 20} {
		ctx := tenancy.WithTenantID(context.Background(), tenantID)
		tenantDB := db.WithContext(ctx)
		customer := domain.Customer{Name: "Same Name", Status: domain.CustomerActive}
		require.NoError(t, tenantDB.Create(&customer).Error)
		pkg := domain.InternetPackage{Code: "HOME", Name: "Home", Price: 150000, RadiusProfileID: 1, BillingCycle: "monthly", Status: "active"}
		require.NoError(t, tenantDB.Create(&pkg).Error)
		user := domain.RadiusUser{Username: "shared-user", Password: "secret", Status: "enabled"}
		require.NoError(t, tenantDB.Create(&user).Error)
		sub := domain.Subscription{SubscriptionNo: "SUB-001", CustomerID: customer.ID, PackageID: pkg.ID,
			RadiusUserID: user.ID, Status: domain.SubscriptionActive, StartDate: now.AddDate(0, -1, 0), BillingDay: 1}
		require.NoError(t, tenantDB.Create(&sub).Error)
		session := domain.RadiusOnline{Username: user.Username, AcctSessionId: fmt.Sprintf("session-%d", tenantID)}
		require.NoError(t, tenantDB.Create(&session).Error)
	}

	var disconnectedTenantIDs []int64
	a := &Application{gormDB: db}
	a.SetSessionDisconnectHandler(func(ctx context.Context, session domain.RadiusOnline) error {
		tenantID, ok := tenancy.TenantID(ctx)
		require.True(t, ok)
		disconnectedTenantIDs = append(disconnectedTenantIDs, tenantID)
		return nil
	})
	// Mark tenant 10's subscription overdue so this run suspends and disconnects
	// only tenant 10's duplicate username session.
	tenantA := db.WithContext(tenancy.WithTenantID(context.Background(), 10))
	var sub domain.Subscription
	require.NoError(t, tenantA.First(&sub).Error)
	_, err = billing.GenerateMonthlyInvoices(tenantA, now, 10)
	require.NoError(t, err)
	var invoice domain.Invoice
	require.NoError(t, tenantA.First(&invoice).Error)
	require.NoError(t, tenantA.Model(&invoice).Update("due_date", now.AddDate(0, 0, -5)).Error)

	require.NoError(t, a.runBillingForTenant(10, now, 10, true))
	require.Equal(t, []int64{10}, disconnectedTenantIDs)

	var tenantAInvoices, tenantBInvoices []domain.Invoice
	require.NoError(t, db.WithContext(tenancy.WithTenantID(context.Background(), 10)).Find(&tenantAInvoices).Error)
	require.NoError(t, db.WithContext(tenancy.WithTenantID(context.Background(), 20)).Find(&tenantBInvoices).Error)
	require.Len(t, tenantAInvoices, 1)
	require.Empty(t, tenantBInvoices, "tenant A billing must not generate invoices for tenant B")
}

// TestSchedClearExpireData verifies the daily cleanup removes only genuinely
// stale rows: radius_online sessions that have missed several interim updates,
// and terminated radius_accounting rows whose AcctStopTime predates the
// retention window. Live sessions (recent online rows) and active accounting
// rows (zero AcctStopTime) must always survive.
func TestSchedClearExpireData(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, tenancy.RegisterCallbacks(db))
	require.NoError(t, db.AutoMigrate(&domain.Tenant{}, &domain.SysOprLog{}, &domain.RadiusOnline{}, &domain.RadiusAccounting{}))

	now := time.Now()
	for _, tenantID := range []int64{10, 20} {
		tenant := domain.Tenant{ID: tenantID, Name: fmt.Sprintf("Tenant %d", tenantID), Slug: fmt.Sprintf("tenant-%d", tenantID), Kind: "isp", Status: "active"}
		require.NoError(t, db.Create(&tenant).Error)
		tenantDB := db.WithContext(tenancy.WithTenantID(context.Background(), tenantID))
		// Each tenant may reuse session identifiers. Retention must delete stale
		// data in both organizations while preserving recent/active records.
		require.NoError(t, tenantDB.Create(&domain.RadiusOnline{Username: "dangling", AcctSessionId: "same-session", LastUpdate: now.Add(-20 * time.Minute)}).Error)
		require.NoError(t, tenantDB.Create(&domain.RadiusOnline{Username: "live-recent", AcctSessionId: "live-recent", LastUpdate: now.Add(-60 * time.Second)}).Error)
		require.NoError(t, tenantDB.Create(&domain.RadiusOnline{Username: "live-quiet", AcctSessionId: "live-quiet", LastUpdate: now.Add(-10 * time.Minute)}).Error)
		require.NoError(t, tenantDB.Create(&domain.RadiusAccounting{Username: "old-stopped", AcctStopTime: now.AddDate(0, 0, -40)}).Error)
		require.NoError(t, tenantDB.Create(&domain.RadiusAccounting{Username: "recent-stopped", AcctStopTime: now.AddDate(0, 0, -5)}).Error)
		require.NoError(t, tenantDB.Create(&domain.RadiusAccounting{Username: "active", AcctStartTime: now.AddDate(0, 0, -40)}).Error)
		require.NoError(t, tenantDB.Create(&domain.SysOprLog{OprName: fmt.Sprintf("old-%d", tenantID), OptTime: now.AddDate(-2, 0, 0)}).Error)
		require.NoError(t, tenantDB.Create(&domain.SysOprLog{OprName: fmt.Sprintf("recent-%d", tenantID), OptTime: now.AddDate(0, 0, -10)}).Error)
	}

	cm := &ConfigManager{
		configs: map[string]string{"radius.AccountingHistoryDays": "30"},
		schemas: make(map[string]*ConfigSchema),
	}
	a := &Application{gormDB: db, configManager: cm}

	a.SchedClearExpireData()

	require.ElementsMatch(t, []string{"live-recent", "live-quiet", "live-recent", "live-quiet"}, onlineUsernames(t, db),
		"stale sessions should be removed in every tenant; live sessions must remain")
	require.ElementsMatch(t, []string{"recent-stopped", "active", "recent-stopped", "active"}, accountingUsernames(t, db),
		"old accounting rows should be pruned in every tenant; recent and active rows must remain")
	var auditLogs []domain.SysOprLog
	require.NoError(t, db.Find(&auditLogs).Error)
	require.Len(t, auditLogs, 2)
	assert.ElementsMatch(t, []string{"recent-10", "recent-20"}, []string{auditLogs[0].OprName, auditLogs[1].OprName},
		"old operator audit rows should be pruned independently in every tenant")
}

// TestSchedClearExpireData_DisabledRetention verifies that AccountingHistoryDays=0
// disables accounting cleanup (matching the config schema's "0=disabled"), so even
// very old terminated rows and active rows are kept — while the independent
// radius_online cleanup still removes dangling sessions.
func TestSchedClearExpireData_DisabledRetention(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, tenancy.RegisterCallbacks(db))
	require.NoError(t, db.AutoMigrate(&domain.Tenant{}, &domain.SysOprLog{}, &domain.RadiusOnline{}, &domain.RadiusAccounting{}))

	now := time.Now()
	require.NoError(t, db.Create(&domain.RadiusAccounting{
		Username: "ancient", AcctStopTime: now.AddDate(0, 0, -1000),
	}).Error)
	require.NoError(t, db.Create(&domain.RadiusAccounting{
		Username: "active", AcctStartTime: now.AddDate(0, 0, -1000),
	}).Error)
	require.NoError(t, db.Create(&domain.RadiusOnline{
		Username: "dangling", AcctSessionId: "sess-dangling", LastUpdate: now.Add(-20 * time.Minute),
	}).Error)

	cm := &ConfigManager{
		configs: map[string]string{"radius.AccountingHistoryDays": "0"},
		schemas: make(map[string]*ConfigSchema),
	}
	a := &Application{gormDB: db, configManager: cm}

	a.SchedClearExpireData()

	require.ElementsMatch(t, []string{"ancient", "active"}, accountingUsernames(t, db),
		"AccountingHistoryDays=0 must disable accounting cleanup entirely")

	var onlineCount int64
	require.NoError(t, db.Model(&domain.RadiusOnline{}).Count(&onlineCount).Error)
	require.Equal(t, int64(0), onlineCount, "online cleanup runs regardless of AccountingHistoryDays")
}

func onlineUsernames(t *testing.T, db *gorm.DB) []string {
	t.Helper()
	var rows []domain.RadiusOnline
	require.NoError(t, db.Find(&rows).Error)
	names := make([]string, 0, len(rows))
	for _, r := range rows {
		names = append(names, r.Username)
	}
	return names
}

func accountingUsernames(t *testing.T, db *gorm.DB) []string {
	t.Helper()
	var rows []domain.RadiusAccounting
	require.NoError(t, db.Find(&rows).Error)
	names := make([]string, 0, len(rows))
	for _, r := range rows {
		names = append(names, r.Username)
	}
	return names
}

// TestInitJobRegistersCleanup is the regression guard for M6.4: SchedClearExpireData
// was defined but never registered with cron, so expired online/accounting data was
// never auto-purged. initJob schedules monitor, tenant-aware retention and
// billing and subscriber FUP jobs (4 cron entries total).
func TestInitJobRegistersCleanup(t *testing.T) {
	a := &Application{appConfig: &config.AppConfig{}}
	a.initJob()
	defer a.sched.Stop()

	require.Len(t, a.sched.Entries(), 4,
		"expected monitor, tenant-aware retention, billing and FUP cron entries")
}
