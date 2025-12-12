package whatsapp

import (
	"context"
	"fmt"
	"reflect"
	"strings"
	"sync"

	_ "github.com/mattn/go-sqlite3"
	"github.com/talkincode/toughradius/v9/internal/app"
	"github.com/talkincode/toughradius/v9/internal/domain"
	"go.mau.fi/whatsmeow"
	waE2E "go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store/sqlstore"
	waTypes "go.mau.fi/whatsmeow/types"
	"go.uber.org/zap"
	"google.golang.org/protobuf/encoding/prototext"
	"google.golang.org/protobuf/proto"
	"regexp"
	"time"
)

// Service wraps a whatsmeow client and provides lifecycle methods.
type Service struct {
	app app.AppContext
	// clients keyed by our device JID string
	clients    map[string]*whatsmeow.Client
	clientsMux sync.RWMutex
	store      *sqlstore.Container
	// QR code captured from whatsmeow QR events. The raw code string can be
	// returned to the frontend to render a QR image there (recommended).
	qr     string
	qrLock sync.RWMutex
	// per-application-device QR map keyed by WhatsAppDevice ID
	qrMap    map[int64]string
	qrMapMux sync.RWMutex
}

// New creates a new WhatsApp service using a sqlite store under application workdir.
func New(a app.AppContext) (*Service, error) {
	// Prefer reusing the existing application's DB connection so we don't create a separate DB file.
	// This also ensures whatsmeow tables are created in the same database.
	gdb := a.DB()
	sqlDB, err := gdb.DB()
	if err != nil {
		zap.L().Error("whatsapp: failed to get sql.DB from gorm", zap.Error(err))
		return nil, fmt.Errorf("failed to obtain underlying sql.DB: %w", err)
	}

	// Ensure SQLite foreign keys are enabled. Some sqlite builds require PRAGMA to be set per connection.
	// Try enabling it on the DB handle so sqlstore.Upgrade can run migrations that require FK support.
	if _, err := sqlDB.ExecContext(context.Background(), "PRAGMA foreign_keys = ON;"); err != nil {
		zap.L().Warn("whatsapp: unable to enable sqlite foreign_keys pragma", zap.Error(err))
	} else {
		zap.L().Info("whatsapp: enabled sqlite foreign_keys pragma on DB handle")
	}

	// Determine driver name from config
	dbType := strings.ToLower(strings.TrimSpace(a.Config().Database.Type))
	driver := ""
	switch dbType {
	case "sqlite", "sqlite3":
		driver = "sqlite3"
	case "postgres", "postgresql":
		driver = "postgres"
	default:
		// fallback to sqlite3 if unknown
		driver = "sqlite3"
	}

	// Wrap existing database connection so whatsmeow uses same DB and tables.
	// Use NewWithDB to avoid opening a separate connection; then run Upgrade.
	container := sqlstore.NewWithDB(sqlDB, driver, nil)
	if err := container.Upgrade(context.Background()); err != nil {
		zap.L().Error("whatsapp: sqlstore.Upgrade failed", zap.Error(err), zap.String("driver", driver))
		return nil, fmt.Errorf("sqlstore upgrade failed: %w", err)
	}
	svc := &Service{app: a, clients: make(map[string]*whatsmeow.Client), store: container, qrMap: make(map[int64]string)}

	// Initialize clients map for existing devices (do not auto-connect)
	devices, err := container.GetAllDevices(context.Background())
	if err != nil {
		zap.L().Error("whatsapp: failed to list stored devices from sqlstore", zap.Error(err))
		return nil, fmt.Errorf("sqlstore GetAllDevices failed: %w", err)
	}
	for _, d := range devices {
		client := whatsmeow.NewClient(d, nil)
		svc.registerClient(client)
	}

	// Auto-provision any application-level WhatsAppDevice rows that exist in the
	// application DB but are not present in whatsmeow's sqlstore. This lets
	// admins create devices while the service is down and have them auto-start
	// pairing when the service comes up.
	// Build a set of BusinessName values already present in the sqlstore
	existingBN := make(map[string]bool)
	for _, d := range devices {
		// use GetBusinessName() to handle proto getters
		if d != nil {
			bn := ""
			if getter, ok := interface{}(d).(interface{ GetBusinessName() string }); ok {
				bn = getter.GetBusinessName()
			}
			if bn != "" {
				existingBN[bn] = true
			}
		}
	}

	// Query application DB for all WhatsAppDevice records and provision any missing
	var appDevs []domain.WhatsAppDevice
	if err := a.DB().Find(&appDevs).Error; err == nil {
		zap.L().Info("whatsapp: found application whatsapp devices for auto-provision", zap.Int("count", len(appDevs)))
		for _, wad := range appDevs {
			// if a previous auto-provision attempt already failed and marked this
			// app device as provision_failed, skip it to avoid repeated PutDevice
			// attempts which spam logs and QR generation. Admins can retry via
			// the provision API which falls back to an in-memory client.
			if strings.ToLower(strings.TrimSpace(wad.Status)) == "provision_failed" {
				zap.L().Debug("whatsapp: skipping auto-provision for app device marked provision_failed", zap.Int64("wad_id", wad.ID))
				continue
			}
			// skip if we've already got a matching store device
			marker := fmt.Sprintf("app_wad:%d", wad.ID)
			if existingBN[marker] {
				continue
			}
			// create and persist store device
			dev := container.NewDevice()
			dev.PushName = wad.Name
			dev.BusinessName = marker
			if err := container.PutDevice(context.Background(), dev); err != nil {
				// Persist failed; mark the app device as provision_failed and do NOT
				// create an in-memory client. This prevents auto-provision from
				// repeatedly creating pending clients that spam QR codes.
				zap.L().Warn("whatsapp: PutDevice failed during auto-provision (marking provision_failed)", zap.Error(err), zap.Int64("wad_id", wad.ID))
				if err := a.DB().Model(&domain.WhatsAppDevice{}).Where("id = ?", wad.ID).Updates(map[string]interface{}{"status": "provision_failed"}).Error; err != nil {
					zap.L().Warn("whatsapp: failed to mark app device as provision_failed", zap.Error(err), zap.Int64("wad_id", wad.ID))
				}
				// do not register in-memory client here
				continue
			}
			zap.L().Info("whatsapp: auto-provisioned whatsmeow device", zap.Int64("app_wad_id", wad.ID))
			// register client and auto-connect
			client := whatsmeow.NewClient(dev, nil)
			svc.registerClient(client)
			go func(cli *whatsmeow.Client, id int64) {
				zap.L().Info("whatsapp: auto-connect starting for auto-provisioned device", zap.Int64("wad_id", id), zap.String("business_name", marker))
				if err := cli.Connect(); err != nil {
					zap.L().Warn("whatsapp: auto-connect failed for auto-provisioned device", zap.Error(err), zap.Int64("wad_id", id))
				}
			}(client, wad.ID)
			// mark application record as provisioned
			if err := a.DB().Model(&domain.WhatsAppDevice{}).Where("id = ?", wad.ID).Update("status", "provisioned").Error; err != nil {
				zap.L().Warn("whatsapp: failed to update app device status after auto-provision", zap.Error(err), zap.Int64("wad_id", wad.ID))
			}
		}
	} else {
		zap.L().Warn("whatsapp: failed to query app whatsapp devices for auto-provision", zap.Error(err))
	}

	// set package-global service (so admin APIs can reach it)
	setGlobalService(svc)
	// start background auto-provision loop to pick up devices created while running
	go svc.autoProvisionLoop()
	// Log successful initialization with device count
	zap.L().Info("whatsapp: service initialized", zap.Int("stored_devices", len(devices)), zap.String("driver", driver))

	// register event handler: capture QR codes and log event types
	// No global client; handlers are registered per-client in registerClient

	return svc, nil
}

