package app

import (
	"testing"
	"time"

	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/pkg/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestMigrateDBBackfillsDefaultTenantAndReplacesLegacyUniqueKeys(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:tenant-migration?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.Exec(`CREATE TABLE radius_user (id INTEGER PRIMARY KEY, username TEXT NOT NULL)`).Error)
	require.NoError(t, db.Exec(`CREATE UNIQUE INDEX idx_radius_user_username ON radius_user(username)`).Error)
	require.NoError(t, db.Exec(`INSERT INTO radius_user (id, username) VALUES (101, 'same-name')`).Error)
	require.NoError(t, db.Exec(`CREATE TABLE radius_online (id INTEGER PRIMARY KEY, acct_session_id TEXT NOT NULL)`).Error)
	require.NoError(t, db.Exec(`CREATE UNIQUE INDEX udx_radius_online_acct_session_id ON radius_online(acct_session_id)`).Error)
	require.NoError(t, db.Exec(`INSERT INTO radius_online (id, acct_session_id) VALUES (201, 'session-1')`).Error)

	a := &Application{gormDB: db}
	require.NoError(t, a.MigrateDB(false))

	var migratedUser domain.RadiusUser
	require.NoError(t, db.First(&migratedUser, 101).Error)
	require.Equal(t, domain.DefaultTenantID, migratedUser.TenantID)
	require.True(t, db.Migrator().HasIndex(&domain.RadiusUser{}, "udx_radius_user_tenant_username"))
	require.False(t, db.Migrator().HasIndex(&domain.RadiusUser{}, "idx_radius_user_username"))
	require.True(t, db.Migrator().HasIndex(&domain.RadiusOnline{}, "udx_radius_online_tenant_session"))
	require.False(t, db.Migrator().HasIndex(&domain.RadiusOnline{}, "udx_radius_online_acct_session_id"))

	var defaultTenant domain.Tenant
	require.NoError(t, db.First(&defaultTenant, domain.DefaultTenantID).Error)
	require.Equal(t, "default", defaultTenant.Slug)

	otherTenant := domain.Tenant{ID: 2, Name: "Second ISP", Slug: "second", Kind: "isp", Status: "active"}
	require.NoError(t, db.Create(&otherTenant).Error)
	user := domain.RadiusUser{ID: common.UUIDint64(), TenantID: otherTenant.ID, Username: migratedUser.Username}
	require.NoError(t, db.Create(&user).Error, "same RADIUS username must be allowed in a different tenant")
	duplicate := domain.RadiusUser{ID: common.UUIDint64(), TenantID: otherTenant.ID, Username: migratedUser.Username}
	require.Error(t, db.Create(&duplicate).Error, "same RADIUS username must remain unique inside a tenant")

	otherSession := domain.RadiusOnline{ID: common.UUIDint64(), TenantID: otherTenant.ID, AcctSessionId: "session-1"}
	require.NoError(t, db.Create(&otherSession).Error, "session IDs may overlap across tenants")

	now := time.Now()
	customer := domain.Customer{ID: common.UUIDint64(), TenantID: domain.DefaultTenantID, CustomerNo: "MWX-000001", Name: "Default customer"}
	require.NoError(t, db.Create(&customer).Error)
	require.NoError(t, db.Create(&domain.Customer{ID: common.UUIDint64(), TenantID: otherTenant.ID, CustomerNo: customer.CustomerNo, Name: "Tenant customer"}).Error)
	require.Error(t, db.Create(&domain.Customer{ID: common.UUIDint64(), TenantID: domain.DefaultTenantID, CustomerNo: customer.CustomerNo, Name: "Duplicate customer"}).Error)

	pkg := domain.InternetPackage{ID: common.UUIDint64(), TenantID: domain.DefaultTenantID, Code: "PKG-000001", Name: "Default package", Price: 100, RadiusProfileID: 1, BillingCycle: "monthly", Status: "active"}
	require.NoError(t, db.Create(&pkg).Error)
	require.NoError(t, db.Create(&domain.InternetPackage{ID: common.UUIDint64(), TenantID: otherTenant.ID, Code: pkg.Code, Name: "Tenant package", Price: 100, RadiusProfileID: 1, BillingCycle: "monthly", Status: "active"}).Error)

	sub := domain.Subscription{ID: common.UUIDint64(), TenantID: domain.DefaultTenantID, SubscriptionNo: "SUB-000001", CustomerID: customer.ID, PackageID: pkg.ID, Status: domain.SubscriptionActive, StartDate: now, BillingDay: 1, GraceDays: 3}
	require.NoError(t, db.Create(&sub).Error)
	require.NoError(t, db.Create(&domain.Subscription{ID: common.UUIDint64(), TenantID: otherTenant.ID, SubscriptionNo: sub.SubscriptionNo, CustomerID: customer.ID, PackageID: pkg.ID, Status: domain.SubscriptionActive, StartDate: now, BillingDay: 1, GraceDays: 3}).Error)

	invoice := domain.Invoice{ID: common.UUIDint64(), TenantID: domain.DefaultTenantID, InvoiceNo: "INV-202610-000001", CustomerID: customer.ID, SubscriptionID: sub.ID, InvoiceDate: now, DueDate: now, PeriodStart: now, PeriodEnd: now.AddDate(0, 1, 0), Subtotal: 100, Total: 100, Balance: 100, Status: domain.InvoiceIssued}
	require.NoError(t, db.Create(&invoice).Error)
	require.NoError(t, db.Create(&domain.Invoice{ID: common.UUIDint64(), TenantID: otherTenant.ID, InvoiceNo: invoice.InvoiceNo, CustomerID: customer.ID, SubscriptionID: sub.ID, InvoiceDate: now, DueDate: now, PeriodStart: now, PeriodEnd: now.AddDate(0, 1, 0), Subtotal: 100, Total: 100, Balance: 100, Status: domain.InvoiceIssued}).Error)

	payment := domain.Payment{ID: common.UUIDint64(), TenantID: domain.DefaultTenantID, PaymentNo: "PAY-202610-000001", CustomerID: customer.ID, InvoiceID: invoice.ID, Amount: 100, Method: "manual", PaidAt: now, Status: domain.PaymentReceived}
	require.NoError(t, db.Create(&payment).Error)
	require.NoError(t, db.Create(&domain.Payment{ID: common.UUIDint64(), TenantID: otherTenant.ID, PaymentNo: payment.PaymentNo, CustomerID: customer.ID, InvoiceID: invoice.ID, Amount: 100, Method: "manual", PaidAt: now, Status: domain.PaymentReceived}).Error)

	require.NoError(t, db.Create(&domain.DocumentSequence{TenantID: domain.DefaultTenantID, Kind: "invoice", Period: "202610", Value: 2}).Error)
	require.NoError(t, db.Create(&domain.DocumentSequence{TenantID: otherTenant.ID, Kind: "invoice", Period: "202610", Value: 2}).Error)

	target := domain.NetMonitorTarget{ID: common.UUIDint64(), TenantID: domain.DefaultTenantID, Name: "router", Kind: "nas", Address: "192.0.2.1", ProbeType: "icmp", IntervalSeconds: 60, TimeoutMilliseconds: 1500, FailureThreshold: 2}
	require.NoError(t, db.Create(&target).Error)
	require.NoError(t, db.Create(&domain.NetMonitorTarget{ID: common.UUIDint64(), TenantID: otherTenant.ID, Name: target.Name, Kind: target.Kind, Address: "192.0.2.2", ProbeType: "icmp", IntervalSeconds: 60, TimeoutMilliseconds: 1500, FailureThreshold: 2}).Error)

	outbox := domain.NotificationOutbox{ID: common.UUIDint64(), TenantID: domain.DefaultTenantID, DedupeKey: "event:recipient", EventType: "test", Recipient: "+628123456789", Body: "sample", Status: "pending", NextAttemptAt: now}
	require.NoError(t, db.Create(&outbox).Error)
	require.NoError(t, db.Create(&domain.NotificationOutbox{ID: common.UUIDint64(), TenantID: otherTenant.ID, DedupeKey: outbox.DedupeKey, EventType: outbox.EventType, Recipient: outbox.Recipient, Body: outbox.Body, Status: outbox.Status, NextAttemptAt: now}).Error)

	require.NoError(t, a.MigrateDB(false), "migration must be idempotent")
	var userCount int64
	require.NoError(t, db.Model(&domain.RadiusUser{}).Count(&userCount).Error)
	require.Equal(t, int64(2), userCount)
}
