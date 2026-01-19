package domain

import "time"

// NasQoS Generic QoS configuration for NAS devices
// Supports multiple vendors (Mikrotik, Huawei, H3C, etc) with different methods (API, SNMP)
type NasQoS struct {
	ID            int64     `json:"id,string" gorm:"primaryKey"`      // Primary key ID
	UserID        int64     `json:"user_id,string" gorm:"index"`      // User ID
	NasID         int64     `json:"nas_id,string" gorm:"index"`       // NAS device ID
	NasAddr       string    `json:"nas_addr"`                         // NAS IP address
	VendorCode    string    `json:"vendor_code" gorm:"index"`         // Vendor code (14988=Mikrotik, 2011=Huawei, etc)
	QoSName       string    `json:"qos_name"`                         // Queue/Profile name in device
	QoSType       string    `json:"qos_type"`                         // Type: "simple_queue", "tree", "policy", "profile"
	UpRate        int       `json:"up_rate"`                          // Upload rate in Kbps
	DownRate      int       `json:"down_rate"`                        // Download rate in Kbps
	Method        string    `json:"method"`                           // Communication method: "api", "snmp", "cli"
	RemoteID      string    `json:"remote_id"`                        // Queue/Profile ID in remote device
	RemoteConfig  string    `json:"remote_config"`                    // JSON: Vendor-specific extra config
	Status        string    `json:"status"`                           // "pending", "synced", "failed", "deleted"
	ErrorMsg      string    `json:"error_msg"`                        // Error message if status is "failed"
	RetryCount    int       `json:"retry_count" gorm:"default:0"`     // Retry attempt counter
	CreatedAt     time.Time `json:"created_at" gorm:"index"`
	UpdatedAt     time.Time `json:"updated_at"`
	SyncedAt      *time.Time `json:"synced_at"`                        // Last successful sync time
}

// TableName specifies the table name
func (NasQoS) TableName() string {
	return "nas_qos"
}

// NasQoSLog Audit trail for all QoS operations
type NasQoSLog struct {
	ID              int64     `json:"id,string" gorm:"primaryKey"`
	QoSID           int64     `json:"qos_id,string" gorm:"index"`     // NasQoS ID
	UserID          int64     `json:"user_id,string"`
	NasID           int64     `json:"nas_id,string"`
	Action          string    `json:"action"`                         // "created", "updated", "synced", "failed", "deleted"
	Status          string    `json:"status"`                         // "success", "failure"
	RequestPayload  string    `json:"request_payload" gorm:"type:text"`  // JSON request sent
	ResponsePayload string    `json:"response_payload" gorm:"type:text"` // JSON response received
	ErrorMsg        string    `json:"error_msg"`                      // Error message if action failed
	ExecutedAt      time.Time `json:"executed_at"`
	CreatedAt       time.Time `json:"created_at" gorm:"index"`
}

// TableName specifies the table name
func (NasQoSLog) TableName() string {
	return "nas_qos_log"
}