// Start connects the client and blocks until context is cancelled or connection fails.
func (s *Service) Start(ctx context.Context) error {
	zap.L().Info("whatsapp: starting client")
	s.clientsMux.RLock()
	clients := make([]*whatsmeow.Client, 0, len(s.clients))
	for _, c := range s.clients {
		clients = append(clients, c)
	}
	s.clientsMux.RUnlock()

	// connect all clients (non-blocking per client)
	for _, c := range clients {
		go func(cli *whatsmeow.Client) {
			if err := cli.Connect(); err != nil {
				zap.L().Warn("whatsapp: client connect failed", zap.Error(err))
			}
		}(c)
	}

	// wait until context canceled
	<-ctx.Done()
	zap.L().Info("whatsapp: shutting down clients")
	s.clientsMux.RLock()
	for _, c := range s.clients {
		c.Disconnect()
	}
	s.clientsMux.RUnlock()
	return nil
}

// SendText sends a simple text message to the provided jid (e.g., "6281234@s.whatsapp.net").
func (s *Service) SendText(ctx context.Context, jid string, text string) error {
	if s == nil {
		return fmt.Errorf("whatsapp service not initialized")
	}
	// Build a simple conversation message (use waE2E protobuf types)
	msg := &waE2E.Message{Conversation: proto.String(text)}

	// Parse the destination JID string into whatsmeow types.JID
	parsed, err := waTypes.ParseJID(jid)
	if err != nil {
		zap.L().Warn("whatsapp: invalid jid", zap.Error(err), zap.String("jid", jid))
		return err
	}

	// Send the message. SendMessage expects a types.JID and *waE2E.Message
	// choose any available connected client to send from (pick first connected)
	var cli *whatsmeow.Client
	s.clientsMux.RLock()
	for _, c := range s.clients {
		cli = c
		break
	}
	s.clientsMux.RUnlock()
	if cli == nil {
		return fmt.Errorf("no whatsapp client available")
	}
	_, err = cli.SendMessage(ctx, parsed, msg)
	if err != nil {
		zap.L().Warn("whatsapp: send message failed", zap.Error(err))
		return err
	}
	zap.L().Info("whatsapp: message sent", zap.String("jid", jid))
	return nil
}

// SendTextFrom sends a text message using a specific client identified by its JID string.
// If fromJid is empty, falls back to SendText (first available client).
func (s *Service) SendTextFrom(ctx context.Context, fromJid string, jid string, text string) error {
	if s == nil {
		return fmt.Errorf("whatsapp service not initialized")
	}
	if fromJid == "" {
		return s.SendText(ctx, jid, text)
	}

	// find client by fromJid
	s.clientsMux.RLock()
	cli, ok := s.clients[fromJid]
	s.clientsMux.RUnlock()
	if !ok || cli == nil {
		return fmt.Errorf("no whatsapp client found for %s", fromJid)
	}

	msg := &waE2E.Message{Conversation: proto.String(text)}
	parsed, err := waTypes.ParseJID(jid)
	if err != nil {
		zap.L().Warn("whatsapp: invalid jid", zap.Error(err), zap.String("jid", jid))
		return err
	}
	_, err = cli.SendMessage(ctx, parsed, msg)
	if err != nil {
		zap.L().Warn("whatsapp: send message failed (from specific client)", zap.Error(err))
		return err
	}
	zap.L().Info("whatsapp: message sent", zap.String("jid", jid), zap.String("from", fromJid))
	return nil
}

// GetQRCode returns the latest QR code string (if any). The frontend can
// generate the actual QR image from this string client-side (safer and
// doesn't require image generation server-side). If empty, there's no
// outstanding QR to scan.
func (s *Service) GetQRCode() string {
	s.qrLock.RLock()
	code := s.qr
	s.qrLock.RUnlock()
	// Log access for debugging (do not log full QR content, only length)
	if code != "" {
		zap.L().Info("whatsapp: GetQRCode called", zap.Int("code_len", len(code)))
	} else {
		zap.L().Debug("whatsapp: GetQRCode called - no QR available")
	}
	return code
}

// ConnectAsync triggers a non-blocking attempt to connect the client. It
// returns immediately; connect errors are logged.
func (s *Service) ConnectAsync() {
	go func() {
		zap.L().Info("whatsapp: connecting all clients (async)")
		s.clientsMux.RLock()
		for key, c := range s.clients {
			if c == nil || c.Store == nil {
				continue
			}
			zap.L().Info("whatsapp: async connect starting for client", zap.String("key", key), zap.String("business_name", c.Store.BusinessName))
			go func(cli *whatsmeow.Client, k string) {
				if err := cli.Connect(); err != nil {
					zap.L().Warn("whatsapp: client connect failed", zap.Error(err), zap.String("key", k))
				}
			}(c, key)
		}
		s.clientsMux.RUnlock()
	}()
}

// package-level global reference for the running service instance
var globalSvc *Service
var globalSvcLock sync.RWMutex

func setGlobalService(s *Service) {
	globalSvcLock.Lock()
	defer globalSvcLock.Unlock()
	globalSvc = s
}

