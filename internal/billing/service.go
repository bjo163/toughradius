package billing

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/bjo163/mwx-isp/internal/domain"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	// ErrInvalidPayment indicates that a payment is non-positive or exceeds the remaining invoice balance.
	ErrInvalidPayment = errors.New("payment must be positive and no greater than invoice balance")
	// ErrInvoiceClosed indicates that an invoice is void, paid, or otherwise has no remaining balance.
	ErrInvoiceClosed = errors.New("invoice cannot accept payment in its current state")
)

// GenerateMonthlyInvoices creates an invoice for every active subscription
// whose billing day has arrived in the current month and whose start date is not
// later than that day. The period begins on the billing day and ends the day
// before the next billing month. dueDays is limited to 0..90 and determines the
// invoice due date. A unique subscription/period constraint makes repeated
// calls idempotent. The function returns the number of inserted invoices and
// the first database error; callers should run it from a single scheduler.
func GenerateMonthlyInvoices(db *gorm.DB, now time.Time, dueDays int) (int, error) {
	return generateMonthlyInvoices(db, now, dueDays, nil)
}

// GenerateMonthlyInvoicesForSubscriptions creates current-period invoices for
// only the supplied subscription IDs. It uses the same sequence allocation,
// item creation, and billing-event behavior as GenerateMonthlyInvoices. An
// empty ID list is rejected so callers cannot accidentally invoice every
// active subscription.
func GenerateMonthlyInvoicesForSubscriptions(db *gorm.DB, now time.Time, dueDays int, subscriptionIDs []int64) (int, error) {
	if len(subscriptionIDs) == 0 {
		return 0, fmt.Errorf("at least one subscription ID is required")
	}
	return generateMonthlyInvoices(db, now, dueDays, subscriptionIDs)
}

func generateMonthlyInvoices(db *gorm.DB, now time.Time, dueDays int, subscriptionIDs []int64) (int, error) {
	if dueDays < 0 || dueDays > 90 {
		return 0, fmt.Errorf("due days must be between 0 and 90")
	}
	var subscriptions []domain.Subscription
	query := db.Where("status = ?", domain.SubscriptionActive)
	if len(subscriptionIDs) > 0 {
		query = query.Where("id IN ?", subscriptionIDs)
	}
	if err := query.Find(&subscriptions).Error; err != nil {
		return 0, err
	}
	created := 0
	for _, sub := range subscriptions {
		if sub.BillingDay < 1 || sub.BillingDay > 28 || now.Day() < sub.BillingDay {
			continue
		}
		invoiceDate := time.Date(now.Year(), now.Month(), sub.BillingDay, 0, 0, 0, 0, now.Location())
		if dateAfter(sub.StartDate, invoiceDate) {
			continue
		}
		periodStart := invoiceDate
		periodEnd := invoiceDate.AddDate(0, 1, -1)
		var count int64
		if err := db.Model(&domain.Invoice{}).Where("subscription_id = ? AND period_start = ?", sub.ID, periodStart).Count(&count).Error; err != nil {
			return created, err
		}
		if count > 0 {
			continue
		}
		var customer domain.Customer
		var pkg domain.InternetPackage
		if err := db.First(&customer, sub.CustomerID).Error; err != nil {
			return created, err
		}
		if err := db.First(&pkg, sub.PackageID).Error; err != nil {
			return created, err
		}
		invoice := domain.Invoice{
			CustomerID: sub.CustomerID, SubscriptionID: sub.ID,
			InvoiceDate: invoiceDate, DueDate: invoiceDate.AddDate(0, 0, dueDays),
			PeriodStart: periodStart, PeriodEnd: periodEnd,
			Subtotal: pkg.Price, Total: pkg.Price, Balance: pkg.Price,
			Status: domain.InvoiceIssued,
		}
		err := db.Transaction(func(tx *gorm.DB) error {
			serial, err := nextMonthlySerial(tx, "invoice", invoiceDate.Format("200601"))
			if err != nil {
				return err
			}
			invoice.InvoiceNo = fmt.Sprintf("INV-%s-%06d", invoiceDate.Format("200601"), serial)
			if err := tx.Create(&invoice).Error; err != nil {
				return err
			}
			item := domain.InvoiceItem{InvoiceID: invoice.ID, Description: pkg.Name, Quantity: 1, UnitPrice: pkg.Price, Total: pkg.Price}
			if err := tx.Create(&item).Error; err != nil {
				return err
			}
			return tx.Create(&domain.BillingEvent{CustomerID: customer.ID, SubscriptionID: sub.ID, InvoiceID: invoice.ID, Type: "invoice_generated", Description: invoice.InvoiceNo, CreatedAt: now}).Error
		})
		if err != nil {
			if db.Migrator().HasTable(&domain.Invoice{}) && isUniqueViolation(err) {
				continue
			}
			return created, err
		}
		created++
	}
	return created, nil
}

