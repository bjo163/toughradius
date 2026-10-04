package domain

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSysConfig_TableName(t *testing.T) {
	model := SysConfig{}
	assert.Equal(t, "sys_config", model.TableName())
}

func TestTenant_TableName(t *testing.T) {
	assert.Equal(t, "tenant", (Tenant{}).TableName())
}

func TestSysOpr_TableName(t *testing.T) {
	model := SysOpr{}
	assert.Equal(t, "sys_opr", model.TableName())
}

func TestSysOprLog_TableName(t *testing.T) {
	model := SysOprLog{}
	assert.Equal(t, "sys_opr_log", model.TableName())
}

func TestNetNode_TableName(t *testing.T) {
	model := NetNode{}
	assert.Equal(t, "net_node", model.TableName())
}

func TestNetNas_TableName(t *testing.T) {
	model := NetNas{}
	assert.Equal(t, "net_nas", model.TableName())
}

func TestRadiusProfile_TableName(t *testing.T) {
	model := RadiusProfile{}
	assert.Equal(t, "radius_profile", model.TableName())
}

func TestRadiusUser_TableName(t *testing.T) {
	model := RadiusUser{}
	assert.Equal(t, "radius_user", model.TableName())
}

func TestRadiusOnline_TableName(t *testing.T) {
	model := RadiusOnline{}
	assert.Equal(t, "radius_online", model.TableName())
}

func TestRadiusAccounting_TableName(t *testing.T) {
	model := RadiusAccounting{}
	assert.Equal(t, "radius_accounting", model.TableName())
}

func TestRadiusSessionActionAudit_TableName(t *testing.T) {
	model := RadiusSessionActionAudit{}
	assert.Equal(t, "radius_session_action_audit", model.TableName())
}

// TestAllModelsHaveTableName ensures every model listed in Tables implements TableName
func TestAllModelsHaveTableName(t *testing.T) {
	type tableNamer interface {
		TableName() string
	}

	for _, table := range Tables {
		t.Run("", func(t *testing.T) {
			_, ok := table.(tableNamer)
			assert.True(t, ok, "Model %T should implement TableName()", table)
		})
	}
}

// TestTableNameUniqueness ensures all table names are unique
func TestTableNameUniqueness(t *testing.T) {
	type tableNamer interface {
		TableName() string
	}

	tableNames := make(map[string]bool)

	for _, table := range Tables {
		if tn, ok := table.(tableNamer); ok {
			name := tn.TableName()
			assert.False(t, tableNames[name], "Table name %s is duplicated", name)
			tableNames[name] = true
		}
	}

	// Ensure all table names follow snake_case
	expectedNames := map[string]bool{
		"tenant":                      true,
		"sys_config":                  true,
		"sys_opr":                     true,
		"tenant_membership":           true,
		"sys_opr_log":                 true,
		"sys_cert":                    true,
		"sys_product_branding":        true,
		"net_node":                    true,
		"net_nas":                     true,
		"radius_profile":              true,
		"radius_user":                 true,
		"radius_online":               true,
		"radius_session_action_audit": true,
		"radius_accounting":           true,
		"isp_customer":                true,
		"isp_package":                 true,
		"isp_subscription":            true,
		"isp_invoice":                 true,
		"isp_invoice_item":            true,
		"isp_payment":                 true,
		"isp_billing_event":           true,
		"isp_document_sequence":       true,
		"net_monitor_target":          true,
		"net_monitor_sample":          true,
		"net_monitor_incident":        true,
		"notification_settings":       true,
		"notification_outbox":         true,
		"radius_traffic_sample":       true,
		"syslog_event":                true,
		"isp_hotspot_batch":           true,
		"isp_hotspot_voucher":         true,
		"isp_ipam_pool":               true,
		"isp_trouble_ticket":          true,
		"isp_odp":                     true,
	}

	assert.Equal(t, len(expectedNames), len(tableNames), "Table name count should match")

	for name := range tableNames {
		assert.True(t, expectedNames[name], "Unexpected table name: %s", name)
	}
}

func TestRadiusTrafficSample_TableName(t *testing.T) {
	model := RadiusTrafficSample{}
	assert.Equal(t, "radius_traffic_sample", model.TableName())
}

func TestSyslogEvent_TableName(t *testing.T) {
	model := SyslogEvent{}
	assert.Equal(t, "syslog_event", model.TableName())
}

func TestOperationsModels_TableName(t *testing.T) {
	assert.Equal(t, "isp_hotspot_batch", HotspotBatch{}.TableName())
	assert.Equal(t, "isp_hotspot_voucher", HotspotVoucher{}.TableName())
	assert.Equal(t, "isp_ipam_pool", IPAMPool{}.TableName())
	assert.Equal(t, "isp_trouble_ticket", TroubleTicket{}.TableName())
	assert.Equal(t, "isp_odp", ODP{}.TableName())
}