// registerClient registers per-client event handlers and stores QR state.
func (s *Service) registerClient(client *whatsmeow.Client) {
	if client == nil {
		return
	}
	// initial key: prefer stored JID if present, otherwise a pending key by registration id
	jid := client.Store.GetJID().String()
	if jid == "" {
		jid = fmt.Sprintf("pending:%d", client.Store.RegistrationID)
	}
	// log registration details for debugging
	bn := ""
	regID := client.Store.RegistrationID
	if client != nil && client.Store != nil {
		bn = client.Store.BusinessName
	}
	zap.L().Info("whatsapp: registering client", zap.String("key", jid), zap.String("business_name", bn), zap.Int("registration_id", int(regID)), zap.Bool("has_jid", client.Store.GetJID().String() != ""))
	// register event handler for this client to capture QR and login events
	client.AddEventHandler(func(evt interface{}) {
		tname := fmt.Sprintf("%T", evt)
		switch {
		case strings.Contains(tname, "QR") || strings.Contains(tname, "QRCode") || strings.Contains(tname, "events.QR"):
			// Attempt to extract QR code from the event. Whatsmeow may emit
			// different proto message types (e.g. *events.QR). Try the common
			// GetCode() accessor first, otherwise fallback to printing the
			// proto text and extracting via regex.
			code := ""
			txt := ""
			// Emit quick metadata and an unconditional dump of the event so we
			// always have something in the logs to inspect (helps with unknown
			// whatsmeow builds / event shapes).
			hasGetCode := false
			if _, ok := evt.(interface{ GetCode() string }); ok {
				hasGetCode = true
			}
			isProto := false
			if _, ok := evt.(proto.Message); ok {
				isProto = true
			}
			zap.L().Info("whatsapp: qr event metadata", zap.String("type", tname), zap.Bool("has_getcode", hasGetCode), zap.Bool("is_proto", isProto), zap.String("jid", jid))
			// Always produce a fmt dump so we can inspect fields even when other
			// conversions fail.
			dump := fmt.Sprintf("%#v", evt)
			if dump != "" {
				out := dump
				if len(out) > 8192 {
					out = out[:8192] + "...<truncated>"
				}
				zap.L().Info("whatsapp: qr event dump (always)", zap.String("dump", out))
				// also make the textual dump available for regex extraction
				txt = out
			}
			if m, ok := evt.(interface{ GetCode() string }); ok {
				code = m.GetCode()
			} else if pm, ok := evt.(proto.Message); ok {
				// Log the full proto text for diagnostics (safe for debugging)
				// Marshal proto message to text for diagnostics
				if b, err := prototext.Marshal(pm); err == nil {
					txt = string(b)
					// Emit at INFO so it's visible in default log level during debugging
					zap.L().Info("whatsapp: raw qr proto (prototext)", zap.String("proto", txt))
				} else {
					zap.L().Debug("whatsapp: raw qr proto marshal failed", zap.Error(err))
				}
				// Try regex extraction for common field names: code, qr, data
				// case-insensitive
				reList := []string{`(?i)code:\s*"([^"]+)"`, `(?i)qr:\s*"([^"]+)"`, `(?i)data:\s*"([^"]+)"`}
				for _, r := range reList {
					re := regexp.MustCompile(r)
					if m := re.FindStringSubmatch(txt); len(m) > 1 {
						code = m[1]
						break
					}
				}
				// Special-case whatsmeow events.QR fmt-dump which contains Codes:[]string{"...",...}
				if code == "" && txt != "" {
					// Match the Codes array and extract the first quoted string
					codesRe := regexp.MustCompile(`(?s)Codes:\s*\[\]string\{((?:"[^"]+",?\s*)+)\}`)
					if m := codesRe.FindStringSubmatch(txt); len(m) > 1 {
						inner := m[1]
						// find first quoted string inside inner
						qRe := regexp.MustCompile(`"([^"]+)"`)
						if qm := qRe.FindStringSubmatch(inner); len(qm) > 1 {
							code = qm[1]
						}
					}
				}
				// As a last resort, pick the first quoted string present in the dump
				if code == "" && txt != "" {
					qRe := regexp.MustCompile(`"([^"]+)"`)
					if qm := qRe.FindStringSubmatch(txt); len(qm) > 1 {
						code = qm[1]
					}
				}
				// If we still have no textual proto, fall back to a Go-syntax dump of the event
				if code == "" && txt == "" {
					// Use fmt to produce a detailed representation; log at INFO so it is captured
					txt = fmt.Sprintf("%#v", evt)
					zap.L().Info("whatsapp: raw qr event dump (fmt)", zap.String("dump", txt))
				}
			}

			// If extraction hasn't produced a code yet, attempt regex extraction
			// against any textual dump we have (prototext or fmt dump). This
			// handles cases where the event isn't a proto.Message but our
			// fmt-dump contains the Codes:[]string{...} structure.
			if code == "" && txt != "" {
				// Special-case whatsmeow events.QR fmt-dump which contains Codes:[]string{"...",...}
				codesRe := regexp.MustCompile(`(?s)Codes:\s*\[\]string\{((?:"[^"]+",?\s*)+)\}`)
				if m := codesRe.FindStringSubmatch(txt); len(m) > 1 {
					inner := m[1]
					qRe := regexp.MustCompile(`"([^"]+)"`)
					if qm := qRe.FindStringSubmatch(inner); len(qm) > 1 {
						code = qm[1]
					}
				}
			}
			// As a last resort, pick the first quoted string present in the dump
			if code == "" && txt != "" {
				qRe := regexp.MustCompile(`"([^"]+)"`)
				if qm := qRe.FindStringSubmatch(txt); len(qm) > 1 {
					code = qm[1]
				}
			}

			if code != "" {
				s.qrLock.Lock()
				// store generic last QR for backward compat
				s.qr = jid + "|" + code
				s.qrLock.Unlock()
				// log BusinessName for debugging; this helps ensure mapping to app device
				bn := ""
				if client != nil && client.Store != nil {
					bn = client.Store.BusinessName
				}
				zap.L().Info("whatsapp: qr code event received", zap.String("jid", jid), zap.String("business_name", bn))
				// if BusinessName carries our app marker, store QR mapped to that app id
				if strings.HasPrefix(bn, "app_wad:") {
					var id int64
					if _, err := fmt.Sscan(strings.TrimPrefix(bn, "app_wad:"), &id); err == nil && id != 0 {
						s.qrMapMux.Lock()
						s.qrMap[id] = code
						s.qrMapMux.Unlock()
					}
				}
			} else {
				// If we failed to extract a code, emit the raw proto text at INFO so
				// it is visible in the running log for debugging. This helps us
				// learn the field names/structure used by whatsmeow in your
				// environment and improve extraction logic.
				if txt != "" {
					// truncate large proto text to 8k chars to avoid flooding logs
					out := txt
					if len(out) > 8192 {
						out = out[:8192] + "...<truncated>"
					}
					zap.L().Info("whatsapp: qr event received (unable to extract code) - raw proto:", zap.String("jid", jid), zap.String("proto", out))
				} else {
					zap.L().Info("whatsapp: qr event received (unable to extract code)", zap.String("jid", jid))
				}
			}
		case strings.HasSuffix(tname, ".Login") || strings.HasSuffix(tname, "events.Login"):
			s.qrLock.Lock()
			// clear QR for this device if it matches
			s.qr = ""
			s.qrLock.Unlock()
			// on login, migrate client key from pending to actual JID if necessary
			finalJID := client.Store.GetJID().String()
			if finalJID != "" {
				s.clientsMux.Lock()
				// remove old entry keyed by jid and store under finalJID
				delete(s.clients, jid)
				s.clients[finalJID] = client
				s.clientsMux.Unlock()
				zap.L().Info("whatsapp: login event", zap.String("jid", finalJID))
				// try update application mapping if BusinessName contains our marker
				bn := client.Store.BusinessName
				if strings.HasPrefix(bn, "app_wad:") {
					var id int64
					if _, err := fmt.Sscan(strings.TrimPrefix(bn, "app_wad:"), &id); err == nil && id != 0 {
						// update DB record
						if s.app != nil {
							db := s.app.DB()
							db.Model(&domain.WhatsAppDevice{}).Where("id = ?", id).Updates(map[string]interface{}{"jid": finalJID, "status": "connected"})
							// clear in-memory QR for this app id
							s.qrMapMux.Lock()
							delete(s.qrMap, id)
							s.qrMapMux.Unlock()
							// Now try to persist the client into sqlstore. Previously
							// PutDevice failed because JID wasn't known; now that we
							// have a final JID, attempt to store the device so it
							// survives restarts and auto-provision stops marking
							// provision_failed.
							if s.store != nil && client != nil && client.Store != nil {
								if err := s.store.PutDevice(context.Background(), client.Store); err != nil {
									zap.L().Warn("whatsapp: PutDevice failed after login (will keep in-memory)", zap.Error(err), zap.Int64("wad_id", id))
								} else {
									zap.L().Info("whatsapp: persisted whatsmeow device after login", zap.Int64("app_wad_id", id))
									// mark provisioned so the loop doesn't try again
									if err := db.Model(&domain.WhatsAppDevice{}).Where("id = ?", id).Update("status", "provisioned").Error; err != nil {
										zap.L().Warn("whatsapp: failed to update app device status after persisting post-login", zap.Error(err), zap.Int64("wad_id", id))
									}
								}
							}
						}
					}
				}
			}
		case strings.Contains(tname, "Connected") || strings.Contains(tname, "events.Connected"):
			// Some whatsmeow builds emit Connected/OfflineSync events but not
			// a Login event; treat Connected similar to Login for persistence.
			s.qrLock.Lock()
			s.qr = ""
			s.qrLock.Unlock()
			finalJID := client.Store.GetJID().String()
			if finalJID != "" {
				s.clientsMux.Lock()
				delete(s.clients, jid)
				s.clients[finalJID] = client
				s.clientsMux.Unlock()
				zap.L().Info("whatsapp: connected event", zap.String("jid", finalJID))
				bn := client.Store.BusinessName
				if strings.HasPrefix(bn, "app_wad:") {
					var id int64
					if _, err := fmt.Sscan(strings.TrimPrefix(bn, "app_wad:"), &id); err == nil && id != 0 {
						if s.app != nil {
							db := s.app.DB()
							// update application DB mapping
							if err := db.Model(&domain.WhatsAppDevice{}).Where("id = ?", id).Updates(map[string]interface{}{"jid": finalJID, "status": "connected"}).Error; err != nil {
								zap.L().Warn("whatsapp: failed to update app device status after connected event", zap.Error(err), zap.Int64("wad_id", id))
							} else {
								// clear per-device QR
								s.qrMapMux.Lock()
								delete(s.qrMap, id)
								s.qrMapMux.Unlock()
							}
							// attempt to persist the device now that JID is known
							if s.store != nil && client != nil && client.Store != nil {
								if err := s.store.PutDevice(context.Background(), client.Store); err != nil {
									zap.L().Warn("whatsapp: PutDevice failed after connected event (will keep in-memory)", zap.Error(err), zap.Int64("wad_id", id))
								} else {
									zap.L().Info("whatsapp: persisted whatsmeow device after connected event", zap.Int64("app_wad_id", id))
									if err := db.Model(&domain.WhatsAppDevice{}).Where("id = ?", id).Update("status", "provisioned").Error; err != nil {
										zap.L().Warn("whatsapp: failed to update app device status after persisting post-connected", zap.Error(err), zap.Int64("wad_id", id))
									}
								}
							}
						}
					}
				}
			}
		default:
			zap.L().Debug("whatsapp event", zap.String("type", fmt.Sprintf("%T", evt)), zap.String("jid", jid))
		}
	})

	s.clientsMux.Lock()
	s.clients[jid] = client
	s.clientsMux.Unlock()

	// Start a short-lived watcher that polls the client's stored JID and
	// updates the application DB if/when a final JID appears. This is a
	// safety-net for environments where the Login event is not emitted or
	// not observed by our handler for any reason.
	go func(cli *whatsmeow.Client, bn string, pendingKey string) {
		// if client already has a JID, update immediately
		if cli == nil || cli.Store == nil {
			return
		}
		// Poll for up to 60 seconds
		for i := 0; i < 60; i++ {
			jidObj := cli.Store.GetJID()
			finalJID := jidObj.String()
			if finalJID != "" {
				zap.L().Info("whatsapp: watcher detected final JID", zap.String("jid", finalJID), zap.String("business_name", bn))
				// attempt DB update if BusinessName contains our marker
				if strings.HasPrefix(bn, "app_wad:") && s.app != nil {
					var id int64
					if _, err := fmt.Sscan(strings.TrimPrefix(bn, "app_wad:"), &id); err == nil && id != 0 {
						db := s.app.DB()
						if err := db.Model(&domain.WhatsAppDevice{}).Where("id = ?", id).Updates(map[string]interface{}{"jid": finalJID, "status": "connected"}).Error; err != nil {
							zap.L().Warn("whatsapp: watcher failed to update app device after detecting JID", zap.Error(err), zap.Int64("wad_id", id))
						} else {
							// clear in-memory QR for this app id
							s.qrMapMux.Lock()
							delete(s.qrMap, id)
							s.qrMapMux.Unlock()
							zap.L().Info("whatsapp: watcher updated app device record", zap.Int64("wad_id", id), zap.String("jid", finalJID))
							// Try to persist the whatsmeow device now that JID is known.
							if s.store != nil && cli != nil && cli.Store != nil {
								if err := s.store.PutDevice(context.Background(), cli.Store); err != nil {
									zap.L().Warn("whatsapp: watcher PutDevice failed (will keep in-memory)", zap.Error(err), zap.Int64("wad_id", id))
								} else {
									zap.L().Info("whatsapp: watcher persisted whatsmeow device after detecting JID", zap.Int64("app_wad_id", id))
									if err := db.Model(&domain.WhatsAppDevice{}).Where("id = ?", id).Update("status", "provisioned").Error; err != nil {
										zap.L().Warn("whatsapp: watcher failed to update app device status after persisting", zap.Error(err), zap.Int64("wad_id", id))
									}
								}
							}
						}
					}
				}
				return
			}
			time.Sleep(1 * time.Second)
		}
	}(client, bn, jid)
}

