package billing

import (
	"errors"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"github.com/bjo163/mwx-isp/internal/domain"
	"gorm.io/gorm"
)

func billingTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&domain.Customer{}, &domain.InternetPackage{}, &domain.Subscription{},
		&domain.Invoice{}, &domain.InvoiceItem{}, &domain.Payment{},
		&domain.BillingEvent{}, &domain.RadiusUser{},
		&domain.DocumentSequence{},
	))
	return db
}

func TestGenerateMonthlyInvoicesIsIdempotent(t *testing.T) {
	db := billingTestDB(t)
	loc, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)
	now := time.Date(2026, time.October, 1, 0, 0, 0, 0, loc)
	customer := domain.Customer{Name: "Customer One", Status: domain.CustomerActive}
	require.NoError(t, db.Create(&customer).Error)
	pkg := domain.InternetPackage{Code: "HOME-10", Name: "Home 10 Mbps", Price: 150000, RadiusProfileID: 1, BillingCycle: "monthly", Status: "active"}
	require.NoError(t, db.Create(&pkg).Error)
	sub := domain.Subscription{CustomerID: customer.ID, PackageID: pkg.ID, Status: domain.SubscriptionActive,
		StartDate: now.AddDate(0, -1, 0), BillingDay: 1, GraceDays: 3}
	require.NoError(t, db.Create(&sub).Error)

	created, err := GenerateMonthlyInvoices(db, now, 10)
	require.NoError(t, err)
	require.Equal(t, 1, created)
	created, err = GenerateMonthlyInvoices(db, now.Add(time.Hour), 10)
	require.NoError(t, err)
	require.Zero(t, created)

	var invoice domain.Invoice
	require.NoError(t, db.Where("subscription_id = ?", sub.ID).First(&invoice).Error)
	require.Equal(t, "INV-202610-000001", invoice.InvoiceNo)
	require.Equal(t, int64(150000), invoice.Total)
	require.Equal(t, int64(150000), invoice.Balance)
	require.True(t, time.Date(2026, time.October, 11, 0, 0, 0, 0, loc).Equal(invoice.DueDate))
	var item domain.InvoiceItem
	require.NoError(t, db.Where("invoice_id = ?", invoice.ID).First(&item).Error)
	require.Equal(t, int64(150000), item.UnitPrice)
	require.Equal(t, "Home 10 Mbps", item.Description)

	created, err = GenerateMonthlyInvoices(db, now.AddDate(0, 1, 0), 10)
	require.NoError(t, err)
	require.Equal(t, 1, created)
	var november domain.Invoice
	require.NoError(t, db.Where("subscription_id = ? AND invoice_date = ?", sub.ID, now.AddDate(0, 1, 0)).First(&november).Error)
	require.Equal(t, "INV-202611-000001", november.InvoiceNo)
}

func TestRecordPaymentPartialAndAutoReactivation(t *testing.T) {
	db := billingTestDB(t)
	now := time.Date(2026, time.October, 15, 10, 0, 0, 0, time.UTC)
	customer := domain.Customer{Name: "Customer Two", Status: domain.CustomerActive}
	require.NoError(t, db.Create(&customer).Error)
	user := domain.RadiusUser{Username: "subscriber-2", Password: "secret", Status: "disabled"}
	require.NoError(t, db.Create(&user).Error)
	sub := domain.Subscription{SubscriptionNo: "SUB-000002", CustomerID: customer.ID, RadiusUserID: user.ID,
		Status: domain.SubscriptionSuspended, SuspensionReason: domain.SuspensionBillingOverdue,
		StartDate: now.AddDate(0, -1, 0), BillingDay: 1, GraceDays: 3}
	require.NoError(t, db.Create(&sub).Error)
	invoice := domain.Invoice{InvoiceNo: "INV-202610-000002", CustomerID: customer.ID, SubscriptionID: sub.ID,
		InvoiceDate: now.AddDate(0, 0, -14), DueDate: now.AddDate(0, 0, -4), PeriodStart: now.AddDate(0, 0, -14),
		PeriodEnd: now.AddDate(0, 0, 16), Subtotal: 350000, Total: 350000, Balance: 350000, Status: domain.InvoiceOverdue}
	require.NoError(t, db.Create(&invoice).Error)

	first := domain.Payment{InvoiceID: invoice.ID, Amount: 100000, Method: "cash"}
	require.NoError(t, RecordPayment(db, &first, now, true))
	require.Equal(t, "PAY-202610-000001", first.PaymentNo)
	var updated domain.Invoice
	require.NoError(t, db.First(&updated, invoice.ID).Error)
	require.Equal(t, domain.InvoicePartial, updated.Status)
	require.Equal(t, int64(250000), updated.Balance)

	tooMuch := domain.Payment{InvoiceID: invoice.ID, Amount: 250001, Method: "cash"}
	require.ErrorIs(t, RecordPayment(db, &tooMuch, now, true), ErrInvalidPayment)

	last := domain.Payment{InvoiceID: invoice.ID, Amount: 250000, Method: "bank_transfer"}
	require.NoError(t, RecordPayment(db, &last, now.Add(time.Minute), true))
	require.NoError(t, db.First(&updated, invoice.ID).Error)
	require.Equal(t, domain.InvoicePaid, updated.Status)
	require.Zero(t, updated.Balance)
	require.NoError(t, db.First(&sub, sub.ID).Error)
	require.Equal(t, domain.SubscriptionActive, sub.Status)
	require.Empty(t, sub.SuspensionReason)
	require.NoError(t, db.First(&user, user.ID).Error)
	require.Equal(t, "enabled", user.Status)

	novemberInvoice := domain.Invoice{InvoiceNo: "INV-202611-000099", CustomerID: customer.ID, Total: 1000, Balance: 1000, Status: domain.InvoiceIssued, InvoiceDate: now.AddDate(0, 1, 0), DueDate: now.AddDate(0, 1, 10)}
	require.NoError(t, db.Create(&novemberInvoice).Error)
	novemberPayment := domain.Payment{InvoiceID: novemberInvoice.ID, Amount: 1000, Method: "cash"}
	require.NoError(t, RecordPayment(db, &novemberPayment, now.AddDate(0, 1, 0), false))
	require.Equal(t, "PAY-202611-000001", novemberPayment.PaymentNo)
}

