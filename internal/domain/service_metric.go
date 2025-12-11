package domain

import "time"

// NetServiceMetric stores time-series metrics for a discovered service
type NetServiceMetric struct {
    ID          int64     `gorm:"primaryKey;autoIncrement" json:"id"`
    ServiceId   int64     `gorm:"index" json:"service_id"`
    NasId       int64     `gorm:"index" json:"nas_id"`
    Ts          time.Time `gorm:"index" json:"ts"`
    // Latency in milliseconds. We keep UpKbps/DownKbps for backward compatibility
    // but new code should prefer Latency when available.
    Latency     int64     `json:"latency"`
    UpKbps      int64     `json:"up_kbps"`
    DownKbps    int64     `json:"down_kbps"`
    CreatedAt   time.Time `json:"created_at"`
}