// formatStoreMeta attempts to extract a few non-sensitive fields from a whatsmeow
// store.Device or client.Store for diagnostic logging when PutDevice fails.
func formatStoreMeta(d interface{}) string {
	if d == nil {
		return "<nil>"
	}
	// Try common proto-style getters first
	var reg string
	if g, ok := d.(interface{ GetRegistrationId() uint32 }); ok {
		reg = fmt.Sprintf("%d", g.GetRegistrationId())
	} else if g, ok := d.(interface{ GetRegistrationID() uint32 }); ok {
		reg = fmt.Sprintf("%d", g.GetRegistrationID())
	}
	var bn, push, jid string
	if g, ok := d.(interface{ GetBusinessName() string }); ok {
		bn = g.GetBusinessName()
	}
	if g, ok := d.(interface{ GetPushName() string }); ok {
		push = g.GetPushName()
	}
	if g, ok := d.(interface {
		GetJID() interface{ String() string }
	}); ok {
		jid = g.GetJID().String()
	}
	// Reflection fallback for struct fields named similarly
	if reg == "" || bn == "" || push == "" || jid == "" {
		rv := reflect.ValueOf(d)
		if rv.Kind() == reflect.Ptr {
			rv = rv.Elem()
		}
		if rv.IsValid() && rv.Kind() == reflect.Struct {
			if reg == "" {
				if f := rv.FieldByName("RegistrationID"); f.IsValid() {
					reg = fmt.Sprintf("%v", f.Interface())
				}
			}
			if bn == "" {
				if f := rv.FieldByName("BusinessName"); f.IsValid() {
					bn = fmt.Sprintf("%v", f.Interface())
				}
			}
			if push == "" {
				if f := rv.FieldByName("PushName"); f.IsValid() {
					push = fmt.Sprintf("%v", f.Interface())
				}
			}
			if jid == "" {
				if f := rv.FieldByName("Jid"); f.IsValid() {
					jid = fmt.Sprintf("%v", f.Interface())
				}
			}
		}
	}
	return fmt.Sprintf("reg=%s,bn=%s,push=%s,jid=%s", reg, bn, push, jid)
}

