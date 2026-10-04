package notify

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/bjo163/mwx-isp/internal/domain"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// persistedCanceledOutboxStatus preserves the spelling used by existing rows.
const persistedCanceledOutboxStatus = "cancelled" //nolint:misspell // Persisted status value is backward compatible.

const (
	maxDeliveryAttempts = 5
	maxOutboxBatch      = 25
)

// Sender sends one message to one operator destination.
type Sender interface {
	Send(context.Context, string, string) error
}

// SenderFunc adapts a function into a Sender.
type SenderFunc func(context.Context, string, string) error

// Send invokes the wrapped message sender.
func (f SenderFunc) Send(ctx context.Context, recipient, body string) error {
	return f(ctx, recipient, body)
}

// Dispatcher persists, deduplicates, retries, and delivers opt-in operational
// alerts. Only allowlisted individual operator numbers receive messages. Its
// methods are safe for concurrent use; delivery is serialized per instance.
type Dispatcher struct {
	db     *gorm.DB
	sender Sender
	mu     sync.Mutex
}

// NewDispatcher creates a notification dispatcher backed by db. A nil Sender
// disables delivery while preserving the API for enqueueing/configuration.
func NewDispatcher(db *gorm.DB, sender Sender) *Dispatcher {
	return &Dispatcher{db: db, sender: sender}
}

// Enqueue creates one outbox item per configured recipient when the event is
// enabled and risk acknowledgement is present. A stable dedupe key makes
// repeated scheduler processing harmless. It returns database/JSON errors.
func (d *Dispatcher) Enqueue(eventType, dedupeKey, body string) error {
	var settings domain.NotificationSettings
	if err := d.db.Where("id = ?", 1).First(&settings).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	} else if err != nil {
		return fmt.Errorf("load notification settings: %w", err)
	}
	if !settings.WhatsAppEnabled || settings.RiskAcknowledgedAt == nil {
		return nil
	}
	var events []string
	if err := json.Unmarshal([]byte(settings.EventsJSON), &events); err != nil {
		return fmt.Errorf("decode enabled notification events: %w", err)
	}
	if !contains(events, eventType) {
		return nil
	}
	var recipients []string
	if err := json.Unmarshal([]byte(settings.RecipientsJSON), &recipients); err != nil {
		return fmt.Errorf("decode notification recipients: %w", err)
	}
	body = strings.TrimSpace(body)
	if len(body) == 0 || len(body) > 1000 {
		return errors.New("notification body must contain 1 to 1000 characters")
	}
	for _, recipient := range recipients {
		normalized, err := normalizePhone(recipient)
		if err != nil {
			continue
		}
		row := domain.NotificationOutbox{
			DedupeKey:     dedupeKey + ":" + normalized,
			EventType:     eventType,
			Recipient:     normalized,
			Body:          body,
			Status:        "pending",
			NextAttemptAt: time.Now(),
			CreatedAt:     time.Now(),
		}
		if err := d.db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "dedupe_key"}}, DoNothing: true}).Create(&row).Error; err != nil {
			return fmt.Errorf("enqueue notification: %w", err)
		}
	}
	return nil
}

// EnqueueBillingEvents queues recent billing lifecycle events with stable IDs.
func (d *Dispatcher) EnqueueBillingEvents(ctx context.Context, since time.Time) error {
	var rows []domain.BillingEvent
	if err := d.db.WithContext(ctx).Where("created_at >= ? AND type IN ?", since,
		[]string{"subscription_suspended", "subscription_reactivated"}).Find(&rows).Error; err != nil {
		return fmt.Errorf("load billing notification events: %w", err)
	}
	for _, event := range rows {
		status := "suspended for overdue billing"
		eventType := "billing.suspended"
		if event.Type == "subscription_reactivated" {
			status = "reactivated after payment"
			eventType = "billing.reactivated"
		}
		body := fmt.Sprintf("MWX-ISP: subscription #%d was %s. Review the billing record in the admin dashboard.", event.SubscriptionID, status)
		if err := d.Enqueue(eventType, fmt.Sprintf("billing-event:%d", event.ID), body); err != nil {
			return err
		}
	}
	return nil
}