// ProcessOverdueInvoices marks unpaid invoices overdue once the current date
// passes the invoice due date. Each status change and its audit event are saved
// in one transaction. It returns the first database error encountered.
func ProcessOverdueInvoices(db *gorm.DB, now time.Time) error {
	var invoices []domain.Invoice
	if err := db.Where("balance > 0 AND status IN ?", []string{domain.InvoiceIssued, domain.InvoicePartial, domain.InvoiceOverdue}).Find(&invoices).Error; err != nil {
		return err
	}
	for _, invoice := range invoices {
		if !dateAfter(now, invoice.DueDate) {
			continue
		}
		if invoice.Status != domain.InvoiceOverdue {
			if err := db.Transaction(func(tx *gorm.DB) error {
				if err := tx.Model(&invoice).Where("status <> ?", domain.InvoiceOverdue).Update("status", domain.InvoiceOverdue).Error; err != nil {
					return err
				}
				return tx.Create(&domain.BillingEvent{CustomerID: invoice.CustomerID, SubscriptionID: invoice.SubscriptionID, InvoiceID: invoice.ID, Type: "invoice_overdue", Description: invoice.InvoiceNo, CreatedAt: now}).Error
			}); err != nil {
				return err
			}
		}
	}
	return nil
}

// SuspendOverdueSubscriptions suspends active subscriptions when an overdue
// invoice remains unpaid after that subscription's grace period. The
// subscription status, billing suspension reason, linked RadiusUser disable,
// and billing event are updated in one transaction. It does not send
// Disconnect-Requests; callers must disconnect matching online sessions after
// this function succeeds. It returns the first database error encountered.
func SuspendOverdueSubscriptions(db *gorm.DB, now time.Time) error {
	var invoices []domain.Invoice
	if err := db.Where("balance > 0 AND status = ?", domain.InvoiceOverdue).Find(&invoices).Error; err != nil {
		return err
	}
	for _, invoice := range invoices {
		var sub domain.Subscription
		if err := db.First(&sub, invoice.SubscriptionID).Error; err != nil {
			return err
		}
		if sub.Status != domain.SubscriptionActive || !dateAfter(now, invoice.DueDate.AddDate(0, 0, sub.GraceDays)) {
			continue
		}
		err := db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Model(&sub).Where("status = ?", domain.SubscriptionActive).Updates(map[string]interface{}{"status": domain.SubscriptionSuspended, "suspension_reason": domain.SuspensionBillingOverdue, "updated_at": now}).Error; err != nil {
				return err
			}
			if sub.RadiusUserID > 0 {
				if err := tx.Model(&domain.RadiusUser{}).Where("id = ?", sub.RadiusUserID).Update("status", "disabled").Error; err != nil {
					return err
				}
			}
			return tx.Create(&domain.BillingEvent{CustomerID: sub.CustomerID, SubscriptionID: sub.ID, InvoiceID: invoice.ID, Type: "subscription_suspended", Description: domain.SuspensionBillingOverdue, CreatedAt: now}).Error
		})
		if err != nil {
			return err
		}
	}
	return nil
}

