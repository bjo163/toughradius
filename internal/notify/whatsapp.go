// Package notify implements persistent operational notification delivery and
// optional WhatsApp transport for MWX-ISP.
package notify

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/skip2/go-qrcode"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
	"gorm.io/gorm"
)

// WhatsAppStatus is safe to return to an administrator; it never contains the
// device keys, QR payload, or phone credentials.
type WhatsAppStatus struct {
	Connected bool      `json:"connected"`
	LoggedIn  bool      `json:"logged_in"`
	State     string    `json:"state"`
	Account   string    `json:"account,omitempty"`
	QRImage   string    `json:"qr_image,omitempty"`
	QRExpires time.Time `json:"qr_expires,omitempty"`
}

// WhatsAppManager owns one persisted linked-device session and is safe for
// concurrent use. It sends only individual operator alerts and does not
// process inbound messages.
type WhatsAppManager struct {
	mu            sync.RWMutex
	db            *gorm.DB
	container     *sqlstore.Container
	client        *whatsmeow.Client
	device        *types.JID
	state         string
	qrImage       string
	qrExpires     time.Time
	pairingCancel context.CancelFunc
}

// NewWhatsAppManager attaches whatsmeow's SQL store to the application's
// existing PostgreSQL or SQLite database and resumes a stored session. The
// manager does not own or close the application's database connection; callers
// should call Close during application shutdown.
func NewWhatsAppManager(db *gorm.DB) (*WhatsAppManager, error) {
	if db == nil {
		return nil, errors.New("database is unavailable")
	}
	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("open WhatsApp session database: %w", err)
	}
	if db.Name() == "sqlite" {
		conn, err := sqlDB.Conn(context.Background())
		if err != nil {
			return nil, fmt.Errorf("open SQLite session connection: %w", err)
		}
		_, pragmaErr := conn.ExecContext(context.Background(), "PRAGMA foreign_keys=ON")
		closeErr := conn.Close()
		if pragmaErr != nil {
			return nil, fmt.Errorf("enable SQLite session foreign keys: %w", pragmaErr)
		}
		if closeErr != nil {
			return nil, fmt.Errorf("close SQLite session connection: %w", closeErr)
		}
	}
	container := sqlstore.NewWithDB(sqlDB, db.Name(), waLog.Noop)
	if err := container.Upgrade(context.Background()); err != nil {
		return nil, fmt.Errorf("upgrade WhatsApp session store: %w", err)
	}
	manager := &WhatsAppManager{db: db, container: container, state: "not_linked"}
	device, err := container.GetFirstDevice(context.Background())
	if err != nil {
		return nil, fmt.Errorf("load WhatsApp device: %w", err)
	}
	if device.ID != nil {
		manager.device = device.ID
		manager.client = manager.newClient(device)
		manager.state = "connecting"
		if err := manager.client.Connect(); err != nil {
			manager.state = "reconnect_required"
		}
	}
	return manager, nil
}

func (m *WhatsAppManager) newClient(device *store.Device) *whatsmeow.Client {
	client := whatsmeow.NewClient(device, waLog.Noop)
	client.AddEventHandler(func(event any) {
		m.mu.Lock()
		defer m.mu.Unlock()
		if m.client != client {
			return
		}
		switch event.(type) {
		case *events.Connected:
			m.state = "connected"
			m.qrImage = ""
		case *events.Disconnected:
			if m.client != nil && m.client.IsLoggedIn() {
				m.state = "reconnecting"
			} else {
				m.state = "disconnected"
			}
		case *events.LoggedOut:
			m.state = "reconnect_required"
			m.qrImage = ""
		}
	})
	return client
}

// StartPairing begins a QR pairing session that continues after the request
// returns; Status exposes the short-lived QR image. ctx applies to the initial
// store lookup. Call Disconnect or Close to stop the persistent session.
func (m *WhatsAppManager) StartPairing(ctx context.Context) error {
	m.mu.Lock()
	if m.client != nil && m.client.IsLoggedIn() {
		m.mu.Unlock()
		return errors.New("WhatsApp account is already linked")
	}
	if m.pairingCancel != nil {
		m.pairingCancel()
	}
	if m.client != nil {
		previous := m.client
		m.client = nil
		go previous.Disconnect()
	}
	device, err := m.container.GetFirstDevice(ctx)
	if err != nil {
		m.mu.Unlock()
		return fmt.Errorf("load WhatsApp device: %w", err)
	}
	if device.ID != nil {
		m.mu.Unlock()
		return errors.New("unlink the existing WhatsApp session before pairing another account")
	}
	client := m.newClient(device)
	qrCtx, cancel := context.WithCancel(context.Background())
	qrChannel, err := client.GetQRChannel(qrCtx)
	if err != nil {
		cancel()
		m.mu.Unlock()
		return fmt.Errorf("prepare WhatsApp pairing: %w", err)
	}
	m.client = client
	m.pairingCancel = cancel
	m.state = "pairing"
	m.qrImage = ""
	m.qrExpires = time.Time{}
	m.mu.Unlock()
	if err := client.Connect(); err != nil {
		cancel()
		m.mu.Lock()
		m.state = "connection_error"
		m.mu.Unlock()
		return fmt.Errorf("connect WhatsApp pairing client: %w", err)
	}
	go m.readPairingEvents(qrCtx, qrChannel)
	return nil
}

