package notify

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"github.com/bjo163/mwx-isp/internal/domain"
	"gorm.io/gorm"
)

type fakeSender struct {
	calls int
	err   error
}

func (f *fakeSender) Send(_ context.Context, _, _ string) error {
	f.calls++
	return f.err
}

func notificationTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&domain.NotificationSettings{}, &domain.NotificationOutbox{}, &domain.BillingEvent{}))
	return db
}

func TestDispatcherEnqueueIsOptInAllowlistedAndDeduplicated(t *testing.T) {
	db := notificationTestDB(t)
	dispatcher := NewDispatcher(db, &fakeSender{})
	now := time.Now()
	require.NoError(t, db.Create(&domain.NotificationSettings{
		ID: 1, WhatsAppEnabled: true, RiskAcknowledgedAt: &now,
		RecipientsJSON: `["+6281234567890", "bad-number"]`, EventsJSON: `["network.down"]`,
	}).Error)

	require.NoError(t, dispatcher.Enqueue("network.recovered", "incident:1:up", "recovered"))
	var count int64
	require.NoError(t, db.Model(&domain.NotificationOutbox{}).Count(&count).Error)
	require.Zero(t, count, "events outside the allowlist must not enqueue")

	require.NoError(t, dispatcher.Enqueue("network.down", "incident:1:down", "target is down"))
	require.NoError(t, dispatcher.Enqueue("network.down", "incident:1:down", "target is down"))
	require.NoError(t, db.Model(&domain.NotificationOutbox{}).Count(&count).Error)
	require.Equal(t, int64(1), count, "one recipient row should be deduplicated")
}

func TestDispatcherRetriesThenMarksSent(t *testing.T) {
	db := notificationTestDB(t)
	now := time.Now()
	require.NoError(t, db.Create(&domain.NotificationSettings{ID: 1, WhatsAppEnabled: true, RiskAcknowledgedAt: &now, RecipientsJSON: `["6281234567890"]`, EventsJSON: `["network.down"]`}).Error)
	sender := &fakeSender{err: errors.New("network error")}
	dispatcher := NewDispatcher(db, sender)
	require.NoError(t, db.Create(&domain.NotificationOutbox{
		DedupeKey: "event:1:+6281234567890", EventType: "network.down", Recipient: "6281234567890",
		Body: "target is down", Status: "pending", NextAttemptAt: now,
	}).Error)

	require.NoError(t, dispatcher.ProcessOnce(context.Background(), now))
	var row domain.NotificationOutbox
	require.NoError(t, db.First(&row).Error)
	require.Equal(t, "retry", row.Status)
	require.Equal(t, 1, row.Attempts)
	require.Equal(t, "WhatsApp delivery failed", row.LastError)

	sender.err = nil
	require.NoError(t, db.Model(&row).Update("next_attempt_at", now).Error)
	require.NoError(t, dispatcher.ProcessOnce(context.Background(), now.Add(time.Second)))
	require.NoError(t, db.First(&row, row.ID).Error)
	require.Equal(t, "sent", row.Status)
	require.Equal(t, 2, row.Attempts)
	require.NotNil(t, row.SentAt)
}

func TestDispatcherCancelsQueuedItemWhenRecipientIsRemoved(t *testing.T) {
	db := notificationTestDB(t)
	d := NewDispatcher(db, SenderFunc(func(context.Context, string, string) error {
		t.Fatal("revoked recipient must not receive queued alert")
		return nil
	}))
	now := time.Now()
	require.NoError(t, db.Create(&domain.NotificationSettings{ID: 1, WhatsAppEnabled: true, RiskAcknowledgedAt: &now, RecipientsJSON: `["6281234567890"]`, EventsJSON: `["network.down"]`}).Error)
	require.NoError(t, d.Enqueue("network.down", "target-down", "Target down"))
	require.NoError(t, db.Model(&domain.NotificationSettings{}).Where("id = ?", 1).Updates(map[string]any{"recipients_json": `["6281111111111"]`}).Error)
	require.NoError(t, d.ProcessOnce(context.Background(), time.Now()))
	var item domain.NotificationOutbox
	require.NoError(t, db.First(&item).Error)
	require.Equal(t, "cancelled", item.Status)
}

func TestNormalizePhone(t *testing.T) {
	got, err := normalizePhone("+62 (812) 3456-7890")
	require.NoError(t, err)
	require.Equal(t, "6281234567890", got)
	_, err = normalizePhone("wa.me/6281234567890")
	require.Error(t, err)
}
