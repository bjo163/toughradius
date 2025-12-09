package domain

import "time"

// NetVendor represents a device vendor entry stored in DB
type NetVendor struct {
    ID        int64     `json:"id,string" form:"id"`
    Code      string    `json:"code" form:"code"`
    Name      string    `json:"name" form:"name"`
    Remark    string    `json:"remark" form:"remark"`
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`
}

// TableName returns table name
func (NetVendor) TableName() string {
    return "net_vendor"
}