// ProcessOnce attempts at most 25 due notifications, honors ctx cancellation,
// retries failures with exponential backoff, and stops after five attempts.
// Delivery is skipped and queued rows are canceled when the current settings
// no longer allow their event or recipient.
func (d *Dispatcher) ProcessOnce(ctx context.Context, now time.Time) error {
	if d.sender == nil || !d.mu.TryLock() {
		return nil
	}
	defer d.mu.Unlock()
	if err := d.db.WithContext(ctx).Where("created_at < ? AND status IN ?", now.Add(-30*24*time.Hour), []string{"sent", "failed", persistedCanceledOutboxStatus}).Delete(&domain.NotificationOutbox{}).Error; err != nil {
		return fmt.Errorf("prune notification history: %w", err)
	}
	var rows []domain.NotificationOutbox
	if err := d.db.WithContext(ctx).
		Where("status IN ? AND next_attempt_at <= ?", []string{"pending", "retry"}, now).
		Order("id ASC").Limit(maxOutboxBatch).Find(&rows).Error; err != nil {
		return fmt.Errorf("load outbound notifications: %w", err)
	}
	for _, row := range rows {
		if err := ctx.Err(); err != nil {
			return err
		}
		allowed, err := d.deliveryAllowed(row)
		if err != nil {
			return err
		}
		if !allowed {
			if err := d.db.Model(&row).Updates(map[string]any{"status": persistedCanceledOutboxStatus, "last_error": "Notification settings changed"}).Error; err != nil {
				return fmt.Errorf("cancel notification after settings change: %w", err)
			}
			continue
		}
		sendCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		err = d.sender.Send(sendCtx, row.Recipient, row.Body)
		cancel()
		if err == nil {
			sentAt := now
			if updateErr := d.db.Model(&row).Updates(map[string]any{
				"status": "sent", "sent_at": &sentAt, "attempts": row.Attempts + 1, "last_error": "",
			}).Error; updateErr != nil {
				return fmt.Errorf("mark notification delivered: %w", updateErr)
			}
			continue
		}
		attempts := row.Attempts + 1
		status := "retry"
		delay := time.Duration(1<<min(attempts, 8)) * time.Second
		if attempts >= maxDeliveryAttempts {
			status = "failed"
			delay = 0
		}
		lastError := "WhatsApp delivery failed"
		if updateErr := d.db.Model(&row).Updates(map[string]any{
			"status":          status,
			"attempts":        attempts,
			"next_attempt_at": now.Add(delay),
			"last_error":      lastError,
		}).Error; updateErr != nil {
			return fmt.Errorf("update failed notification: %w", updateErr)
		}
	}
	return nil
}

func (d *Dispatcher) deliveryAllowed(row domain.NotificationOutbox) (bool, error) {
	var settings domain.NotificationSettings
	if err := d.db.First(&settings, 1).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	} else if err != nil {
		return false, fmt.Errorf("recheck notification settings: %w", err)
	}
	if !settings.WhatsAppEnabled || settings.RiskAcknowledgedAt == nil {
		return false, nil
	}
	var recipients, events []string
	if err := json.Unmarshal([]byte(settings.RecipientsJSON), &recipients); err != nil {
		return false, fmt.Errorf("decode notification recipients: %w", err)
	}
	if err := json.Unmarshal([]byte(settings.EventsJSON), &events); err != nil {
		return false, fmt.Errorf("decode notification events: %w", err)
	}
	recipientAllowed := false
	for _, recipient := range recipients {
		if normalized, err := normalizePhone(recipient); err == nil && normalized == row.Recipient {
			recipientAllowed = true
			break
		}
	}
	return recipientAllowed && contains(events, row.EventType), nil
}

func contains(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}

// NormalizeRecipient validates an international phone number and returns its
// digits-only form. It accepts a leading plus and common formatting separators.
func NormalizeRecipient(value string) (string, error) { return normalizePhone(value) }
