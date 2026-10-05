package domain

import "time"

const (
	// CustomerActive marks a customer as active.
	CustomerActive = "active"
	// CustomerPending marks a customer registration awaiting installation/activation.
	CustomerPending = "pending"
	// CustomerInactive marks a customer as inactive.
	CustomerInactive = "inactive"
	// CustomerSuspended marks a customer as suspended.
	CustomerSuspended = "suspended"
	// CustomerTerminated marks a customer as terminated.
	CustomerTerminated = "terminated"

	// SubscriptionPending marks a subscription awaiting activation.
	SubscriptionPending = "pending"
	// SubscriptionActive marks a subscription with enabled service.
	SubscriptionActive = "active"
	// SubscriptionSuspended marks a temporarily disabled subscription.
	SubscriptionSuspended = "suspended"
	// SubscriptionTerminated marks a permanently ended subscription.
	SubscriptionTerminated = "terminated"

	// SuspensionBillingOverdue identifies automatic suspension for unpaid invoices.
	SuspensionBillingOverdue = "billing_overdue"

	// InvoiceDraft marks an invoice that has not been issued.
	InvoiceDraft = "draft"
	// InvoiceIssued marks an invoice awaiting payment.
	InvoiceIssued = "issued"
	// InvoicePartial marks an invoice with a remaining balance after payment.
	InvoicePartial = "partial"
	// InvoicePaid marks a fully paid invoice.
	InvoicePaid = "paid"
	// InvoiceOverdue marks an unpaid invoice past its due date.
	InvoiceOverdue = "overdue"
	// InvoiceVoid marks an invoice canceled from collection.
	InvoiceVoid = "void"

	// PaymentPending marks a payment that has not been received.
	PaymentPending = "pending"
	// PaymentReceived marks a recorded manual payment.
	PaymentReceived = "received"
)

