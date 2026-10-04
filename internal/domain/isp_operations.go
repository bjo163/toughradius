package domain

import (
	"time"
)

// HotspotBatch tracks a generation run of hotspot vouchers.
type HotspotBatch struct {
	ID              int64     `json:"id,string" gorm:"primaryKey;autoIncrement"`
	TenantID        int64     `json:"-" gorm:"not null;default:1;uniqueIndex:udx_isp_hotspot_batch_tenant_no,priority:1;index"`
	BatchNo         string    `json:"batch_no" gorm:"uniqueIndex:udx_isp_hotspot_batch_tenant_no,priority:2;size:32"`
	Name            string    `json:"name" gorm:"size:128"`
	PackageID       int64     `json:"package_id,string" gorm:"index"`
	Quantity        int       `json:"quantity"`
	Price           int64     `json:"price"`              // IDR per voucher
	ValiditySeconds int       `json:"validity_seconds"`   // e.g. 3600 for 1 hr, 86400 for 1 day
	QuotaBytes      int64     `json:"quota_bytes,string"` // 0 = unlimited
	Prefix          string    `json:"prefix" gorm:"size:16"`
	CodeLength      int       `json:"code_length"`
	CreatedBy       string    `json:"created_by" gorm:"size:64"`
	CreatedAt       time.Time `json:"created_at"`
}

// TableName returns table name for HotspotBatch.
func (HotspotBatch) TableName() string {
	return "isp_hotspot_batch"
}

// HotspotVoucher represents an individual prepaid hotspot voucher card.
type HotspotVoucher struct {
	ID              int64      `json:"id,string" gorm:"primaryKey;autoIncrement"`
	TenantID        int64      `json:"-" gorm:"not null;default:1;uniqueIndex:udx_isp_hotspot_voucher_tenant_code,priority:1;index"`
	BatchID         int64      `json:"batch_id,string" gorm:"index"`
	PackageID       int64      `json:"package_id,string" gorm:"index"`
	Code            string     `json:"code" gorm:"uniqueIndex:udx_isp_hotspot_voucher_tenant_code,priority:2;size:32"` // Username / Voucher code
	Password        string     `json:"password" gorm:"size:32"`
	Price           int64      `json:"price"`
	ValiditySeconds int        `json:"validity_seconds"`
	QuotaBytes      int64      `json:"quota_bytes,string"`
	Status          string     `json:"status" gorm:"index;size:24;default:active"` // active, used, expired, revoked
	FirstLoginAt    *time.Time `json:"first_login_at"`
	ExpiresAt       *time.Time `json:"expires_at" gorm:"index"`
	UsedBytes       int64      `json:"used_bytes,string"`
	CreatedAt       time.Time  `json:"created_at"`
}

// TableName returns table name for HotspotVoucher.
func (HotspotVoucher) TableName() string {
	return "isp_hotspot_voucher"
}

// IPAMPool represents an allocated IPv4 or IPv6 subnet pool.
type IPAMPool struct {
	ID           int64     `json:"id,string" gorm:"primaryKey;autoIncrement"`
	TenantID     int64     `json:"-" gorm:"not null;default:1;uniqueIndex:udx_isp_ipam_tenant_cidr,priority:1;index"`
	Name         string    `json:"name" gorm:"size:64"`
	CIDR         string    `json:"cidr" gorm:"uniqueIndex:udx_isp_ipam_tenant_cidr,priority:2;size:64"` // e.g. 100.64.0.0/22 or 2001:db8::/48
	IPVersion    int       `json:"ip_version"`                                                          // 4 or 6
	PoolType     string    `json:"pool_type" gorm:"size:32"`                                            // cgnat, public, static, delegated
	Gateway      string    `json:"gateway" gorm:"size:64"`
	DNSPrimary   string    `json:"dns_primary" gorm:"size:64"`
	DNSSecondary string    `json:"dns_secondary" gorm:"size:64"`
	TotalIPs     int64     `json:"total_ips,string"`
	UsedIPs      int64     `json:"used_ips,string"`
	Description  string    `json:"description" gorm:"size:255"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// TableName returns table name for IPAMPool.
func (IPAMPool) TableName() string {
	return "isp_ipam_pool"
}

// TroubleTicket represents customer incident tickets and field technician assignments.
type TroubleTicket struct {
	ID                 int64      `json:"id,string" gorm:"primaryKey;autoIncrement"`
	TenantID           int64      `json:"-" gorm:"not null;default:1;uniqueIndex:udx_isp_ticket_tenant_no,priority:1;index"`
	TicketNo           string     `json:"ticket_no" gorm:"uniqueIndex:udx_isp_ticket_tenant_no,priority:2;size:32"`
	CustomerID         int64      `json:"customer_id,string" gorm:"index"`
	SubscriptionID     int64      `json:"subscription_id,string" gorm:"index"`
	Subject            string     `json:"subject" gorm:"size:255"`
	Category           string     `json:"category" gorm:"index;size:32"`            // los_red, slow_speed, no_internet, router_damage, billing
	Priority           string     `json:"priority" gorm:"index;size:16"`            // low, normal, high, urgent
	Status             string     `json:"status" gorm:"index;size:24;default:open"` // open, scheduled, in_progress, resolved, closed
	AssignedTechnician string     `json:"assigned_technician" gorm:"size:64"`
	TechnicianPhone    string     `json:"technician_phone" gorm:"size:32"`
	Description        string     `json:"description" gorm:"type:text"`
	ResolutionNotes    string     `json:"resolution_notes" gorm:"type:text"`
	ScheduledDate      *time.Time `json:"scheduled_date"`
	ResolvedAt         *time.Time `json:"resolved_at"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// TableName returns table name for TroubleTicket.
func (TroubleTicket) TableName() string {
	return "isp_trouble_ticket"
}

// ODP represents Optical Distribution Point splitter enclosures and port capacity.
type ODP struct {
	ID          int64     `json:"id,string" gorm:"primaryKey;autoIncrement"`
	TenantID    int64     `json:"-" gorm:"not null;default:1;uniqueIndex:udx_isp_odp_tenant_code,priority:1;index"`
	Code        string    `json:"code" gorm:"uniqueIndex:udx_isp_odp_tenant_code,priority:2;size:32"` // e.g. ODP-KNG-001
	Name        string    `json:"name" gorm:"size:128"`
	Zone        string    `json:"zone" gorm:"index;size:64"` // e.g. Sector-A / Kuningan
	OLTName     string    `json:"olt_name" gorm:"size:64"`   // e.g. OLT-HUAWEI-01
	PONPort     string    `json:"pon_port" gorm:"size:32"`   // e.g. 0/1/2
	TotalPorts  int       `json:"total_ports"`               // 8, 16, 24
	UsedPorts   int       `json:"used_ports"`
	Latitude    float64   `json:"latitude"`
	Longitude   float64   `json:"longitude"`
	OpticalLoss float64   `json:"optical_loss"`                               // e.g. -19.5 dBm
	Status      string    `json:"status" gorm:"index;size:24;default:active"` // active, full, maintenance
	Address     string    `json:"address" gorm:"size:255"`
	Notes       string    `json:"notes" gorm:"size:255"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// TableName returns table name for ODP.
func (ODP) TableName() string {
	return "isp_odp"
}
