package notify

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/internal/tenancy"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type fakeSender struct {
	calls int
	err   error
	to    []string
}

func (f *fakeSender) Send(_ context.Context, recipient, _ string) error {
	f.calls++
	f.to = append(f.to, recipient)
	return f.err
}

func TestDispatcherIsolatesSettingsAndOutboxByTenant(t *testing.T) {
	db := notificationTestDB(t)
	require.NoError(t, tenancy.RegisterCallbacks(db))
	now := time.Now()
	for tenantID, recipient := range map[int64]string{10: "6281000000010", 20: "6282000000020"} {
		tenantDB := db.WithContext(tenancy.WithTenantID(context.Background(), tenantID))
		settings := domain.NotificationSettings{WhatsAppEnabled: true, RiskAcknowledgedAt: &now,
			RecipientsJSON: `[` + `"` + recipient + `"` + `]`, EventsJSON: `["network.down"]`}
		require.NoError(t, tenantDB.Create(&settings).Error)
	}
	sender := &fakeSender{}
	dispatcher := NewDispatcher(db, sender)
	for tenantID := range map[int64]bool{10: true, 20: true} {
		ctx := tenancy.WithTenantID(context.Background(), tenantID)
		require.NoError(t, dispatcher.EnqueueContext(ctx, "network.down", "same-event", "target down"))
	}

	ctxA := tenancy.WithTenantID(context.Background(), 10)
	require.NoError(t, dispatcher.ProcessOnce(ctxA, time.Now()))
	require.Equal(t, []string{"6281000000010"}, sender.to,
		"tenant 10 processing must not read, cancel, or deliver tenant 20 outbox rows")
	ctxB := tenancy.WithTenantID(context.Background(), 20)
	require.NoError(t, dispatcher.ProcessOnce(ctxB, time.Now()))
	require.Equal(t, []string{"6281000000010", "6282000000020"}, sender.to)
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
	require.Equal(t, persistedCanceledOutboxStatus, item.Status)
}

func TestNormalizePhone(t *testing.T) {
	got, err := normalizePhone("+62 (812) 3456-7890")
	require.NoError(t, err)
	require.Equal(t, "6281234567890", got)
	_, err = normalizePhone("wa.me/6281234567890")
	require.Error(t, err)
}