// Customer is an ISP subscriber profile. It is intentionally distinct from
// RadiusUser so commercial identity and network credentials have independent
// lifecycles.
type Customer struct {
	ID         int64     `json:"id,string" gorm:"primaryKey"`
	TenantID   int64     `json:"-" gorm:"not null;default:1;uniqueIndex:udx_isp_customer_tenant_no,priority:1;index"`
	CustomerNo string    `json:"customer_no" gorm:"uniqueIndex:udx_isp_customer_tenant_no,priority:2;size:32"`
	Name       string    `json:"name" gorm:"index;size:150;not null"`
	Phone      string    `json:"phone" gorm:"size:32"`
	Email      string    `json:"email" gorm:"size:150"`
	Address    string    `json:"address" gorm:"size:500"`
	City       string    `json:"city" gorm:"size:100"`
	Province   string    `json:"province" gorm:"size:100"`
	IdentityNo string    `json:"identity_no" gorm:"size:100"`
	ODPID      int64     `json:"odp_id,string" gorm:"index"`
	ODPCode    string    `json:"odp_code" gorm:"size:32"`
	ODPPort    int       `json:"odp_port"`
	Latitude   float64   `json:"latitude"`
	Longitude  float64   `json:"longitude"`
	Status     string    `json:"status" gorm:"index;size:24;not null;default:active"`
	Notes      string    `json:"notes" gorm:"size:1000"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// TableName returns the database table name for Customer.
func (Customer) TableName() string { return "isp_customer" }

// InternetPackage represents a commercial internet offer and its default
// network policy. Price is an integer amount in IDR.
type InternetPackage struct {
	ID              int64     `json:"id,string" gorm:"primaryKey"`
	TenantID        int64     `json:"-" gorm:"not null;default:1;uniqueIndex:udx_isp_package_tenant_code,priority:1;index"`
	Code            string    `json:"code" gorm:"uniqueIndex:udx_isp_package_tenant_code,priority:2;size:40;not null"`
	Name            string    `json:"name" gorm:"index;size:150;not null"`
	Price           int64     `json:"price" gorm:"not null"`
	RadiusProfileID int64     `json:"radius_profile_id,string" gorm:"index;not null"`
	Description     string    `json:"description" gorm:"size:1000"`
	BillingCycle    string    `json:"billing_cycle" gorm:"size:20;not null;default:monthly"`
	FupLimitGB      int64     `json:"fup_limit_gb" gorm:"not null;default:0"`
	FupRateDown     int       `json:"fup_rate_down" gorm:"not null;default:0"`
	FupRateUp       int       `json:"fup_rate_up" gorm:"not null;default:0"`
	Status          string    `json:"status" gorm:"index;size:24;not null;default:active"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// TableName returns the database table name for InternetPackage.
func (InternetPackage) TableName() string { return "isp_package" }

// Subscription links a customer and commercial package to an existing or new
// RADIUS account.
type Subscription struct {
	ID               int64     `json:"id,string" gorm:"primaryKey"`
	TenantID         int64     `json:"-" gorm:"not null;default:1;uniqueIndex:udx_isp_subscription_tenant_no,priority:1;index"`
	SubscriptionNo   string    `json:"subscription_no" gorm:"uniqueIndex:udx_isp_subscription_tenant_no,priority:2;size:32"`
	CustomerID       int64     `json:"customer_id,string" gorm:"index;not null"`
	PackageID        int64     `json:"package_id,string" gorm:"index;not null"`
	RadiusUserID     int64     `json:"radius_user_id,string" gorm:"index"`
	Status           string    `json:"status" gorm:"index;size:24;not null;default:pending"`
	StartDate        time.Time `json:"start_date" gorm:"not null"`
	BillingDay       int       `json:"billing_day" gorm:"not null;default:1"`
	GraceDays        int       `json:"grace_days" gorm:"not null;default:3"`
	FupTriggered     bool      `json:"fup_triggered" gorm:"default:false"`
	SuspensionReason string    `json:"suspension_reason" gorm:"size:64"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// TableName returns the database table name for Subscription.
func (Subscription) TableName() string { return "isp_subscription" }

// Invoice is a monthly charge for one customer subscription. Monetary values
// use integer IDR to avoid floating point rounding.
type Invoice struct {
	ID             int64     `json:"id,string" gorm:"primaryKey"`
	TenantID       int64     `json:"-" gorm:"not null;default:1;uniqueIndex:udx_isp_invoice_tenant_period,priority:1;uniqueIndex:udx_isp_invoice_tenant_no,priority:1;index"`
	InvoiceNo      string    `json:"invoice_no" gorm:"uniqueIndex:udx_isp_invoice_tenant_no,priority:2;size:40"`
	CustomerID     int64     `json:"customer_id,string" gorm:"index;not null"`
	SubscriptionID int64     `json:"subscription_id,string" gorm:"index;not null;uniqueIndex:udx_isp_invoice_tenant_period,priority:2"`
	InvoiceDate    time.Time `json:"invoice_date" gorm:"not null"`
	DueDate        time.Time `json:"due_date" gorm:"index;not null"`
	PeriodStart    time.Time `json:"period_start" gorm:"not null;uniqueIndex:udx_isp_invoice_tenant_period,priority:3"`
	PeriodEnd      time.Time `json:"period_end" gorm:"not null"`
	Subtotal       int64     `json:"subtotal" gorm:"not null"`
	Total          int64     `json:"total" gorm:"not null"`
	PaidAmount     int64     `json:"paid_amount" gorm:"not null;default:0"`
	Balance        int64     `json:"balance" gorm:"not null"`
	Status         string    `json:"status" gorm:"index;size:24;not null;default:issued"`
	Notes          string    `json:"notes" gorm:"size:1000"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// TableName returns the database table name for Invoice.
func (Invoice) TableName() string { return "isp_invoice" }

// InvoiceItem preserves the package price at invoice creation time.
type InvoiceItem struct {
	ID          int64  `json:"id,string" gorm:"primaryKey"`
	TenantID    int64  `json:"-" gorm:"not null;default:1;index"`
	InvoiceID   int64  `json:"invoice_id,string" gorm:"index;not null"`
	Description string `json:"description" gorm:"size:255;not null"`
	Quantity    int64  `json:"quantity" gorm:"not null;default:1"`
	UnitPrice   int64  `json:"unit_price" gorm:"not null"`
	Total       int64  `json:"total" gorm:"not null"`
}

// TableName returns the database table name for InvoiceItem.
func (InvoiceItem) TableName() string { return "isp_invoice_item" }

// Payment records a manually received payment applied to exactly one invoice.
type Payment struct {
	ID         int64     `json:"id,string" gorm:"primaryKey"`
	TenantID   int64     `json:"-" gorm:"not null;default:1;uniqueIndex:udx_isp_payment_tenant_no,priority:1;index"`
	PaymentNo  string    `json:"payment_no" gorm:"uniqueIndex:udx_isp_payment_tenant_no,priority:2;size:40"`
	CustomerID int64     `json:"customer_id,string" gorm:"index;not null"`
	InvoiceID  int64     `json:"invoice_id,string" gorm:"index;not null"`
	Amount     int64     `json:"amount" gorm:"not null"`
	Method     string    `json:"method" gorm:"size:32;not null"`
	Reference  string    `json:"reference" gorm:"size:150"`
	PaidAt     time.Time `json:"paid_at" gorm:"not null"`
	Status     string    `json:"status" gorm:"index;size:24;not null;default:received"`
	Notes      string    `json:"notes" gorm:"size:1000"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// TableName returns the database table name for Payment.
func (Payment) TableName() string { return "isp_payment" }

// BillingEvent is an append-only record of important ISP billing lifecycle
// transitions.
type BillingEvent struct {
	ID             int64     `json:"id,string" gorm:"primaryKey"`
	TenantID       int64     `json:"-" gorm:"not null;default:1;index"`
	CustomerID     int64     `json:"customer_id,string" gorm:"index"`
	SubscriptionID int64     `json:"subscription_id,string" gorm:"index"`
	InvoiceID      int64     `json:"invoice_id,string" gorm:"index"`
	Type           string    `json:"type" gorm:"index;size:48;not null"`
	Description    string    `json:"description" gorm:"size:1000"`
	CreatedAt      time.Time `json:"created_at" gorm:"index"`
}

// TableName returns the database table name for BillingEvent.
func (BillingEvent) TableName() string { return "isp_billing_event" }

// DocumentSequence stores tenant-scoped document serials. The kind and period
// key is unique so allocation is atomic across invoices, payments, vouchers,
// tickets and work orders from every app instance.
type DocumentSequence struct {
	ID       int64  `json:"id,string" gorm:"primaryKey"`
	TenantID int64  `json:"-" gorm:"not null;default:1;uniqueIndex:udx_isp_document_sequence_tenant,priority:1;index"`
	Kind     string `json:"kind" gorm:"size:24;not null;uniqueIndex:udx_isp_document_sequence_tenant,priority:2"`
	Period   string `json:"period" gorm:"size:6;not null;uniqueIndex:udx_isp_document_sequence_tenant,priority:3"`
	Value    int64  `json:"value" gorm:"not null"`
}

// TableName returns the database table name for DocumentSequence.
func (DocumentSequence) TableName() string { return "isp_document_sequence" }
