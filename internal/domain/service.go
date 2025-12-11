package domain

import "time"

// NetService represents a generic network service discovered on a NAS/device.
// Column names are chosen to be generic so other vendor implementations can reuse them.
type NetService struct {
    ID         int64     `gorm:"primaryKey;autoIncrement" json:"id"`
    NasId      int64     `gorm:"index;uniqueIndex:idx_nas_vendor_service" json:"nas_id"`
    VendorServiceId string `gorm:"size:100;uniqueIndex:idx_nas_vendor_service" json:"vendor_service_id"` // vendor-specific service id (e.g., Mikrotik .id)
    Name       string    `gorm:"size:200" json:"name"`        // service name
    ServiceType string   `gorm:"size:50" json:"service_type"` // e.g., "queue.simple"
    Endpoint   string    `gorm:"size:200" json:"endpoint"`    // destination address / endpoint (avoid using "target")
    Rate         string  `gorm:"size:64" json:"rate"`         // human readable rate like "1M/1M" or numeric string
    MaxLimit     string  `gorm:"size:64" json:"max_limit"`    // vendor max limit if available (raw)
    // UploadKbps and DownloadKbps map to the existing DB columns max_limit_up/max_limit_down
    // and expose them as upload_kbps/download_kbps in the API for clarity.
    UploadKbps   int64   `gorm:"column:max_limit_up;default:0" json:"upload_kbps"`   // parsed upload limit in Kbps
    DownloadKbps int64   `gorm:"column:max_limit_down;default:0" json:"download_kbps"` // parsed download limit in Kbps
    // RateUpKbps/RateDownKbps store current or configured rates split into uplink/downlink (Kbps)
    RateUpKbps   int64   `gorm:"default:0" json:"rate_up_kbps"`
    RateDownKbps int64   `gorm:"default:0" json:"rate_down_kbps"`
    Status       string  `gorm:"size:20;index;default:'enabled'" json:"status"` // enabled|disabled
    Params     string    `gorm:"type:text" json:"params"`     // raw JSON of other fields
    VendorCode string    `gorm:"size:20;index" json:"vendor_code"`
    // Dynamic indicates whether this service/queue is dynamic (true) or static (false).
    Dynamic    bool      `gorm:"default:false" json:"dynamic"`
    LastSeenAt *time.Time `json:"last_seen_at"`
    CreatedAt  time.Time `json:"created_at"`
    UpdatedAt  time.Time `json:"updated_at"`
}
