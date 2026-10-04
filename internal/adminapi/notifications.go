package adminapi

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/bjo163/mwx-isp/internal/app"
	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/internal/notify"
	"github.com/bjo163/mwx-isp/internal/webserver"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

var supportedNotifyEvents = map[string]bool{
	"network.down": true, "network.recovered": true,
	"billing.suspended": true, "billing.reactivated": true,
	"scheduler.failure": true,
}

type notificationSettingsInput struct {
	Enabled          bool     `json:"whatsapp_enabled"`
	RiskAcknowledged bool     `json:"risk_acknowledged"`
	Recipients       []string `json:"recipients"`
	Events           []string `json:"events"`
}

type notificationSettingsDTO struct {
	Enabled            bool                  `json:"whatsapp_enabled"`
	RiskAcknowledgedAt *time.Time            `json:"risk_acknowledged_at,omitempty"`
	Recipients         []string              `json:"recipients"`
	Events             []string              `json:"events"`
	WhatsApp           notify.WhatsAppStatus `json:"whatsapp"`
}

func registerNotificationRoutes() {
	webserver.ApiGET("/system/notifications/whatsapp", getWhatsAppSettings, requireAdmin())
	webserver.ApiPUT("/system/notifications/whatsapp", putWhatsAppSettings, requireAdmin())
	webserver.ApiPOST("/system/notifications/whatsapp/pair", pairWhatsApp, requirePlatformAdmin())
	webserver.ApiPOST("/system/notifications/whatsapp/disconnect", disconnectWhatsApp, requirePlatformAdmin())
	webserver.ApiPOST("/system/notifications/whatsapp/test", sendWhatsAppTest, requireAdmin())
	webserver.ApiGET("/system/notifications/outbox", listNotificationOutbox, requireAdmin())
}

func readNotifySettings(db *gorm.DB) (domain.NotificationSettings, error) {
	var row domain.NotificationSettings
	err := db.First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		row.RecipientsJSON = "[]"
		row.EventsJSON = "[]"
		return row, nil
	}
	return row, err
}

func notificationDTO(c echo.Context, row domain.NotificationSettings) (notificationSettingsDTO, error) {
	var recipients, events []string
	_ = json.Unmarshal([]byte(row.RecipientsJSON), &recipients)
	_ = json.Unmarshal([]byte(row.EventsJSON), &events)
	provider, providerOK := GetAppContext(c).(app.NotificationProvider)
	if !providerOK {
		return notificationSettingsDTO{}, errors.New("notification service unavailable")
	}
	manager, err := provider.WhatsAppManager()
	if err != nil {
		return notificationSettingsDTO{}, err
	}
	return notificationSettingsDTO{Enabled: row.WhatsAppEnabled, RiskAcknowledgedAt: row.RiskAcknowledgedAt, Recipients: recipients, Events: events, WhatsApp: manager.Status()}, nil
}

func getWhatsAppSettings(c echo.Context) error {
	row, err := readNotifySettings(GetDB(c))
	if err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to load notification settings", nil)
	}
	dto, err := notificationDTO(c, row)
	if err != nil {
		return fail(c, 503, "WHATSAPP_UNAVAILABLE", "WhatsApp session store is unavailable", nil)
	}
	return ok(c, dto)
}

func putWhatsAppSettings(c echo.Context) error {
	var in notificationSettingsInput
	if err := c.Bind(&in); err != nil {
		return fail(c, 400, "INVALID_REQUEST", "Invalid notification settings", nil)
	}
	if in.Enabled && !in.RiskAcknowledged {
		return fail(c, 400, "RISK_ACK_REQUIRED", "Acknowledge WhatsApp integration and account policy risks before enabling", nil)
	}
	recipients := make([]string, 0, len(in.Recipients))
	if len(in.Recipients) > 20 {
		return fail(c, 400, "RECIPIENT_LIMIT", "At most 20 operator recipients are supported", nil)
	}
	seen := map[string]bool{}
	for _, candidate := range in.Recipients {
		normalized, err := notify.NormalizeRecipient(candidate)
		if err != nil {
			return fail(c, 400, "INVALID_RECIPIENT", err.Error(), nil)
		}
		if !seen[normalized] {
			recipients = append(recipients, normalized)
			seen[normalized] = true
		}
	}
	if in.Enabled && len(recipients) == 0 {
		return fail(c, 400, "RECIPIENT_REQUIRED", "Add at least one operator phone number", nil)
	}
	events := make([]string, 0, len(in.Events))
	eventSeen := map[string]bool{}
	for _, event := range in.Events {
		if !supportedNotifyEvents[event] {
			return fail(c, 400, "INVALID_EVENT", "One or more notification events are unsupported", nil)
		}
		if !eventSeen[event] {
			events = append(events, event)
			eventSeen[event] = true
		}
	}
	if in.Enabled && len(events) == 0 {
		return fail(c, 400, "EVENT_REQUIRED", "Select at least one notification event", nil)
	}
	var row domain.NotificationSettings
	err := GetDB(c).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
	} else if err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to load notification settings", nil)
	}
	row.WhatsAppEnabled = in.Enabled
	recipientJSON, _ := json.Marshal(recipients)
	eventJSON, _ := json.Marshal(events)
	row.RecipientsJSON, row.EventsJSON = string(recipientJSON), string(eventJSON)
	row.UpdatedAt = time.Now()
	if in.RiskAcknowledged && row.RiskAcknowledgedAt == nil {
		now := time.Now()
		row.RiskAcknowledgedAt = &now
	}
	if err := GetDB(c).Save(&row).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to save notification settings", nil)
	}
	dto, err := notificationDTO(c, row)
	if err != nil {
		return fail(c, 503, "WHATSAPP_UNAVAILABLE", "WhatsApp session store is unavailable", nil)
	}
	return ok(c, dto)
}

