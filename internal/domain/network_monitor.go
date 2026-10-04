package domain

import "time"

// NetMonitorTarget describes one operator-approved network endpoint and its
// bounded, read-only health checks. SNMP credential fields contain authenticated
// ciphertext and are never included in JSON responses.
type NetMonitorTarget struct {
	ID                      int64      `json:"id,string"`
	TenantID                int64      `json:"-" gorm:"not null;default:1;uniqueIndex:udx_net_monitor_target_tenant_name,priority:1;index"`
	Name                    string     `json:"name" gorm:"size:120;not null;uniqueIndex:udx_net_monitor_target_tenant_name,priority:2"`
	Kind                    string     `json:"kind" gorm:"size:24;not null"`
	Address                 string     `json:"address" gorm:"size:45;not null;index"`
	ProbeType               string     `json:"probe_type" gorm:"size:12;not null"`
	Port                    int        `json:"port"`
	IntervalSeconds         int        `json:"interval_seconds" gorm:"not null;default:60"`
	TimeoutMilliseconds     int        `json:"timeout_milliseconds" gorm:"not null;default:1500"`
	FailureThreshold        int        `json:"failure_threshold" gorm:"not null;default:2"`
	SNMPVersion             string     `json:"snmp_version" gorm:"size:8"`
	SNMPUsername            string     `json:"snmp_username,omitempty" gorm:"size:64"`
	SNMPAuthProtocol        string     `json:"snmp_auth_protocol,omitempty" gorm:"size:16"`
	SNMPPrivacyProtocol     string     `json:"snmp_privacy_protocol,omitempty" gorm:"size:16"`
	SNMPCommunityEncrypted  []byte     `json:"-"`
	SNMPAuthEncrypted       []byte     `json:"-"`
	SNMPPrivacyEncrypted    []byte     `json:"-"`
	Enabled                 bool       `json:"enabled" gorm:"not null;default:true;index"`
	LastStatus              string     `json:"last_status" gorm:"size:12;not null;default:unknown"`
	ConsecutiveFailures     int        `json:"-" gorm:"not null;default:0"`
	LastLatencyMilliseconds int64      `json:"last_latency_milliseconds"`
	LastPacketLossPercent   float64    `json:"last_packet_loss_percent"`
	LastCheckedAt           *time.Time `json:"last_checked_at"`
	LastError               string     `json:"last_error,omitempty" gorm:"size:240"`
	CreatedAt               time.Time  `json:"created_at"`
	UpdatedAt               time.Time  `json:"updated_at"`
}

// TableName returns the storage table for monitored network targets.
func (NetMonitorTarget) TableName() string { return "net_monitor_target" }

// NetMonitorSample stores one bounded poll result. InterfaceMetricsJSON holds
// read-only SNMP interface counters for display and rate calculations.
type NetMonitorSample struct {
	ID                   int64     `json:"id,string"`
	TenantID             int64     `json:"-" gorm:"not null;default:1;index"`
	TargetID             int64     `json:"target_id,string" gorm:"not null;index:idx_net_monitor_sample_target_time,priority:1"`
	CheckedAt            time.Time `json:"checked_at" gorm:"not null;index:idx_net_monitor_sample_target_time,priority:2"`
	Reachable            bool      `json:"reachable" gorm:"not null"`
	LatencyMilliseconds  int64     `json:"latency_milliseconds"`
	PacketLossPercent    float64   `json:"packet_loss_percent"`
	InterfaceMetricsJSON string    `json:"interface_metrics_json,omitempty" gorm:"type:text"`
	Error                string    `json:"error,omitempty" gorm:"size:240"`
}

// TableName returns the storage table for network health samples.
func (NetMonitorSample) TableName() string { return "net_monitor_sample" }

// NetMonitorIncident records a transition to down and its eventual recovery.
type NetMonitorIncident struct {
	ID         int64      `json:"id,string"`
	TenantID   int64      `json:"-" gorm:"not null;default:1;index"`
	TargetID   int64      `json:"target_id,string" gorm:"not null;index:idx_net_monitor_incident_target_open,priority:1"`
	State      string     `json:"state" gorm:"size:12;not null;index:idx_net_monitor_incident_target_open,priority:2"`
	Summary    string     `json:"summary" gorm:"size:240;not null"`
	StartedAt  time.Time  `json:"started_at" gorm:"not null;index"`
	ResolvedAt *time.Time `json:"resolved_at"`
}

// TableName returns the storage table for network monitoring incidents.
func (NetMonitorIncident) TableName() string { return "net_monitor_incident" }

// NotificationSettings stores the opt-in state and allowlisted recipients for
// operational WhatsApp notifications. It contains no WhatsApp device keys.
type NotificationSettings struct {
	ID                 int64      `json:"id,string" gorm:"primaryKey"`
	TenantID           int64      `json:"-" gorm:"not null;default:1;index"`
	WhatsAppEnabled    bool       `json:"whatsapp_enabled"`
	RiskAcknowledgedAt *time.Time `json:"risk_acknowledged_at,omitempty"`
	RecipientsJSON     string     `json:"recipients_json" gorm:"type:text"`
	EventsJSON         string     `json:"events_json" gorm:"type:text"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// TableName returns the storage table for notification settings.
func (NotificationSettings) TableName() string { return "notification_settings" }

// NotificationOutbox stores a deduplicated outbound operator notification.
// Message bodies are limited to operational metadata and must not contain
// subscriber passwords or other authentication secrets.
type NotificationOutbox struct {
	ID            int64      `json:"id,string"`
	TenantID      int64      `json:"-" gorm:"not null;default:1;uniqueIndex:udx_notification_outbox_tenant_dedupe,priority:1;index"`
	DedupeKey     string     `json:"dedupe_key" gorm:"size:180;not null;uniqueIndex:udx_notification_outbox_tenant_dedupe,priority:2"`
	EventType     string     `json:"event_type" gorm:"size:48;not null;index"`
	Recipient     string     `json:"recipient" gorm:"size:32;not null"`
	Body          string     `json:"body" gorm:"size:1000;not null"`
	Status        string     `json:"status" gorm:"size:16;not null;default:pending;index"`
	Attempts      int        `json:"attempts" gorm:"not null;default:0"`
	NextAttemptAt time.Time  `json:"next_attempt_at" gorm:"index"`
	LastError     string     `json:"last_error,omitempty" gorm:"size:240"`
	CreatedAt     time.Time  `json:"created_at"`
	SentAt        *time.Time `json:"sent_at,omitempty"`
}

// TableName returns the storage table for outbound notifications.
func (NotificationOutbox) TableName() string { return "notification_outbox" }