func (m *WhatsAppManager) readPairingEvents(ctx context.Context, channel <-chan whatsmeow.QRChannelItem) {
	for {
		select {
		case <-ctx.Done():
			return
		case item, ok := <-channel:
			if !ok {
				return
			}
			switch item.Event {
			case whatsmeow.QRChannelEventCode:
				image, err := qrcode.Encode(item.Code, qrcode.Medium, 300)
				m.mu.Lock()
				if err == nil {
					m.qrImage = "data:image/png;base64," + base64.StdEncoding.EncodeToString(image)
					m.qrExpires = time.Now().Add(item.Timeout)
					m.state = "pairing"
				} else {
					m.state = "pairing_error"
				}
				m.mu.Unlock()
			case whatsmeow.QRChannelSuccess.Event:
				m.mu.Lock()
				m.state = "connected"
				m.qrImage = ""
				m.qrExpires = time.Time{}
				m.device = m.client.Store.ID
				m.mu.Unlock()
				return
			case whatsmeow.QRChannelTimeout.Event:
				m.mu.Lock()
				m.state = "pairing_timeout"
				m.qrImage = ""
				m.mu.Unlock()
				return
			case "error", whatsmeow.QRChannelErrUnexpectedEvent.Event, whatsmeow.QRChannelClientOutdated.Event,
				whatsmeow.QRChannelScannedWithoutMultidevice.Event:
				m.mu.Lock()
				m.state = "pairing_error"
				m.qrImage = ""
				m.mu.Unlock()
				return
			}
		}
	}
}

// Status returns the current session state and short-lived QR image, if pairing.
// The QR image is sensitive and should only be exposed to an authenticated
// administrator over a protected connection.
func (m *WhatsAppManager) Status() WhatsAppStatus {
	m.mu.RLock()
	defer m.mu.RUnlock()
	status := WhatsAppStatus{State: m.state, QRImage: m.qrImage, QRExpires: m.qrExpires}
	if m.client != nil {
		status.Connected = m.client.IsConnected()
		status.LoggedIn = m.client.IsLoggedIn()
		if m.client.Store.ID != nil {
			status.Account = m.client.Store.ID.String()
		}
	}
	return status
}

// Send sends one plain-text operational alert to an individual phone number.
// The caller must enforce its allowlist; this method validates the number and
// requires a connected, logged-in client. ctx bounds the network send.
func (m *WhatsAppManager) Send(ctx context.Context, recipient, body string) error {
	recipient, err := normalizePhone(recipient)
	if err != nil {
		return err
	}
	body = strings.TrimSpace(body)
	if body == "" || len(body) > 1000 {
		return errors.New("notification body must contain 1 to 1000 characters")
	}
	m.mu.RLock()
	client := m.client
	m.mu.RUnlock()
	if client == nil || !client.IsLoggedIn() || !client.IsConnected() {
		return errors.New("WhatsApp account is not connected")
	}
	jid := types.NewJID(recipient, types.DefaultUserServer)
	if _, err := client.SendMessage(ctx, jid, &waE2E.Message{Conversation: proto.String(body)}); err != nil {
		return errors.New("WhatsApp message delivery failed")
	}
	return nil
}

// Unlink disconnects the client and removes its persisted linked-device keys.
func (m *WhatsAppManager) Unlink(ctx context.Context) error {
	m.mu.Lock()
	client := m.client
	m.client = nil
	m.device = nil
	m.qrImage = ""
	m.qrExpires = time.Time{}
	m.state = "not_linked"
	if m.pairingCancel != nil {
		m.pairingCancel()
		m.pairingCancel = nil
	}
	m.mu.Unlock()
	if client != nil {
		client.Disconnect()
	}
	device, err := m.container.GetFirstDevice(ctx)
	if err != nil {
		return err
	}
	if device.ID != nil {
		if err := m.container.DeleteDevice(ctx, device); err != nil {
			return err
		}
	}
	return nil
}

var phonePattern = regexp.MustCompile(`^[1-9][0-9]{7,14}$`)

func normalizePhone(value string) (string, error) {
	value = strings.TrimSpace(value)
	value = strings.TrimPrefix(value, "+")
	if strings.ContainsAny(value, " ()-.") {
		value = strings.NewReplacer(" ", "", "(", "", ")", "", "-", "", ".", "").Replace(value)
	}
	if !phonePattern.MatchString(value) {
		return "", errors.New("recipient must be an international phone number without extension")
	}
	return value, nil
}

// Disconnect unlinks the locally stored session. It asks WhatsApp to unlink the
// device and clears local keys even if the remote unlink request fails.
func (m *WhatsAppManager) Disconnect(ctx context.Context) error {
	m.mu.Lock()
	client := m.client
	if m.pairingCancel != nil {
		m.pairingCancel()
		m.pairingCancel = nil
	}
	m.client = nil
	m.device = nil
	m.qrImage = ""
	m.qrExpires = time.Time{}
	m.state = "not_linked"
	m.mu.Unlock()
	if client != nil {
		if client.IsLoggedIn() {
			if err := client.Logout(ctx); err != nil {
				client.Disconnect()
				if client.Store != nil {
					_ = client.Store.Delete(context.Background())
				}
			}
		} else {
			client.Disconnect()
			if client.Store != nil && client.Store.ID != nil {
				if err := client.Store.Delete(ctx); err != nil {
					return fmt.Errorf("delete WhatsApp session: %w", err)
				}
			}
		}
	}
	m.mu.Lock()
	m.state = "not_linked"
	m.mu.Unlock()
	return nil
}

// Close disconnects the active websocket and closes the store wrapper without
// deleting a linked device so the next process can resume the session.
func (m *WhatsAppManager) Close() error {
	m.mu.Lock()
	client := m.client
	cancel := m.pairingCancel
	m.client = nil
	m.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	if client != nil {
		client.Disconnect()
	}
	// The SQL container wraps the app-owned database connection; do not close it.
	return nil
}