func pairingAllowed(c echo.Context) (app.NotificationProvider, error) {
	var settings domain.NotificationSettings
	if err := GetDB(c).First(&settings).Error; err != nil {
		return nil, errors.New("save settings and acknowledge the risks before pairing")
	}
	if !settings.WhatsAppEnabled || settings.RiskAcknowledgedAt == nil {
		return nil, errors.New("enable notifications and acknowledge the risks before pairing")
	}
	provider, providerOK := GetAppContext(c).(app.NotificationProvider)
	if !providerOK {
		return nil, errors.New("WhatsApp service unavailable")
	}
	return provider, nil
}

func pairWhatsApp(c echo.Context) error {
	provider, err := pairingAllowed(c)
	if err != nil {
		return fail(c, 400, "PAIRING_NOT_ALLOWED", err.Error(), nil)
	}
	manager, err := provider.WhatsAppManager()
	if err != nil {
		return fail(c, 503, "WHATSAPP_UNAVAILABLE", "WhatsApp session store is unavailable", nil)
	}
	if err := manager.StartPairing(c.Request().Context()); err != nil {
		return fail(c, 409, "PAIRING_FAILED", err.Error(), nil)
	}
	return ok(c, manager.Status())
}

func disconnectWhatsApp(c echo.Context) error {
	provider, providerOK := GetAppContext(c).(app.NotificationProvider)
	if !providerOK {
		return fail(c, 503, "WHATSAPP_UNAVAILABLE", "WhatsApp service unavailable", nil)
	}
	manager, err := provider.WhatsAppManager()
	if err != nil {
		return fail(c, 503, "WHATSAPP_UNAVAILABLE", "WhatsApp session store is unavailable", nil)
	}
	if err := manager.Disconnect(c.Request().Context()); err != nil {
		return fail(c, 500, "DISCONNECT_FAILED", "Could not unlink WhatsApp device", nil)
	}
	return ok(c, manager.Status())
}

func sendWhatsAppTest(c echo.Context) error {
	var in struct {
		Recipient string `json:"recipient"`
	}
	if err := c.Bind(&in); err != nil {
		return fail(c, 400, "INVALID_REQUEST", "Invalid recipient", nil)
	}
	var settings domain.NotificationSettings
	if err := GetDB(c).First(&settings).Error; err != nil || !settings.WhatsAppEnabled || settings.RiskAcknowledgedAt == nil {
		return fail(c, 400, "NOTIFICATIONS_DISABLED", "Enable WhatsApp alerts and acknowledge risk first", nil)
	}
	var recipients []string
	_ = json.Unmarshal([]byte(settings.RecipientsJSON), &recipients)
	normalized, err := notify.NormalizeRecipient(in.Recipient)
	if err != nil {
		return fail(c, 400, "INVALID_RECIPIENT", err.Error(), nil)
	}
	allowed := false
	for _, candidate := range recipients {
		value, _ := notify.NormalizeRecipient(candidate)
		if value == normalized {
			allowed = true
		}
	}
	if !allowed {
		return fail(c, 403, "RECIPIENT_NOT_ALLOWED", "Test messages can only be sent to an allowlisted operator", nil)
	}
	provider, providerOK := GetAppContext(c).(app.NotificationProvider)
	if !providerOK {
		return fail(c, 503, "WHATSAPP_UNAVAILABLE", "WhatsApp service unavailable", nil)
	}
	manager, err := provider.WhatsAppManager()
	if err != nil {
		return fail(c, 503, "WHATSAPP_UNAVAILABLE", "WhatsApp session store is unavailable", nil)
	}
	if err := manager.Send(c.Request().Context(), normalized, "MWX-ISP WhatsApp alert test. Your operator number is connected."); err != nil {
		return fail(c, 503, "SEND_FAILED", "Could not send the test notification", nil)
	}
	return ok(c, map[string]any{"sent": true})
}

func listNotificationOutbox(c echo.Context) error {
	page, size := parsePagination(c)
	q := GetDB(c).Model(&domain.NotificationOutbox{})
	if status := strings.TrimSpace(c.QueryParam("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query delivery history", nil)
	}
	var rows []domain.NotificationOutbox
	if err := q.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query delivery history", nil)
	}
	return paged(c, rows, total, page, size)
}
