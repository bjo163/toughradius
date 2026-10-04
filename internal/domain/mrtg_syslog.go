package domain

import (
	"time"
)

// RadiusTrafficSample stores time-series bandwidth utilization snapshots for
// active RADIUS/PPPoE subscriber sessions, powering per-subscriber MRTG charts.
type RadiusTrafficSample struct {
	ID            int64     `json:"id,string" gorm:"primaryKey;autoIncrement"`
	Username      string    `json:"username" gorm:"index:idx_radius_traffic_user_time;size:64"`
	AcctSessionID string    `json:"acct_session_id" gorm:"index;size:64"`
	NasAddr       string    `json:"nas_addr" gorm:"size:64"`
	InOctets      int64     `json:"in_octets,string"`
	OutOctets     int64     `json:"out_octets,string"`
	InRateBps     int64     `json:"in_rate_bps,string"`  // Inbound bits per second (download)
	OutRateBps    int64     `json:"out_rate_bps,string"` // Outbound bits per second (upload)
	RecordedAt    time.Time `json:"recorded_at" gorm:"index:idx_radius_traffic_user_time;index"`
}

// TableName returns the table name for RadiusTrafficSample.
func (RadiusTrafficSample) TableName() string {
	return "radius_traffic_sample"
}

// SyslogEvent records structured syslog messages received from network devices
// (MikroTik, Cisco, OLTs, switches) via UDP port 514 / 1514.
type SyslogEvent struct {
	ID           int64     `json:"id,string" gorm:"primaryKey;autoIncrement"`
	NasIP        string    `json:"nas_ip" gorm:"index;size:64"`
	Facility     int       `json:"facility"`
	Severity     int       `json:"severity" gorm:"index"` // 0=Emergency .. 7=Debug
	SeverityName string    `json:"severity_name" gorm:"size:16"`
	Tag          string    `json:"tag" gorm:"index;size:64"` // e.g. pppoe, system, firewall
	Message      string    `json:"message" gorm:"type:text"`
	CreatedAt    time.Time `json:"created_at" gorm:"index"`
}

// TableName returns the table name for SyslogEvent.
func (SyslogEvent) TableName() string {
	return "syslog_event"
}
