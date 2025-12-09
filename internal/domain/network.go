package domain

import "time"

// Network module related models

// NetNode network node
type NetNode struct {
	ID        int64     `json:"id,string" form:"id"`
	Name      string    `json:"name" form:"name"`
	Remark    string    `json:"remark" form:"remark"`
	Tags      string    `json:"tags" form:"tags"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TableName Specify table name
func (NetNode) TableName() string {
	return "net_node"
}

// NetNas NAS device data model, typically gateway-type devices, can be used as BRAS equipment
type NetNas struct {
	ID            int64     `json:"id,string" form:"id"`                  // Primary key ID
	NodeId        int64     `json:"node_id,string" form:"node_id"`        // Node ID
	Name          string    `json:"name" form:"name"`                     // Device name
	Identifier    string    `json:"identifier" form:"identifier"`         // Device identifier - RADIUS
	Hostname      string    `json:"hostname" form:"hostname"`             // Device host address
	Ipaddr        string    `json:"ipaddr" form:"ipaddr"`                 // Device IP
	Secret        string    `json:"secret" form:"secret"`                 // Device RADIUS Secret
	CoaPort       int       `json:"coa_port" form:"coa_port"`             // Device RADIUS COA Port
	Username      string    `json:"username" form:"username"`             // Device login username
	Password      string    `json:"password" form:"password"`             // Device login password
	ApiPort       int       `json:"api_port" form:"api_port"`             // Device API Port
	ApiState      string    `json:"api_state" form:"api_state"`           // Device API State (enabled/disabled)
	ApiLastProbeAt time.Time `json:"api_last_probe_at" form:"api_last_probe_at"` // Last API probe time
	ApiLastResult  string    `json:"api_last_result" form:"api_last_result"`   // Last API probe result (ok/failed/message)
	ApiLastMessage string    `json:"api_last_message" form:"api_last_message"` // Last API probe message or error
	SnmpPort      int       `json:"snmp_port" form:"snmp_port"`           // Device SNMP Port
	SnmpCommunity string    `json:"snmp_community" form:"snmp_community"` // Device SNMP Community string
	SnmpState     string    `json:"snmp_state" form:"snmp_state"`         // Device SNMP State (enabled/disabled)
	Model         string    `json:"model" form:"model"`                   // Device model
	SnmpLastProbeAt time.Time `json:"snmp_last_probe_at" form:"snmp_last_probe_at"` // Last SNMP probe time
	SnmpLastResult  string    `json:"snmp_last_result" form:"snmp_last_result"`   // Last SNMP probe result (ok/failed/message)
	SnmpLastMessage string    `json:"snmp_last_message" form:"snmp_last_message"` // Last SNMP probe message or error
	VendorCode    string    `json:"vendor_code" form:"vendor_code"`       // Device vendor code
	Status        string    `json:"status" form:"status"`                 // Device status
	Latency       int       `json:"latency" form:"latency"`               // Device latency in milliseconds
	Tags          string    `json:"tags" form:"tags"`                     // Tags
	Remark        string    `json:"remark" form:"remark"`                 // Remark
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// TableName Specify table name
func (NetNas) TableName() string {
	return "net_nas"
}

// NetScheduler scheduler task data model for managing scheduled jobs
type NetScheduler struct {
	ID          int64     `json:"id,string" form:"id"`                    // Primary key ID
	Name        string    `json:"name" form:"name"`                       // Scheduler name
	TaskType    string    `json:"task_type" form:"task_type"`             // Task type (latency_check, backup, cleanup, etc.)
	Interval    int       `json:"interval" form:"interval"`               // Interval in seconds
	Status      string    `json:"status" form:"status"`                   // Status (enabled/disabled)
	LastRunAt   time.Time `json:"last_run_at"`                            // Last execution time
	NextRunAt   time.Time `json:"next_run_at"`                            // Next scheduled execution time
	LastResult  string    `json:"last_result" form:"last_result"`         // Last execution result (success/failed)
	LastMessage string    `json:"last_message" form:"last_message"`       // Last execution message or error
	Config      string    `json:"config" form:"config"`                   // JSON config for task-specific settings
	Remark      string    `json:"remark" form:"remark"`                   // Remark
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// TableName Specify table name
func (NetScheduler) TableName() string {
	return "net_scheduler"
}