// PersistAppClient attempts to persist an already-created in-memory whatsmeow
// client for the given application device id into the sqlstore so it survives
// restarts. Returns an error if no in-memory client exists or persistence fails.
func (s *Service) PersistAppClient(ctx context.Context, id int64) error {
	if s == nil || s.store == nil {
		return fmt.Errorf("whatsapp service not initialized")
	}
	marker := fmt.Sprintf("app_wad:%d", id)
	var cli *whatsmeow.Client
	s.clientsMux.RLock()
	for _, c := range s.clients {
		if c == nil || c.Store == nil {
			continue
		}
		if c.Store.BusinessName == marker {
			cli = c
			break
		}
	}
	s.clientsMux.RUnlock()
	if cli == nil {
		return fmt.Errorf("no in-memory client found for app device %d", id)
	}
	// Ensure the store.Device has our BusinessName marker so it will be
	// discoverable by future auto-provision scans.
	if cli.Store.BusinessName == "" {
		cli.Store.BusinessName = marker
	}
	if cli.Store.PushName == "" {
		// best-effort set PushName from app device name if available in DB
		var wad domain.WhatsAppDevice
		if s.app != nil {
			if err := s.app.DB().Where("id = ?", id).First(&wad).Error; err == nil {
				cli.Store.PushName = wad.Name
			}
		}
	}
	// Ensure the client has a final JID before attempting to persist. Some
	// whatsmeow/sqlstore implementations require the JID to be present when
	// writing to the database. Return a clear error if not available so the
	// caller (and admin UI) can surface a helpful message.
	if cli.Store.GetJID().String() == "" {
		zap.L().Warn("whatsapp: PersistAppClient failed - missing JID", zap.Int64("wad_id", id), zap.String("meta", formatStoreMeta(cli.Store)))
		return fmt.Errorf("device JID must be known before persisting")
	}

	// Attempt persistence
	if err := s.store.PutDevice(ctx, cli.Store); err != nil {
		zap.L().Warn("whatsapp: PersistAppClient PutDevice failed", zap.Error(err), zap.String("meta", formatStoreMeta(cli.Store)), zap.Int64("wad_id", id))
		return err
	}
	// Update app DB row
	if s.app != nil {
		db := s.app.DB()
		if err := db.Model(&domain.WhatsAppDevice{}).Where("id = ?", id).Updates(map[string]interface{}{"status": "provisioned", "jid": cli.Store.GetJID().String()}).Error; err != nil {
			zap.L().Warn("whatsapp: persisted device but failed to update app record", zap.Error(err), zap.Int64("wad_id", id))
			return err
		}
	}
	zap.L().Info("whatsapp: PersistAppClient succeeded", zap.Int64("wad_id", id))
	return nil
}

// ListDevices returns a lightweight representation of configured devices.
// Each item contains the device JID and whether a client instance exists in memory.
func (s *Service) ListDevices(ctx context.Context) ([]map[string]interface{}, error) {
	if s == nil || s.store == nil {
		return nil, fmt.Errorf("service not initialized")
	}
	devs, err := s.store.GetAllDevices(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]map[string]interface{}, 0, len(devs))
	for _, d := range devs {
		jid := ""
		if d != nil {
			jid = d.GetJID().String()
		}
		s.clientsMux.RLock()
		_, has := s.clients[jid]
		s.clientsMux.RUnlock()
		out = append(out, map[string]interface{}{"jid": jid, "has_client": has})
	}
	return out, nil
}

// GetDeviceQRCode returns the QR code for a given application WhatsAppDevice id.
func (s *Service) GetDeviceQRCode(id int64) string {
	if s == nil {
		return ""
	}
	s.qrMapMux.RLock()
	code := s.qrMap[id]
	s.qrMapMux.RUnlock()
	if code != "" {
		zap.L().Info("whatsapp: GetDeviceQRCode called", zap.Int64("app_id", id), zap.Int("code_len", len(code)))
	} else {
		zap.L().Debug("whatsapp: GetDeviceQRCode called - no per-device QR available", zap.Int64("app_id", id))
	}
	return code
}

// ConnectDeviceByAppID finds the in-memory client registered with BusinessName marker and triggers a Connect.
func (s *Service) ConnectDeviceByAppID(id int64) error {
	if s == nil {
		return fmt.Errorf("service not initialized")
	}
	targetMarker := fmt.Sprintf("app_wad:%d", id)
	s.clientsMux.RLock()
	defer s.clientsMux.RUnlock()
	for key, c := range s.clients {
		if c == nil || c.Store == nil {
			continue
		}
		if c.Store.BusinessName == targetMarker || key == fmt.Sprintf("pending:%d", c.Store.RegistrationID) {
			zap.L().Info("whatsapp: connecting client for app id", zap.Int64("app_id", id), zap.String("client_key", key), zap.String("business_name", c.Store.BusinessName))
			go func(cli *whatsmeow.Client) {
				if err := cli.Connect(); err != nil {
					zap.L().Warn("whatsapp: device connect failed (by app id)", zap.Error(err), zap.Int64("app_id", id))
				}
			}(c)
			return nil
		}
	}
	// no client found: log current clients to help debugging
	var details []string
	for k, c := range s.clients {
		bn := ""
		rid := 0
		if c != nil && c.Store != nil {
			bn = c.Store.BusinessName
			rid = int(c.Store.RegistrationID)
		}
		details = append(details, fmt.Sprintf("%s(bn=%s,rid=%d)", k, bn, rid))
	}
	zap.L().Warn("whatsapp: no client found for requested app id", zap.Int64("app_id", id), zap.Strings("clients", details))
	return fmt.Errorf("no client found for app id %d", id)
}

