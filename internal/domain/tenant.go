package domain

import "time"

// DefaultTenantID is the tenant assigned to rows migrated from a single-tenant install.
const DefaultTenantID int64 = 1

// Tenant is an independently operated ISP or RT/RW Net organization in one
// MWX-ISP deployment. Tenant-owned records reference this stable identifier.
type Tenant struct {
	ID             int64     `json:"id,string" gorm:"primaryKey"`
	Name           string    `json:"name" gorm:"size:120;not null"`
	Slug           string    `json:"slug" gorm:"size:64;not null;uniqueIndex"`
	Kind           string    `json:"kind" gorm:"size:16;not null;default:isp"`
	Status         string    `json:"status" gorm:"size:16;not null;default:active;index"`
	CompanyName    string    `json:"company_name" gorm:"size:150"`
	TaxID          string    `json:"tax_id" gorm:"size:80"`
	BillingAddress string    `json:"billing_address" gorm:"size:500"`
	ContactEmail   string    `json:"contact_email" gorm:"size:150"`
	ContactPhone   string    `json:"contact_phone" gorm:"size:32"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// TableName returns the storage table for ISP and RT/RW Net organizations.
func (Tenant) TableName() string { return "tenant" }
