package domain

import (
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ProductBranding stores one installation-wide product identity. It is
// intentionally separate from ISP/company fields used on invoices.
type ProductBranding struct {
	ID          int64     `json:"id" gorm:"primaryKey"`
	ProductName string    `json:"product_name" gorm:"size:60;not null"`
	ShortName   string    `json:"short_name" gorm:"size:8;not null"`
	Tagline     string    `json:"tagline" gorm:"size:120"`
	AccentColor string    `json:"accent_color" gorm:"size:7;not null"`
	LogoFile    string    `json:"-" gorm:"size:80"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// TableName returns the storage table for installation product branding.
func (ProductBranding) TableName() string { return "sys_product_branding" }

type SysConfig struct {
	ID        int64     `json:"id,string"   form:"id"`
	Sort      int       `json:"sort"  form:"sort"`
	Type      string    `gorm:"index" json:"type" form:"type"`
	Name      string    `gorm:"index" json:"name" form:"name"`
	Value     string    `json:"value" form:"value"`
	Remark    string    `json:"remark" form:"remark"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TableName Specify table name
func (SysConfig) TableName() string {
	return "sys_config"
}

type SysOpr struct {
	ID                int64     `json:"id,string" form:"id"`
	TenantID          int64     `json:"-" form:"-" gorm:"not null;default:1;index;uniqueIndex:udx_sys_opr_tenant_username,priority:1"`
	PlatformAdmin     bool      `json:"-" form:"-" gorm:"not null;default:false;index"`
	MembershipVersion int64     `json:"-" form:"-" gorm:"-"`
	Realname          string    `json:"realname" form:"realname"`
	Mobile            string    `json:"mobile" form:"mobile"`
	Email             string    `json:"email" form:"email"`
	Username          string    `json:"username" form:"username" gorm:"uniqueIndex:udx_sys_opr_tenant_username,priority:2"`
	Password          string    `json:"password" form:"password"`
	Level             string    `json:"level" form:"level"`
	Status            string    `json:"status" form:"status"`
	Remark            string    `json:"remark" form:"remark"`
	LastLogin         time.Time `json:"last_login" form:"last_login"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// TenantMembership records whether an operator account is active in an
// organization and the role it has there. SysOpr remains the tenant-local
// account/profile record for backwards compatibility; this row is the
// authoritative tenant authorization grant and can be revoked immediately.
type TenantMembership struct {
	TenantID     int64     `json:"tenant_id,string" gorm:"primaryKey;not null;index"`
	OperatorID   int64     `json:"operator_id,string" gorm:"primaryKey;not null;index"`
	Level        string    `json:"level" gorm:"size:16;not null;default:operator"`
	Status       string    `json:"status" gorm:"size:16;not null;default:enabled;index"`
	TokenVersion int64     `json:"token_version" gorm:"not null;default:1"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// TableName returns the storage table for tenant operator grants.
func (TenantMembership) TableName() string { return "tenant_membership" }

// TableName Specify table name
func (SysOpr) TableName() string {
	return "sys_opr"
}

// AfterCreate creates the initial tenant authorization grant when the tenancy
// schema is available. The startup migration backfills legacy rows separately.
func (operator *SysOpr) AfterCreate(tx *gorm.DB) error {
	if operator == nil || !tx.Migrator().HasTable(&TenantMembership{}) {
		return nil
	}
	membership := TenantMembership{
		TenantID: operator.TenantID, OperatorID: operator.ID,
		Level: operator.Level, Status: operator.Status,
	}
	return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&membership).Error
}

// AfterUpdate keeps account-wide disablement and tenant-local role changes in
// sync with the authorization record. A deleted membership remains revoked.
func (operator *SysOpr) AfterUpdate(tx *gorm.DB) error {
	if operator == nil || !tx.Migrator().HasTable(&TenantMembership{}) {
		return nil
	}
	return tx.Model(&TenantMembership{}).
		Where("tenant_id = ? AND operator_id = ?", operator.TenantID, operator.ID).
		Updates(map[string]any{"level": operator.Level, "status": operator.Status, "token_version": gorm.Expr("token_version + 1"), "updated_at": time.Now()}).Error
}

// SysCert is a locally managed X.509 certificate. It stores a PEM-encoded
// certificate together with an optional PEM-encoded private key so operators can
// import, name, and reference certificates from the management UI instead of
// editing on-disk file paths. Server certificates (CertType "server") carry a
// private key and are used as the EAP/TLS server identity; CA certificates
// (CertType "ca") hold a trust anchor or bundle used to verify EAP-TLS clients.
//
// The PrivateKey field is intentionally tagged json:"-" so it is never disclosed
// through the REST API; the parsed metadata fields (Subject, Issuer, Serial,
// Fingerprint, NotBefore, NotAfter) are derived from Cert when a certificate is
// imported. HasKey is computed at read time (gorm:"-") to report whether a
// private key is present without exposing the key material itself.
type SysCert struct {
	ID          int64     `json:"id,string" form:"id"`
	Name        string    `gorm:"uniqueIndex;size:128" json:"name" form:"name"`
	CertType    string    `gorm:"index;size:16" json:"cert_type" form:"cert_type"`
	Cert        string    `gorm:"type:text" json:"cert" form:"cert"`
	PrivateKey  string    `gorm:"type:text" json:"-" form:"private_key"`
	Subject     string    `gorm:"size:512" json:"subject" form:"subject"`
	Issuer      string    `gorm:"size:512" json:"issuer" form:"issuer"`
	Serial      string    `gorm:"size:128" json:"serial" form:"serial"`
	Fingerprint string    `gorm:"size:128" json:"fingerprint" form:"fingerprint"`
	NotBefore   time.Time `json:"not_before" form:"not_before"`
	NotAfter    time.Time `json:"not_after" form:"not_after"`
	HasKey      bool      `gorm:"-" json:"has_key"`
	Remark      string    `gorm:"size:512" json:"remark" form:"remark"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// TableName Specify table name
func (SysCert) TableName() string {
	return "sys_cert"
}

type SysOprLog struct {
	ID        int64     `json:"id,string"`
	TenantID  int64     `json:"-" gorm:"not null;default:1;index"`
	OprName   string    `json:"opr_name"`
	OprIp     string    `json:"opr_ip"`
	OptAction string    `json:"opt_action"`
	OptDesc   string    `json:"opt_desc"`
	OptTime   time.Time `json:"opt_time"`
}

// TableName Specify table name
func (SysOprLog) TableName() string {
	return "sys_opr_log"
}