// RecordPayment atomically records a positive payment no greater than the
// invoice balance and updates invoice balance and status. The invoice row is
// locked for update where supported by the database to prevent concurrent
// overpayment. If autoReactivate is true, the final payment reactivates a
// subscription suspended for billing only when it has no other overdue invoice;
// manual suspensions are never cleared here. payment receives its generated
// number, customer ID, timestamp, and received status on success. The function
// returns ErrInvalidPayment, ErrInvoiceClosed, or a wrapped database error.
func RecordPayment(db *gorm.DB, payment *domain.Payment, now time.Time, autoReactivate bool) error {
	if payment.Amount <= 0 {
		return ErrInvalidPayment
	}
	return db.Transaction(func(tx *gorm.DB) error {
		var invoice domain.Invoice
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&invoice, payment.InvoiceID).Error; err != nil {
			return err
		}
		if invoice.Status == domain.InvoiceVoid || invoice.Status == domain.InvoicePaid || invoice.Balance <= 0 {
			return ErrInvoiceClosed
		}
		if payment.Amount > invoice.Balance {
			return ErrInvalidPayment
		}
		payment.CustomerID = invoice.CustomerID
		payment.PaidAt = now
		payment.Status = domain.PaymentReceived
		serial, err := nextMonthlySerial(tx, "payment", now.Format("200601"))
		if err != nil {
			return err
		}
		payment.PaymentNo = fmt.Sprintf("PAY-%s-%06d", now.Format("200601"), serial)
		if err := tx.Create(payment).Error; err != nil {
			return err
		}
		invoice.PaidAmount += payment.Amount
		invoice.Balance -= payment.Amount
		if invoice.Balance == 0 {
			invoice.Status = domain.InvoicePaid
		} else {
			invoice.Status = domain.InvoicePartial
		}
		if err := tx.Save(&invoice).Error; err != nil {
			return err
		}
		if err := tx.Create(&domain.BillingEvent{CustomerID: invoice.CustomerID, SubscriptionID: invoice.SubscriptionID, InvoiceID: invoice.ID, Type: "payment_received", Description: payment.PaymentNo, CreatedAt: now}).Error; err != nil {
			return err
		}
		if invoice.Status == domain.InvoicePaid && autoReactivate && invoice.SubscriptionID > 0 {
			var sub domain.Subscription
			if err := tx.First(&sub, invoice.SubscriptionID).Error; err != nil {
				return err
			}
			if sub.Status == domain.SubscriptionSuspended && sub.SuspensionReason == domain.SuspensionBillingOverdue {
				var remaining int64
				startOfToday := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
				if err := tx.Model(&domain.Invoice{}).Where("subscription_id = ? AND id <> ? AND balance > 0 AND status IN ? AND due_date < ?", sub.ID, invoice.ID, []string{domain.InvoiceIssued, domain.InvoicePartial, domain.InvoiceOverdue}, startOfToday).Count(&remaining).Error; err != nil {
					return err
				}
				if remaining > 0 {
					return nil
				}
				sub.Status = domain.SubscriptionActive
				sub.SuspensionReason = ""
				sub.UpdatedAt = now
				if err := tx.Save(&sub).Error; err != nil {
					return err
				}
				if sub.RadiusUserID > 0 {
					if err := tx.Model(&domain.RadiusUser{}).Where("id = ?", sub.RadiusUserID).Update("status", "enabled").Error; err != nil {
						return err
					}
				}
				if err := tx.Create(&domain.BillingEvent{CustomerID: sub.CustomerID, SubscriptionID: sub.ID, InvoiceID: invoice.ID, Type: "subscription_reactivated", Description: "billing_overdue payment settled", CreatedAt: now}).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
}

func nextMonthlySerial(tx *gorm.DB, kind, period string) (int64, error) {
	sequence := domain.DocumentSequence{Kind: kind, Period: period, Value: 1}
	err := tx.Clauses(
		clause.OnConflict{
			Columns: []clause.Column{{Name: "kind"}, {Name: "period"}},
			DoUpdates: clause.Assignments(map[string]interface{}{
				"value": gorm.Expr("isp_document_sequence.value + 1"),
			}),
		},
		clause.Returning{Columns: []clause.Column{{Name: "value"}}},
	).Create(&sequence).Error
	return sequence.Value, err
}

func dateAfter(a, b time.Time) bool {
	y1, m1, d1 := a.Date()
	y2, m2, d2 := b.Date()
	return time.Date(y1, m1, d1, 0, 0, 0, 0, a.Location()).After(time.Date(y2, m2, d2, 0, 0, 0, 0, b.Location()))
}

func isUniqueViolation(err error) bool {
	return err != nil && (errors.Is(err, gorm.ErrDuplicatedKey) || containsUniqueConstraint(err.Error()))
}

func containsUniqueConstraint(message string) bool {
	message = strings.ToLower(message)
	return strings.Contains(message, "unique constraint") || strings.Contains(message, "duplicate key")
}
