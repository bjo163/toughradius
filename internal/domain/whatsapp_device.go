package domain

import "time"

// WhatsAppDevice links an application node to a persisted WhatsApp client entry.
type WhatsAppDevice struct {
    ID        int64     `json:"id,string" gorm:"primaryKey"`
    NodeId    int64     `json:"node_id,string" gorm:"index"`
    Phone     string    `json:"phone"`
    Name      string    `json:"name"`
    Jid       string    `json:"jid"` // populated after device provisioning / registration
    Status    string    `json:"status"` // e.g., created, registered, connected
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`
}

func (WhatsAppDevice) TableName() string {
    return "whatsapp_device"
}