// DisconnectDeviceByAppID attempts to find an in-memory client for the application
// device id and disconnect it. It also clears the app device JID and sets status
// to "provisioned" so the UI reflects a disconnected but provisioned device.
func (s *Service) DisconnectDeviceByAppID(id int64) error {
	if s == nil {
		return fmt.Errorf("service not initialized")
	}
	marker := fmt.Sprintf("app_wad:%d", id)
	var found bool
	s.clientsMux.RLock()
	for key, c := range s.clients {
		if c == nil || c.Store == nil {
			continue
		}
		// Match by BusinessName marker or any client key that contains our marker
		// (the key may be a pending: registration id string). Avoid comparing
		// JID to the marker.
		if c.Store.BusinessName == marker || strings.Contains(key, marker) {
			found = true
			go func(cli *whatsmeow.Client, k string) {
				zap.L().Info("whatsapp: disconnecting client for app id", zap.Int64("app_id", id), zap.String("client_key", k))
				cli.Disconnect()
			}(c, key)
			break
		}
	}
	s.clientsMux.RUnlock()
	if !found {
		return fmt.Errorf("no in-memory client found for app device %d", id)
	}
	// update app DB status: clear jid and mark provisioned
	if s.app != nil {
		db := s.app.DB()
		if err := db.Model(&domain.WhatsAppDevice{}).Where("id = ?", id).Updates(map[string]interface{}{"jid": "", "status": "provisioned"}).Error; err != nil {
			zap.L().Warn("whatsapp: failed to update app device after disconnect", zap.Error(err), zap.Int64("wad_id", id))
			return err
		}
	}
	return nil
}

// RemoveAppDevice deletes the application-level WhatsAppDevice record and
// attempts to disconnect any in-memory client. It does not currently remove
// persisted whatsmeow store devices from the sqlstore to avoid accidental
// data loss; that can be implemented if necessary.
func (s *Service) RemoveAppDevice(ctx context.Context, id int64, deleteStore bool) error {
	if s == nil || s.app == nil {
		return fmt.Errorf("service not initialized")
	}
	// Attempt to disconnect in-memory client if present
	marker := fmt.Sprintf("app_wad:%d", id)
	s.clientsMux.RLock()
	for key, c := range s.clients {
		if c == nil || c.Store == nil {
			continue
		}
		if c.Store.BusinessName == marker || strings.Contains(key, fmt.Sprintf("app_wad:%d", id)) {
			go func(cli *whatsmeow.Client, k string) {
				zap.L().Info("whatsapp: disconnecting client prior to removal", zap.Int64("app_id", id), zap.String("client_key", k))
				cli.Disconnect()
			}(c, key)
			break
		}
	}
	s.clientsMux.RUnlock()

	// If requested, attempt to remove the persisted whatsmeow store device.
	if deleteStore {
		// Attempt to locate persisted store.Device entries that match our
		// application marker (BusinessName == marker). As a fallback try to
		// match by phone number stored in the application DB row.
		var wad domain.WhatsAppDevice
		if s.app != nil {
			if err := s.app.DB().Where("id = ?", id).First(&wad).Error; err != nil {
				zap.L().Warn("whatsapp: unable to load app device for delete_store matching", zap.Error(err), zap.Int64("wad_id", id))
			}
		}

		// list stored devices and find matches
		stored, err := s.store.GetAllDevices(ctx)
		if err != nil {
			zap.L().Warn("whatsapp: failed to list stored devices for delete_store", zap.Error(err), zap.Int64("wad_id", id))
			return err
		}
		var deletedAny bool
		for _, sd := range stored {
			if sd == nil {
				continue
			}
			bn := sd.BusinessName
			jidStr := sd.GetJID().String()
			match := false
			if bn == marker {
				match = true
			} else if wad.Phone != "" && jidStr != "" && strings.Contains(jidStr, wad.Phone) {
				match = true
			}
			if !match {
				continue
			}
			// Disconnect any in-memory client that uses this persisted device
			s.clientsMux.RLock()
			for key, c := range s.clients {
				if c == nil || c.Store == nil {
					continue
				}
				if c.Store.BusinessName == bn || strings.Contains(key, bn) {
					go func(cli *whatsmeow.Client, k string) {
						zap.L().Info("whatsapp: disconnecting client prior to persisted device deletion", zap.Int64("app_id", id), zap.String("client_key", k))
						cli.Disconnect()
					}(c, key)
					break
				}
			}
			s.clientsMux.RUnlock()

			// perform persisted device deletion
			if err := s.store.DeleteDevice(ctx, sd); err != nil {
				zap.L().Warn("whatsapp: failed to delete persisted store device", zap.Error(err), zap.String("business_name", bn), zap.String("jid", jidStr))
				return err
			}
			zap.L().Info("whatsapp: deleted persisted whatsmeow store device", zap.String("business_name", bn), zap.String("jid", jidStr))
			deletedAny = true
		}
		if !deletedAny {
			zap.L().Warn("whatsapp: delete_store requested but no matching persisted device found", zap.Int64("app_wad_id", id))
		}
	}

	// Delete application DB record
	db := s.app.DB()
	if err := db.Delete(&domain.WhatsAppDevice{}, id).Error; err != nil {
		zap.L().Warn("whatsapp: failed to delete app device record", zap.Error(err), zap.Int64("wad_id", id))
		return err
	}
	zap.L().Info("whatsapp: app device record removed", zap.Int64("app_wad_id", id))
	return nil
}

// ConnectDevice triggers a connect for a specific device client if it exists in memory.
func (s *Service) ConnectDevice(jid string) error {
	if s == nil {
		return fmt.Errorf("service not initialized")
	}
	s.clientsMux.RLock()
	cli, ok := s.clients[jid]
	s.clientsMux.RUnlock()
	if !ok || cli == nil {
		return fmt.Errorf("device not found: %s", jid)
	}
	zap.L().Info("whatsapp: ConnectDevice called - starting connect", zap.String("jid", jid), zap.String("business_name", cli.Store.BusinessName))
	go func() {
		if err := cli.Connect(); err != nil {
			zap.L().Warn("whatsapp: device connect failed", zap.Error(err), zap.String("jid", jid))
		}
	}()
	return nil
}

