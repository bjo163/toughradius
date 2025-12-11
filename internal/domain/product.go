package domain

import "time"

// Product represents a simple product item for demo/catalog purposes
type Product struct {
    ID        int64     `gorm:"primaryKey;autoIncrement" json:"id"`
    Name      string    `gorm:"index" json:"name"`
    Price     float64   `json:"price"` // price in main currency units (e.g., dollars)
    Image     string    `gorm:"size:1024" json:"image"` // URL to product image (optional)
    Type      string    `gorm:"size:32" json:"type"`  // 'service' or 'consumable'
    Qty       *int      `json:"qty,omitempty"`         // quantity for consumables (null for services)
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`
}
