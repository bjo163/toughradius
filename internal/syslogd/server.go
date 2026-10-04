// Package syslogd receives, parses, and tenant-attributes network-device syslog events.
package syslogd

import (
	"context"
	"fmt"
	"net"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/bjo163/mwx-isp/internal/domain"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

var severityNames = map[int]string{
	0: "emergency",
	1: "alert",
	2: "critical",
	3: "error",
	4: "warning",
	5: "notice",
	6: "info",
	7: "debug",
}

// SeverityName returns the human-readable severity label.
func SeverityName(severity int) string {
	if name, ok := severityNames[severity]; ok {
		return name
	}
	return "info"
}

// Server is an embedded UDP Syslog listener conforming to RFC 3164 and RFC 5424.
type Server struct {
	db      *gorm.DB
	addr    string
	conn    *net.UDPConn
	queue   chan *domain.SyslogEvent
	stopCh  chan struct{}
	wg      sync.WaitGroup
	mu      sync.Mutex
	running bool
}

// NewServer creates a new Syslog UDP server instance.
func NewServer(db *gorm.DB, addr string) *Server {
	if addr == "" {
		addr = ":1514"
	}
	return &Server{
		db:     db,
		addr:   addr,
		queue:  make(chan *domain.SyslogEvent, 1024),
		stopCh: make(chan struct{}),
	}
}

// Start begins listening on the configured UDP port and spawning background worker.
func (s *Server) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.running {
		return nil
	}

	udpAddr, err := net.ResolveUDPAddr("udp", s.addr)
	if err != nil {
		return fmt.Errorf("resolve syslog udp addr: %w", err)
	}

	conn, err := net.ListenUDP("udp", udpAddr)
	if err != nil {
		return fmt.Errorf("listen syslog udp: %w", err)
	}
	s.conn = conn
	s.running = true

	// Spawn batch persistence worker
	s.wg.Add(1)
	go s.worker()

	// Spawn UDP listener
	s.wg.Add(1)
	go s.listener()

	zap.L().Info("syslog udp server started", zap.String("addr", s.addr))
	return nil
}

// Stop gracefully stops the UDP listener and flushes remaining queue items.
func (s *Server) Stop() {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return
	}
	s.running = false
	close(s.stopCh)
	if s.conn != nil {
		_ = s.conn.Close()
	}
	s.mu.Unlock()

	s.wg.Wait()
	zap.L().Info("syslog udp server stopped")
}

func (s *Server) listener() {
	defer s.wg.Done()
	buf := make([]byte, 8192)

	for {
		n, remoteAddr, err := s.conn.ReadFrom(buf)
		if err != nil {
			select {
			case <-s.stopCh:
				return
			default:
				// If closed
				return
			}
		}

		raw := string(buf[:n])
		remoteIP := ""
		if udp, ok := remoteAddr.(*net.UDPAddr); ok {
			remoteIP = udp.IP.String()
		}

		event := ParseSyslogPacket(raw, remoteIP)
		select {
		case s.queue <- event:
		default:
			// Queue full under high traffic; drop packet to prevent blocking UDP reader
		}
	}
}

func (s *Server) worker() {
	defer s.wg.Done()
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	var batch []*domain.SyslogEvent

	flush := func() {
		if len(batch) == 0 {
			return
		}
		if s.db != nil {
			// A network packet has no authenticated request context. Attribute it
			// only to a registered NAS; unknown sources are discarded.
			accepted := make([]*domain.SyslogEvent, 0, len(batch))
			for _, event := range batch {
				var nas domain.NetNas
				if err := s.db.Select("tenant_id").Where("ipaddr = ?", event.NasIP).First(&nas).Error; err != nil {
					continue
				}
				event.TenantID = nas.TenantID
				accepted = append(accepted, event)
			}
			if len(accepted) > 0 {
				_ = s.db.Create(&accepted)
			}
		}
		batch = nil
	}

	for {
		select {
		case <-s.stopCh:
			// Flush remaining
			for {
				select {
				case ev := <-s.queue:
					batch = append(batch, ev)
					if len(batch) >= 100 {
						flush()
					}
				default:
					flush()
					return
				}
			}
		case ev := <-s.queue:
			batch = append(batch, ev)
			if len(batch) >= 50 {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

var (
	priRegex           = regexp.MustCompile(`^<(\d{1,3})>`)
	rfc3164HeaderRegex = regexp.MustCompile(`^[A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2}(?:\s+[^\s:]+)?\s+`)
	rfc5424HeaderRegex = regexp.MustCompile(`^1\s+\S+\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(?:-\s+)?`)
)

// ParseSyslogPacket parses an RFC 3164 or RFC 5424 syslog string into a domain.SyslogEvent.
func ParseSyslogPacket(raw, remoteIP string) *domain.SyslogEvent {
	raw = strings.TrimSpace(raw)
	facility := 1 // default user-level
	severity := 6 // default informational

	// Extract PRI if present
	if match := priRegex.FindStringSubmatch(raw); len(match) > 1 {
		if priVal, err := strconv.Atoi(match[1]); err == nil && priVal >= 0 && priVal <= 191 {
			facility = priVal / 8
			severity = priVal % 8
		}
		raw = raw[len(match[0]):]
	}

	raw = strings.TrimSpace(raw)
	tag := "system"
	msg := raw

	// Strip RFC 5424 header
	if match := rfc5424HeaderRegex.FindStringSubmatch(raw); len(match) > 2 {
		tag = match[2] // app-name
		msg = strings.TrimSpace(raw[len(match[0]):])
		return &domain.SyslogEvent{
			NasIP:        remoteIP,
			Facility:     facility,
			Severity:     severity,
			SeverityName: SeverityName(severity),
			Tag:          tag,
			Message:      msg,
			CreatedAt:    time.Now(),
		}
	}

	// Strip RFC 3164 header (e.g. "Oct 04 11:15:00 router1 ")
	if match := rfc3164HeaderRegex.FindString(raw); match != "" {
		raw = raw[len(match):]
	}

	// Now raw starts with "tag: message" or "tag[pid]: message" or just "message"
	colonIdx := strings.Index(raw, ":")
	if colonIdx > 0 && colonIdx < 50 {
		tagCandidate := strings.TrimSpace(raw[:colonIdx])
		if bracketIdx := strings.Index(tagCandidate, "["); bracketIdx > 0 {
			tagCandidate = tagCandidate[:bracketIdx]
		}
		if tagCandidate != "" {
			tag = tagCandidate
		}
		msg = strings.TrimSpace(raw[colonIdx+1:])
	}

	return &domain.SyslogEvent{
		NasIP:        remoteIP,
		Facility:     facility,
		Severity:     severity,
		SeverityName: SeverityName(severity),
		Tag:          tag,
		Message:      msg,
		CreatedAt:    time.Now(),
	}
}

// IngestManual records a syslog event directly into the database (e.g. for testing or local routing).
func (s *Server) IngestManual(ctx context.Context, event *domain.SyslogEvent) error {
	if s.db == nil {
		return nil
	}
	return s.db.WithContext(ctx).Create(event).Error
}
