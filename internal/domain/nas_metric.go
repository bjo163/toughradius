package domain

import "time"

// NetNasMetric stores time-series latency metrics for NAS devices
type NetNasMetric struct {
    ID        int64     `gorm:"primaryKey;autoIncrement" json:"id"`
    NasId     int64     `gorm:"index" json:"nas_id"`
    Ts        time.Time `gorm:"index" json:"ts"`
    Latency   int64     `json:"latency"`
    CreatedAt time.Time `json:"created_at"`
}