// CreateDevice persists a new WhatsAppDevice entry linked to an existing NetNode.
// It does NOT yet provision a whatsmeow sqlstore Device row; that is a follow-up step.
// Returns the newly created database ID.
func (s *Service) CreateDevice(ctx context.Context, nodeID string, phone string, name string) (int64, error) {
	if s == nil || s.app == nil {
		return 0, fmt.Errorf("service not initialized")
	}
	// nodeID is expected to be numeric (string form). Convert to int64.
	var nid int64
	_, err := fmt.Sscan(nodeID, &nid)
	if err != nil || nid == 0 {
		return 0, fmt.Errorf("invalid node id: %s", nodeID)
	}

	// verify node exists
	db := s.app.DB()
	var node interface{}
	if err := db.Table("net_node").Where("id = ?", nid).First(&node).Error; err != nil {
		return 0, fmt.Errorf("node not found: %v", err)
	}

	// create WhatsAppDevice record
	wad := &domain.WhatsAppDevice{
		NodeId: nid,
		Phone:  phone,
		Name:   name,
		Status: "created",
	}
	if err := db.Create(wad).Error; err != nil {
		return 0, err
	}

	// Persist a contact in system partners to keep phone records centralized.
	// Ensure we don't create duplicate partner entries for the same phone.
	// We check both Mobile and Phone fields for an existing record.
	var existing domain.SysPartner
	if err := db.Where("mobile = ? OR phone = ?", phone, phone).First(&existing).Error; err == nil {
		// found existing partner; update name if missing
		if existing.Name == "" && name != "" {
			_ = db.Model(&domain.SysPartner{}).Where("id = ?", existing.ID).Update("name", name).Error
		}
		zap.L().Info("whatsapp: partner already exists for phone, skipping create", zap.String("phone", phone), zap.Int64("partner_id", existing.ID))
	} else {
		// create new partner record
		partner := &domain.SysPartner{
			Name:   name,
			Mobile: phone,
			Phone:  phone,
		}
		if err := db.Create(partner).Error; err != nil {
			// Log but do not fail device creation - partner creation is best-effort
			zap.L().Warn("whatsapp: failed to create sys partner for device", zap.Error(err), zap.String("phone", phone))
		} else {
			zap.L().Info("whatsapp: created sys partner for device", zap.Int64("partner_id", partner.ID), zap.String("phone", phone))
		}
	}

	// Provision a whatsmeow store.Device. Set BusinessName to a marker containing the
	// application record ID so we can update it after pairing. Persist the device to
	// the sqlstore so the container and future restarts will be aware of it.
	dev := s.store.NewDevice()
	dev.PushName = name
	dev.BusinessName = fmt.Sprintf("app_wad:%d", wad.ID)

	// Persist device to sqlstore so it is visible across restarts and GetAllDevices
	if err := s.store.PutDevice(context.Background(), dev); err != nil {
		zap.L().Warn("whatsapp: PutDevice failed - continuing with in-memory device", zap.Error(err), zap.Int64("wad_id", wad.ID))
	} else {
		zap.L().Info("whatsapp: persisted whatsmeow device to sqlstore", zap.Int64("app_wad_id", wad.ID))
	}

	// create and register client (will perform pairing on Connect)
	client := whatsmeow.NewClient(dev, nil)
	s.registerClient(client)

	// auto-connect to start pairing and emit QR
	go func() {
		zap.L().Info("whatsapp: auto-connect starting for new device", zap.Int64("wad_id", wad.ID), zap.String("business_name", dev.BusinessName))
		if err := client.Connect(); err != nil {
			zap.L().Warn("whatsapp: auto-connect failed for new device", zap.Error(err), zap.Int64("wad_id", wad.ID))
		}
	}()

	return wad.ID, nil
}

// ProvisionAppDevice provisions an existing application WhatsAppDevice into the whatsmeow sqlstore
// and registers a client for pairing. This is useful when the app-level device was created
// while the whatsmeow service was not running.
func (s *Service) ProvisionAppDevice(ctx context.Context, id int64) error {
	if s == nil || s.app == nil {
		return fmt.Errorf("service not initialized")
	}
	db := s.app.DB()
	var wad domain.WhatsAppDevice
	if err := db.Where("id = ?", id).First(&wad).Error; err != nil {
		return fmt.Errorf("app device not found: %w", err)
	}

	// create whatsmeow store device
	dev := s.store.NewDevice()
	dev.PushName = wad.Name
	dev.BusinessName = fmt.Sprintf("app_wad:%d", wad.ID)

	if err := s.store.PutDevice(ctx, dev); err != nil {
		// Persist failed. Instead of returning an error, fall back to creating
		// an in-memory client and starting pairing so admins can pair the
		// device immediately via the provision API even when persistence fails.
		zap.L().Warn("whatsapp: PutDevice failed during provision (falling back to in-memory)", zap.Error(err), zap.Int64("wad_id", wad.ID))
		client := whatsmeow.NewClient(dev, nil)
		s.registerClient(client)
		go func() {
			zap.L().Info("whatsapp: auto-connect starting for provisioned device (in-memory)", zap.Int64("wad_id", wad.ID), zap.String("business_name", dev.BusinessName))
			if err := client.Connect(); err != nil {
				zap.L().Warn("whatsapp: auto-connect failed for provisioned device (in-memory)", zap.Error(err), zap.Int64("wad_id", wad.ID))
			}
		}()
		// mark application record as provisioning so UI reflects an active attempt
		if err := db.Model(&domain.WhatsAppDevice{}).Where("id = ?", wad.ID).Updates(map[string]interface{}{"status": "provisioning"}).Error; err != nil {
			zap.L().Warn("whatsapp: failed to update app device status after in-memory provision", zap.Error(err), zap.Int64("wad_id", wad.ID))
		}
		return nil
	}
	zap.L().Info("whatsapp: persisted whatsmeow device to sqlstore (provision)", zap.Int64("app_wad_id", wad.ID))

	client := whatsmeow.NewClient(dev, nil)
	s.registerClient(client)

	// try to connect to start pairing
	go func() {
		zap.L().Info("whatsapp: auto-connect starting for provisioned device", zap.Int64("wad_id", wad.ID), zap.String("business_name", dev.BusinessName))
		if err := client.Connect(); err != nil {
			zap.L().Warn("whatsapp: auto-connect failed for provisioned device", zap.Error(err), zap.Int64("wad_id", wad.ID))
		}
	}()

	// update application record status to indicate provisioned
	if err := db.Model(&domain.WhatsAppDevice{}).Where("id = ?", wad.ID).Updates(map[string]interface{}{"status": "provisioned"}).Error; err != nil {
		zap.L().Warn("whatsapp: failed to update app device status after provision", zap.Error(err), zap.Int64("wad_id", wad.ID))
	}

	return nil
}

// Get returns the running WhatsApp service instance or nil if not
// initialized.
func Get() *Service {
	globalSvcLock.RLock()
	defer globalSvcLock.RUnlock()
	return globalSvc
}

