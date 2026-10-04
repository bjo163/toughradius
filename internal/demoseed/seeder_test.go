package demoseed

import (
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"github.com/talkincode/toughradius/v9/internal/billing"
	"github.com/talkincode/toughradius/v9/internal/domain"
	"gorm.io/gorm"
)

func TestDemoSeederCreatesRepeatableBusinessSamplesWithoutLiveData(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(domain.Tables...))

	user := domain.Customer{CustomerNo: "MWX-999999", Name: "Real customer", Status: domain.CustomerActive, Notes: "keep me"}
	require.NoError(t, db.Create(&user).Error)
	now := time.Date(2026, time.October, 4, 10, 0, 0, 0, time.UTC)
	seeder := &demoSeeder{db: db, now: now, historyDays: 1}
	require.NoError(t, seeder.run())
	assertSampleCounts(t, db)
	require.NoError(t, seeder.run())
	assertSampleCounts(t, db)

	var preserved domain.Customer
	require.NoError(t, db.First(&preserved, user.ID).Error)
	require.Equal(t, "keep me", preserved.Notes)
	var liveSessions int64
	require.NoError(t, db.Model(&domain.RadiusOnline{}).Count(&liveSessions).Error)
	require.Zero(t, liveSessions)
	var enabledTargets int64
	require.NoError(t, db.Model(&domain.NetMonitorTarget{}).Where("enabled = ?", true).Count(&enabledTargets).Error)
	require.Zero(t, enabledTargets)
	var enabledNAS int64
	require.NoError(t, db.Model(&domain.NetNas{}).Where("remark = ? AND status = ?", demoMarker, "enabled").Count(&enabledNAS).Error)
	require.Zero(t, enabledNAS, "sample NAS records must not authenticate against a real network")
	var enabledSampleUsers int64
	require.NoError(t, db.Model(&domain.RadiusUser{}).Where("remark = ? AND status = ?", demoMarker, "enabled").Count(&enabledSampleUsers).Error)
	require.Zero(t, enabledSampleUsers, "sample credentials must not be usable until an operator explicitly enables them")
	var sampleTargets int64
	require.NoError(t, db.Model(&domain.NetMonitorTarget{}).Where("name LIKE ?", "demo-monitor-%").Count(&sampleTargets).Error)
	require.EqualValues(t, 3, sampleTargets)
	var sampleCustomers []domain.Customer
	require.NoError(t, db.Where("notes = ? AND name LIKE ?", demoMarker, "Sample %").Find(&sampleCustomers).Error)
	require.Len(t, sampleCustomers, 6)
	for _, customer := range sampleCustomers {
		require.Regexp(t, `^MWX-\d{6}$`, customer.CustomerNo)
	}
	var subscriptions []domain.Subscription
	require.NoError(t, db.Where("subscription_no LIKE ?", "SUB-%").Find(&subscriptions).Error)
	require.Len(t, subscriptions, 6)
	for _, subscription := range subscriptions {
		require.Regexp(t, `^SUB-\d{6}$`, subscription.SubscriptionNo)
	}
	var invoices []domain.Invoice
	require.NoError(t, db.Where("notes = ?", demoMarker).Find(&invoices).Error)
	require.Len(t, invoices, 6)
	var payments []domain.Payment
	require.NoError(t, db.Where("notes = ?", demoMarker).Find(&payments).Error)
	require.Len(t, payments, 3)
	for _, payment := range payments {
		require.Regexp(t, `^PAY-202610-\d{6}$`, payment.PaymentNo)
	}
	var protectedInvoice domain.Invoice
	require.NoError(t, db.Where("notes = ?", demoMarker).Order("subscription_id").Offset(3).First(&protectedInvoice).Error)
	operatorPayment := domain.Payment{InvoiceID: protectedInvoice.ID, Amount: protectedInvoice.Balance, Method: "bank_transfer", Notes: "operator record"}
	require.NoError(t, billing.RecordPayment(db, &operatorPayment, now, false))

	require.NoError(t, seeder.clean())
	var retainedInvoices []domain.Invoice
	require.NoError(t, db.Where("notes = ?", demoMarker).Find(&retainedInvoices).Error)
	require.Len(t, retainedInvoices, 1, "invoice with an operator payment must be retained")
	var retainedPayment domain.Payment
	require.NoError(t, db.First(&retainedPayment, operatorPayment.ID).Error)
	require.Equal(t, "operator record", retainedPayment.Notes)
	var retainedSubscriptions int64
	require.NoError(t, db.Model(&domain.Subscription{}).Where("customer_id = ?", protectedInvoice.CustomerID).Count(&retainedSubscriptions).Error)
	require.EqualValues(t, 1, retainedSubscriptions)
	var retainedPackages int64
	require.NoError(t, db.Model(&domain.InternetPackage{}).Where("code LIKE ?", "DEMO-PKG-%").Count(&retainedPackages).Error)
	require.EqualValues(t, 1, retainedPackages)
	require.NoError(t, db.First(&preserved, user.ID).Error)
	require.Equal(t, "keep me", preserved.Notes)
}

func assertSampleCounts(t *testing.T, db *gorm.DB) {
	t.Helper()
	counts := []struct {
		model interface{}
		where string
		args  []interface{}
		want  int64
	}{
		{&domain.NetNode{}, "remark = ?", []interface{}{demoMarker}, 3},
		{&domain.NetNas{}, "remark = ?", []interface{}{demoMarker}, 3},
		{&domain.RadiusProfile{}, "remark = ?", []interface{}{demoMarker}, 3},
		{&domain.RadiusUser{}, "remark = ?", []interface{}{demoMarker}, 6},
		{&domain.Customer{}, "notes = ?", []interface{}{demoMarker}, 6},
		{&domain.InternetPackage{}, "code LIKE ?", []interface{}{"DEMO-PKG-%"}, 3},
		{&domain.Subscription{}, "subscription_no LIKE ?", []interface{}{"SUB-%"}, 6},
		{&domain.Invoice{}, "notes = ?", []interface{}{demoMarker}, 6},
		{&domain.Payment{}, "notes = ?", []interface{}{demoMarker}, 3},
	}
	for _, item := range counts {
		var count int64
		require.NoError(t, db.Model(item.model).Where(item.where, item.args...).Count(&count).Error)
		require.Equalf(t, item.want, count, "unexpected sample count for %T", item.model)
	}
}