func TestRecordPaymentDoesNotReactivateManualSuspension(t *testing.T) {
	db := billingTestDB(t)
	now := time.Date(2026, time.October, 15, 10, 0, 0, 0, time.UTC)
	customer := domain.Customer{Name: "Manual Suspension", Status: domain.CustomerActive}
	require.NoError(t, db.Create(&customer).Error)
	user := domain.RadiusUser{Username: "manual-user", Password: "secret", Status: "disabled"}
	require.NoError(t, db.Create(&user).Error)
	sub := domain.Subscription{SubscriptionNo: "SUB-MANUAL", CustomerID: customer.ID, RadiusUserID: user.ID,
		Status: domain.SubscriptionSuspended, SuspensionReason: "manual", StartDate: now, BillingDay: 1, GraceDays: 3}
	require.NoError(t, db.Create(&sub).Error)
	invoice := domain.Invoice{InvoiceNo: "INV-MANUAL", CustomerID: customer.ID, SubscriptionID: sub.ID,
		InvoiceDate: now, DueDate: now.AddDate(0, 0, 10), PeriodStart: now, PeriodEnd: now.AddDate(0, 1, -1),
		Total: 1000, Balance: 1000, Status: domain.InvoiceIssued}
	require.NoError(t, db.Create(&invoice).Error)

	payment := domain.Payment{InvoiceID: invoice.ID, Amount: 1000, Method: "manual"}
	require.NoError(t, RecordPayment(db, &payment, now, true))
	require.NoError(t, db.First(&sub, sub.ID).Error)
	require.Equal(t, domain.SubscriptionSuspended, sub.Status)
	require.Equal(t, "manual", sub.SuspensionReason)
	require.NoError(t, db.First(&user, user.ID).Error)
	require.Equal(t, "disabled", user.Status)
}

func TestProcessOverdueAndSuspendAfterGrace(t *testing.T) {
	db := billingTestDB(t)
	now := time.Date(2026, time.October, 15, 12, 0, 0, 0, time.UTC)
	customer := domain.Customer{Name: "Overdue Customer", Status: domain.CustomerActive}
	require.NoError(t, db.Create(&customer).Error)
	user := domain.RadiusUser{Username: "overdue-user", Password: "secret", Status: "enabled"}
	require.NoError(t, db.Create(&user).Error)
	sub := domain.Subscription{SubscriptionNo: "SUB-OVERDUE", CustomerID: customer.ID, RadiusUserID: user.ID,
		Status: domain.SubscriptionActive, StartDate: now.AddDate(0, -1, 0), BillingDay: 1, GraceDays: 3}
	require.NoError(t, db.Create(&sub).Error)
	invoice := domain.Invoice{InvoiceNo: "INV-OVERDUE", CustomerID: customer.ID, SubscriptionID: sub.ID,
		InvoiceDate: now.AddDate(0, 0, -14), DueDate: time.Date(2026, time.October, 11, 0, 0, 0, 0, time.UTC),
		PeriodStart: now.AddDate(0, 0, -14), PeriodEnd: now.AddDate(0, 0, 16), Total: 2000, Balance: 2000, Status: domain.InvoiceIssued}
	require.NoError(t, db.Create(&invoice).Error)

	require.NoError(t, ProcessOverdueInvoices(db, now))
	require.NoError(t, SuspendOverdueSubscriptions(db, now))
	require.NoError(t, db.First(&invoice, invoice.ID).Error)
	require.Equal(t, domain.InvoiceOverdue, invoice.Status)
	require.NoError(t, db.First(&sub, sub.ID).Error)
	require.Equal(t, domain.SubscriptionSuspended, sub.Status)
	require.Equal(t, domain.SuspensionBillingOverdue, sub.SuspensionReason)
	require.NoError(t, db.First(&user, user.ID).Error)
	require.Equal(t, "disabled", user.Status)

	// A billing-suspended subscription with a remaining balance cannot be
	// suspended a second time or have its original event duplicated.
	require.NoError(t, SuspendOverdueSubscriptions(db, now.Add(time.Hour)))
	var suspensions int64
	require.NoError(t, db.Model(&domain.BillingEvent{}).Where("subscription_id = ? AND type = ?", sub.ID, "subscription_suspended").Count(&suspensions).Error)
	require.EqualValues(t, 1, suspensions)
}

func TestRecordPaymentRejectsClosedInvoice(t *testing.T) {
	db := billingTestDB(t)
	invoice := domain.Invoice{InvoiceNo: "INV-CLOSED", Total: 100, Balance: 0, PaidAmount: 100, Status: domain.InvoicePaid}
	require.NoError(t, db.Create(&invoice).Error)
	payment := domain.Payment{InvoiceID: invoice.ID, Amount: 1, Method: "cash"}
	err := RecordPayment(db, &payment, time.Now(), true)
	require.True(t, errors.Is(err, ErrInvoiceClosed))
	var count int64
	require.NoError(t, db.Model(&domain.Payment{}).Count(&count).Error)
	require.Zero(t, count)
}