// GetStoredJIDString returns the stored device JID string if available, empty string otherwise.
func (s *Service) GetStoredJIDString() string {
	if s == nil {
		return ""
	}
	// return first known stored JID if any
	s.clientsMux.RLock()
	for _, c := range s.clients {
		if c == nil || c.Store == nil {
			continue
		}
		jid := c.Store.GetJID()
		if jid.String() != "" {
			s.clientsMux.RUnlock()
			return jid.String()
		}
	}
	s.clientsMux.RUnlock()
	return ""
}

// autoProvisionLoop periodically scans application WhatsAppDevice rows and
// provisions any missing whatsmeow store devices so devices created at runtime
// are picked up automatically.
func (s *Service) autoProvisionLoop() {
	if s == nil || s.store == nil || s.app == nil {
		return
	}
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		// list whatsmeow store devices
		stored, err := s.store.GetAllDevices(context.Background())
		if err != nil {
			zap.L().Warn("whatsapp: autoProvisionLoop failed to list store devices", zap.Error(err))
			continue
		}
		existingBN := make(map[string]bool)
		for _, d := range stored {
			if d == nil {
				continue
			}
			if getter, ok := interface{}(d).(interface{ GetBusinessName() string }); ok {
				bn := getter.GetBusinessName()
				if bn != "" {
					existingBN[bn] = true
				}
			}
		}

		// find app devices
		var appDevs []domain.WhatsAppDevice
		if err := s.app.DB().Find(&appDevs).Error; err != nil {
			zap.L().Warn("whatsapp: autoProvisionLoop failed to query app devices", zap.Error(err))
			continue
		}
		for _, wad := range appDevs {
			// Skip devices previously marked as failed to provision
			if strings.ToLower(strings.TrimSpace(wad.Status)) == "provision_failed" {
				// But check if there is an in-memory client with the marker that has completed pairing (has JID)
				// If so, attempt to persist it now that it's connected
				marker := fmt.Sprintf("app_wad:%d", wad.ID)
				s.clientsMux.RLock()
				// For diagnostics, collect current in-memory client details so we
				// can see why auto-persist may not find a matching client.
				var clientDetails []string
				for k, cli := range s.clients {
					bn := ""
					jidStr := ""
					rid := 0
					if cli != nil && cli.Store != nil {
						bn = cli.Store.BusinessName
						jidStr = cli.Store.GetJID().String()
						rid = int(cli.Store.RegistrationID)
					}
					clientDetails = append(clientDetails, fmt.Sprintf("%s(bn=%s,jid=%s,rid=%d)", k, bn, jidStr, rid))
				}
				zap.L().Debug("whatsapp: autoProvisionLoop in-memory clients", zap.Strings("clients", clientDetails))
				for _, cli := range s.clients {
					if cli == nil || cli.Store == nil {
						continue
					}
					jidStr := cli.Store.GetJID().String()
					// Match if BusinessName equals marker, or as a fallback match
					// if the connected client's JID contains the app device phone
					// number (helps when BusinessName wasn't set on the in-memory
					// client).
					match := false
					if cli.Store.BusinessName == marker {
						match = true
					} else if wad.Phone != "" && jidStr != "" && strings.Contains(jidStr, wad.Phone) {
						match = true
					} else if cli.Store.PushName == wad.Name {
						match = true
					}
					if !match {
						continue
					}
					if jidStr == "" {
						zap.L().Warn("whatsapp: skipping auto-persist due to missing JID", zap.Int64("wad_id", wad.ID), zap.String("meta", formatStoreMeta(cli.Store)))
						continue
					}
					zap.L().Info("whatsapp: attempting to persist in-memory client", zap.Int64("wad_id", wad.ID), zap.String("jid", jidStr), zap.String("business_name", cli.Store.BusinessName), zap.String("push_name", cli.Store.PushName))
					// Ensure BusinessName/PushName are set so the persisted device
					// is discoverable by future GetAllDevices scans.
					if cli.Store.BusinessName == "" {
						cli.Store.BusinessName = marker
					}
					if cli.Store.PushName == "" {
						cli.Store.PushName = wad.Name
					}
					// Attempt to persist this connected in-memory client
					if err := s.store.PutDevice(context.Background(), cli.Store); err != nil {
						zap.L().Warn("whatsapp: auto-persist in-memory client failed", zap.Error(err), zap.String("meta", formatStoreMeta(cli.Store)), zap.Int64("wad_id", wad.ID))
					} else {
						zap.L().Info("whatsapp: auto-persisted connected in-memory client", zap.Int64("wad_id", wad.ID))
						// Update status to provisioned and set JID
						if err := s.app.DB().Model(&domain.WhatsAppDevice{}).Where("id = ?", wad.ID).Updates(map[string]interface{}{"status": "provisioned", "jid": jidStr}).Error; err != nil {
							zap.L().Warn("whatsapp: failed to update app device status after auto-persist", zap.Error(err), zap.Int64("wad_id", wad.ID))
						}
					}
					break // only one client per marker
				}
				s.clientsMux.RUnlock()
				zap.L().Debug("whatsapp: skipping auto-provision loop for app device marked provision_failed", zap.Int64("wad_id", wad.ID))
				continue
			}
			marker := fmt.Sprintf("app_wad:%d", wad.ID)
			if existingBN[marker] {
				continue
			}
			// create and persist store device
			dev := s.store.NewDevice()
			dev.PushName = wad.Name
			dev.BusinessName = marker
			if err := s.store.PutDevice(context.Background(), dev); err != nil {
				zap.L().Warn("whatsapp: PutDevice failed during auto-provision loop (marking provision_failed)", zap.Error(err), zap.Int64("wad_id", wad.ID))
				if err := s.app.DB().Model(&domain.WhatsAppDevice{}).Where("id = ?", wad.ID).Updates(map[string]interface{}{"status": "provision_failed"}).Error; err != nil {
					zap.L().Warn("whatsapp: failed to mark app device as provision_failed (loop)", zap.Error(err), zap.Int64("wad_id", wad.ID))
				}
				// do not register in-memory client on persistent failure
				continue
			}
			zap.L().Info("whatsapp: auto-provisioned whatsmeow device (loop)", zap.Int64("app_wad_id", wad.ID))
			// register client and auto-connect
			client := whatsmeow.NewClient(dev, nil)
			s.registerClient(client)
			go func(cli *whatsmeow.Client, id int64) {
				zap.L().Info("whatsapp: auto-connect starting for auto-provisioned device (loop)", zap.Int64("wad_id", id), zap.String("business_name", marker))
				if err := cli.Connect(); err != nil {
					zap.L().Warn("whatsapp: auto-connect failed for auto-provisioned device (loop)", zap.Error(err), zap.Int64("wad_id", id))
				}
			}(client, wad.ID)
			// mark as provisioned
			if err := s.app.DB().Model(&domain.WhatsAppDevice{}).Where("id = ?", wad.ID).Update("status", "provisioned").Error; err != nil {
				zap.L().Warn("whatsapp: failed to update app device status after auto-provision (loop)", zap.Error(err), zap.Int64("wad_id", wad.ID))
			}
		}
	}
}
