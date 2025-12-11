package domain

import (
	"time"
)

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
	ID        int64     `json:"id,string" form:"id"`
	PartnerId int64     `gorm:"index" json:"partner_id" form:"partner_id"`
	Realname  string    `json:"realname" form:"realname"`
	Mobile    string    `json:"mobile" form:"mobile"`
	Email     string    `json:"email" form:"email"`
	Username  string    `json:"username" form:"username"`
	Password  string    `json:"password" form:"password"`
	Level     string    `json:"level" form:"level"`
	Status    string    `json:"status" form:"status"`
	Remark    string    `json:"remark" form:"remark"`
	LastLogin time.Time `json:"last_login" form:"last_login"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TableName Specify table name
func (SysOpr) TableName() string {
	return "sys_opr"
}

// SysPartner represents a contact/partner record (like Odoo partner)
type SysPartner struct {
	ID        int64     `json:"id,string" form:"id"`
	Name      string    `gorm:"index" json:"name" form:"name"`
	Company   string    `json:"company" form:"company"`
	Email     string    `json:"email" form:"email"`
	Mobile    string    `json:"mobile" form:"mobile"`
	Phone     string    `json:"phone" form:"phone"`
	Address   string    `json:"address" form:"address"`
	City      string    `json:"city" form:"city"`
	Country   string    `json:"country" form:"country"`
	Remark    string    `json:"remark" form:"remark"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (SysPartner) TableName() string {
	return "sys_partner"
}

type SysOprLog struct {
	ID        int64     `json:"id,string"`
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
