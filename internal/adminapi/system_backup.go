package adminapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/internal/webserver"
	"github.com/bjo163/mwx-isp/pkg/common"
)

// backupVersion identifies the backup payload schema.
const backupVersion = "9.1"

// supportedBackupMajor is the only schema major version restoreSystem accepts.
const supportedBackupMajor = "9"

// maxRestoreRecords caps the number of records accepted per table on restore,
// bounding the work a single (potentially malicious) payload can trigger.
const maxRestoreRecords = 100000

// SystemBackup is the on-disk JSON snapshot exchanged by backupSystem and
// restoreSystem.
//
// The payload is versioned by Version and contains deployment configuration,
// tenant identity, and durable tenant ISP/RADIUS/monitoring/notification data.
// Tenant ownership is carried separately in TenantIDs because normal API JSON
// intentionally hides TenantID. Active RadiusOnline rows are omitted because
// they become stale when a service is restored.
//
// Sensitive data notice: the payload includes security-relevant credentials
// (for example RadiusUser passwords, SysOpr password hashes, and SysCert
// private keys). Callers must treat serialized backups as secrets at rest and
// in transit.
type SystemBackup struct {
	// Version is the backup schema version in "major.minor" form.
	Version string `json:"version"`
	// CreatedAt is the server timestamp when the backup was generated.
	CreatedAt time.Time `json:"created_at"`
	// Tenants stores the organizations and their company/invoice identity.
	Tenants []domain.Tenant `json:"tenants,omitempty"`
	// TenantIDs maps tenant-owned table and row IDs to their owning tenant.
	TenantIDs map[string]map[string]int64 `json:"tenant_ids,omitempty"`
	// OprLogs stores tenant-owned operator audit history.
	OprLogs []domain.SysOprLog `json:"operator_logs,omitempty"`
	// Nodes stores exported network node definitions.
	Nodes []domain.NetNode `json:"nodes"`
	// Nas stores exported NAS device records.
	Nas []domain.NetNas `json:"nas"`
	// Profiles stores exported RADIUS profile definitions.
	Profiles []domain.RadiusProfile `json:"profiles"`
	// Users stores exported RADIUS user records.
	Users []domain.RadiusUser `json:"users"`
	// Configs stores exported dynamic system configuration items.
	Configs []domain.SysConfig `json:"configs"`
	// Operators stores exported admin operator accounts.
	Operators []domain.SysOpr `json:"operators"`
	// Certs stores exported managed certificates (sys_cert), including their
	// PEM private keys, so certificate-based EAP (EAP-TLS/PEAP/TTLS) keeps
	// working after a restore. Restores older backups without this field
	// simply skip the table.
	Certs []SystemBackupCert `json:"certs,omitempty"`
	// Accounting stores finalized RADIUS session history.
	Accounting []domain.RadiusAccounting `json:"accounting,omitempty"`
	// SessionActions stores durable CoA/Disconnect audit records.
	SessionActions []domain.RadiusSessionActionAudit `json:"session_actions,omitempty"`
	// Customers stores commercial subscriber records.
	Customers []domain.Customer `json:"customers,omitempty"`
	// Packages stores tenant ISP service packages.
	Packages []domain.InternetPackage `json:"packages,omitempty"`
	// Subscriptions stores customer service subscriptions.
	Subscriptions []domain.Subscription `json:"subscriptions,omitempty"`
	// Invoices stores generated billing documents.
	Invoices []domain.Invoice `json:"invoices,omitempty"`
	// InvoiceItems stores line items for invoices.
	InvoiceItems []domain.InvoiceItem `json:"invoice_items,omitempty"`
	// Payments stores tenant payment records.
	Payments []domain.Payment `json:"payments,omitempty"`
	// BillingEvents stores subscription and payment lifecycle history.
	BillingEvents []domain.BillingEvent `json:"billing_events,omitempty"`
	// Sequences stores tenant-local document numbering state.
	Sequences []domain.DocumentSequence `json:"document_sequences,omitempty"`
	// MonitorTargets stores tenant-owned probe configuration and encrypted secrets.
	MonitorTargets []SystemBackupMonitorTarget `json:"monitor_targets,omitempty"`
	// MonitorSamples stores bounded network probe history.
	MonitorSamples []domain.NetMonitorSample `json:"monitor_samples,omitempty"`
	// MonitorIncidents stores network incident history.
	MonitorIncidents []domain.NetMonitorIncident `json:"monitor_incidents,omitempty"`
	// NotificationSettings stores per-tenant alert preferences.
	NotificationSettings []domain.NotificationSettings `json:"notification_settings,omitempty"`
	// NotificationOutbox stores tenant delivery history and pending notifications.
	NotificationOutbox []domain.NotificationOutbox `json:"notification_outbox,omitempty"`
}

// SystemBackupMonitorTarget preserves encrypted SNMP credentials that the
// ordinary monitor API deliberately omits from JSON responses.
type SystemBackupMonitorTarget struct {
	domain.NetMonitorTarget
	SNMPCommunityEncrypted []byte `json:"snmp_community_encrypted,omitempty"`
	SNMPAuthEncrypted      []byte `json:"snmp_auth_encrypted,omitempty"`
	SNMPPrivacyEncrypted   []byte `json:"snmp_privacy_encrypted,omitempty"`
}

func newSystemBackupMonitorTarget(target domain.NetMonitorTarget) SystemBackupMonitorTarget {
	return SystemBackupMonitorTarget{
		NetMonitorTarget: target, SNMPCommunityEncrypted: target.SNMPCommunityEncrypted,
		SNMPAuthEncrypted: target.SNMPAuthEncrypted, SNMPPrivacyEncrypted: target.SNMPPrivacyEncrypted,
	}
}

func (b SystemBackupMonitorTarget) toMonitorTarget() domain.NetMonitorTarget {
	target := b.NetMonitorTarget
	target.SNMPCommunityEncrypted = b.SNMPCommunityEncrypted
	target.SNMPAuthEncrypted = b.SNMPAuthEncrypted
	target.SNMPPrivacyEncrypted = b.SNMPPrivacyEncrypted
	return target
}

func tenantOwnedBackupRows(b *SystemBackup) map[string]any {
	return map[string]any{
		// sys_opr_log predates tenant isolation and has no TenantID field; it is
		// retained as installation-wide audit history, like other system logs.
		"sys_opr":  b.Operators,
		"net_node": b.Nodes, "net_nas": b.Nas, "radius_profile": b.Profiles,
		"radius_user": b.Users, "radius_accounting": b.Accounting,
		"radius_session_action_audit": b.SessionActions,
		"isp_customer":                b.Customers, "isp_package": b.Packages,
		"isp_subscription": b.Subscriptions, "isp_invoice": b.Invoices,
		"isp_invoice_item": b.InvoiceItems, "isp_payment": b.Payments,
		"isp_billing_event": b.BillingEvents, "isp_document_sequence": b.Sequences,
		"net_monitor_target": b.MonitorTargets, "net_monitor_sample": b.MonitorSamples,
		"net_monitor_incident":  b.MonitorIncidents,
		"notification_settings": b.NotificationSettings, "notification_outbox": b.NotificationOutbox,
	}
}

func captureTenantIDs(b *SystemBackup) error {
	b.TenantIDs = make(map[string]map[string]int64)
	for table, rows := range tenantOwnedBackupRows(b) {
		values := reflect.ValueOf(rows)
		if values.Kind() != reflect.Slice {
			return fmt.Errorf("backup table %s is not a record slice", table)
		}
		ids := make(map[string]int64, values.Len())
		for i := 0; i < values.Len(); i++ {
			row := values.Index(i)
			if row.Kind() == reflect.Pointer {
				row = row.Elem()
			}
			idField, tenantField := row.FieldByName("ID"), row.FieldByName("TenantID")
			if !idField.IsValid() || idField.Kind() != reflect.Int64 || !tenantField.IsValid() || tenantField.Kind() != reflect.Int64 {
				return fmt.Errorf("backup table %s does not expose int64 ID and TenantID fields", table)
			}
			if idField.Int() <= 0 || tenantField.Int() <= 0 {
				return fmt.Errorf("backup table %s row %d has invalid tenant ownership", table, i)
			}
			ids[fmt.Sprintf("%d", idField.Int())] = tenantField.Int()
		}
		b.TenantIDs[table] = ids
	}
	return nil
}

func applyTenantIDs(b *SystemBackup) error {
	legacy := b.Version == "9.0"
	knownTenants := make(map[int64]bool, len(b.Tenants))
	for _, tenant := range b.Tenants {
		if tenant.ID <= 0 || strings.TrimSpace(tenant.Slug) == "" {
			return fmt.Errorf("tenant record is missing a valid ID or slug")
		}
		knownTenants[tenant.ID] = true
	}
	for table, rows := range tenantOwnedBackupRows(b) {
		values := reflect.ValueOf(rows)
		ids := b.TenantIDs[table]
		for i := 0; i < values.Len(); i++ {
			row := values.Index(i)
			if row.Kind() == reflect.Pointer {
				row = row.Elem()
			}
			idField, tenantField := row.FieldByName("ID"), row.FieldByName("TenantID")
			if !idField.IsValid() || idField.Kind() != reflect.Int64 || !tenantField.IsValid() || tenantField.Kind() != reflect.Int64 || !tenantField.CanSet() {
				return fmt.Errorf("backup table %s does not expose a writable tenant owner", table)
			}
			tenantID, exists := ids[fmt.Sprintf("%d", idField.Int())]
			if !exists && legacy {
				tenantID, exists = domain.DefaultTenantID, true
			}
			if !exists || tenantID <= 0 {
				return fmt.Errorf("backup table %s row %d is missing tenant ownership metadata", table, i)
			}
			if len(b.Tenants) > 0 && !knownTenants[tenantID] {
				return fmt.Errorf("backup table %s row %d references unknown tenant %d", table, i, tenantID)
			}
			tenantField.SetInt(tenantID)
		}
	}
	return nil
}

// SystemBackupCert is the backup serialization of a domain.SysCert record.
//
// domain.SysCert deliberately hides PrivateKey from the REST API via json:"-",
// so marshaling SysCert directly would silently drop key material and a
// restored server certificate would be unusable for EAP-TLS/PEAP/TTLS. This
// wrapper re-exposes the private key for the access-controlled backup payload,
// which is already treated as a secret (it carries user passwords and operator
// hashes). The list/detail certificate APIs remain unaffected and never
// disclose the key.
type SystemBackupCert struct {
	domain.SysCert
	// PrivateKey is the PEM-encoded private key of the certificate, exported
	// only inside backups.
	PrivateKey string `json:"private_key,omitempty"`
}

// newSystemBackupCert wraps a SysCert for backup export, copying the private
// key into the serializable field.
func newSystemBackupCert(cert domain.SysCert) SystemBackupCert {
	return SystemBackupCert{SysCert: cert, PrivateKey: cert.PrivateKey}
}

// toSysCert converts a backup record back into the domain model for restore,
// moving the private key into the persisted (API-hidden) field.
func (b SystemBackupCert) toSysCert() domain.SysCert {
	cert := b.SysCert
	cert.PrivateKey = b.PrivateKey
	return cert
}

func registerSystemBackupRoutes() {
	webserver.ApiGET("/system/backup", backupSystem, requirePlatformAdmin())
	webserver.ApiPOST("/system/restore", restoreSystem, requirePlatformAdmin())
}

// backupSystem exports the core configuration tables as a downloadable JSON file.
// A copy is also written to the configured backup directory when available.
//
// SECURITY: the exported payload contains sensitive credentials in clear form —
// RADIUS user passwords are stored in plaintext (required for PAP/CHAP), the
// operators table includes admin password hashes, and managed certificates
// include their PEM private keys. Both the downloaded file and the on-disk
// copy in the backup directory must be handled and stored securely.
func backupSystem(c echo.Context) error {
	// A platform backup is installation-wide; an authenticated tenant context
	// must not silently produce a partial backup of only the current tenant.
	db := GetAppContext(c).DB().WithContext(context.Background())

	backup := SystemBackup{
		Version:   backupVersion,
		CreatedAt: time.Now(),
	}

	if err := db.Find(&backup.Nodes).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to export nodes", err.Error())
	}
	if err := db.Find(&backup.Nas).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to export NAS", err.Error())
	}
	if err := db.Find(&backup.Profiles).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to export profiles", err.Error())
	}
	if err := db.Find(&backup.Users).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to export users", err.Error())
	}
	if err := db.Find(&backup.Configs).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to export configs", err.Error())
	}
	if err := db.Find(&backup.Operators).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to export operators", err.Error())
	}
	loads := []struct {
		name string
		out  any
	}{
		{"tenant organizations", &backup.Tenants}, {"operator logs", &backup.OprLogs},
		{"RADIUS accounting", &backup.Accounting}, {"session action audits", &backup.SessionActions},
		{"customers", &backup.Customers}, {"packages", &backup.Packages},
		{"subscriptions", &backup.Subscriptions}, {"invoices", &backup.Invoices},
		{"invoice items", &backup.InvoiceItems}, {"payments", &backup.Payments},
		{"billing events", &backup.BillingEvents}, {"document sequences", &backup.Sequences},
		{"monitor samples", &backup.MonitorSamples}, {"monitor incidents", &backup.MonitorIncidents},
		{"notification settings", &backup.NotificationSettings}, {"notification outbox", &backup.NotificationOutbox},
	}
	for _, load := range loads {
		if err := db.Find(load.out).Error; err != nil {
			return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to export "+load.name, err.Error())
		}
	}
	var monitorTargets []domain.NetMonitorTarget
	if err := db.Find(&monitorTargets).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to export monitor targets", err.Error())
	}
	for _, target := range monitorTargets {
		backup.MonitorTargets = append(backup.MonitorTargets, newSystemBackupMonitorTarget(target))
	}
	var certs []domain.SysCert
	if err := db.Find(&certs).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to export certificates", err.Error())
	}
	for _, cert := range certs {
		backup.Certs = append(backup.Certs, newSystemBackupCert(cert))
	}
	if err := captureTenantIDs(&backup); err != nil {
		return fail(c, http.StatusInternalServerError, "BACKUP_ERROR", "Failed to capture tenant ownership", err.Error())
	}

	bs, err := json.MarshalIndent(backup, "", "  ")
	if err != nil {
		return fail(c, http.StatusInternalServerError, "ENCODE_ERROR", "Failed to encode backup", err.Error())
	}

	filename := fmt.Sprintf("mwx-isp-backup-%s.json", backup.CreatedAt.Format("20060102-150405"))

	// Best-effort: persist a copy of the backup to the backup directory.
	if cfg := GetAppContext(c).Config(); cfg != nil {
		if dir := cfg.GetBackupDir(); dir != "" {
			if mkErr := os.MkdirAll(dir, 0750); mkErr == nil {
				_ = os.WriteFile(filepath.Join(dir, filename), bs, 0600) //nolint:errcheck
			}
		}
	}

	c.Response().Header().Set("Content-Disposition", "attachment;filename="+filename)
	return c.JSONBlob(http.StatusOK, bs)
}

// SystemRestoreResult reports how many records restoreSystem upserted into each
// table during a successful restore transaction.
//
// A zero value for a field means either the table was absent from the payload
// or the payload contained no records for that table.
type SystemRestoreResult struct {
	// Tenants is the number of tenant organizations restored.
	Tenants int `json:"tenants"`
	// Nodes is the number of net_node records restored.
	Nodes int `json:"nodes"`
	// Nas is the number of net_nas records restored.
	Nas int `json:"nas"`
	// Profiles is the number of radius_profile records restored.
	Profiles int `json:"profiles"`
	// Users is the number of radius_user records restored.
	Users int `json:"users"`
	// Configs is the number of sys_config records restored.
	Configs int `json:"configs"`
	// Operators is the number of sys_opr records restored.
	Operators int `json:"operators"`
	// Certs is the number of sys_cert records restored.
	Certs int `json:"certs"`
	// Accounting is the number of finalized RADIUS records restored.
	Accounting int `json:"accounting"`
	// SessionActions is the number of CoA/Disconnect audit records restored.
	SessionActions int `json:"session_actions"`
	// Customers is the number of ISP customers restored.
	Customers int `json:"customers"`
	// Packages is the number of commercial packages restored.
	Packages int `json:"packages"`
	// Subscriptions is the number of subscriptions restored.
	Subscriptions int `json:"subscriptions"`
	// Invoices is the number of invoices restored.
	Invoices int `json:"invoices"`
	// InvoiceItems is the number of invoice line items restored.
	InvoiceItems int `json:"invoice_items"`
	// Payments is the number of payment records restored.
	Payments int `json:"payments"`
	// BillingEvents is the number of billing lifecycle events restored.
	BillingEvents int `json:"billing_events"`
	// Sequences is the number of tenant document sequences restored.
	Sequences int `json:"sequences"`
	// MonitorTargets is the number of network monitor targets restored.
	MonitorTargets int `json:"monitor_targets"`
	// MonitorSamples is the number of network monitor samples restored.
	MonitorSamples int `json:"monitor_samples"`
	// MonitorIncidents is the number of network incidents restored.
	MonitorIncidents int `json:"monitor_incidents"`
	// NotificationSettings is the number of tenant notification settings restored.
	NotificationSettings int `json:"notification_settings"`
	// NotificationOutbox is the number of notifications restored.
	NotificationOutbox int `json:"notification_outbox"`
	// OprLogs is the number of operator audit logs restored.
	OprLogs int `json:"operator_logs"`
}

// restoreSystem imports a previously exported backup file, upserting records
// into the core configuration tables inside a single transaction.
func restoreSystem(c echo.Context) error {
	file, err := c.FormFile("upload")
	if err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_FILE", "Backup file is required", err.Error())
	}
	src, err := file.Open()
	if err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_FILE", "Unable to open backup file", err.Error())
	}
	defer func() { _ = src.Close() }() //nolint:errcheck

	bs, err := io.ReadAll(src)
	if err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_FILE", "Unable to read backup file", err.Error())
	}

	var backup SystemBackup
	if err := json.Unmarshal(bs, &backup); err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_BACKUP", "Invalid backup file format", err.Error())
	}
	if err := applyTenantIDs(&backup); err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_BACKUP", "Backup tenant ownership metadata is invalid", err.Error())
	}

	// Strong validation: reject arbitrary, incompatible, or malformed payloads
	// before touching the database.
	if err := validateBackup(&backup); err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_BACKUP", "Backup failed validation", err.Error())
	}

	// Restoring the operators table can rewrite admin password hashes and
	// privilege levels, so it is a potential privilege-escalation vector.
	// Restrict it to super operators even though admins may restore other tables.
	if len(backup.Operators) > 0 {
		current, err := resolveOperatorFromContext(c)
		if err != nil {
			return fail(c, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required", nil)
		}
		if !strings.EqualFold(current.Level, LevelSuper) {
			return fail(c, http.StatusForbidden, "PERMISSION_DENIED",
				"Only super operators may restore the operators table", nil)
		}
	}
	// PlatformAdmin is intentionally omitted from exported operator JSON. Keep
	// the existing platform authority of matching operator IDs during restore,
	// and never grant that authority from an uploaded backup payload.
	globalDB := GetAppContext(c).DB().WithContext(context.Background())
	platformAdmins := make(map[int64]bool)
	if len(backup.Operators) > 0 {
		operatorIDs := make([]int64, 0, len(backup.Operators))
		for _, operator := range backup.Operators {
			operatorIDs = append(operatorIDs, operator.ID)
		}
		var existing []domain.SysOpr
		if err := globalDB.Select("id", "platform_admin").Where("id IN ?", operatorIDs).Find(&existing).Error; err != nil {
			return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to preserve platform administrator access", err.Error())
		}
		for _, operator := range existing {
			platformAdmins[operator.ID] = operator.PlatformAdmin
		}
		for i := range backup.Operators {
			backup.Operators[i].PlatformAdmin = platformAdmins[backup.Operators[i].ID]
		}
	}

	result := SystemRestoreResult{}
	upsert := clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		UpdateAll: true,
	}

	err = globalDB.Transaction(func(tx *gorm.DB) error {
		if len(backup.Tenants) > 0 {
			if err := tx.Clauses(upsert).Create(&backup.Tenants).Error; err != nil {
				return err
			}
			result.Tenants = len(backup.Tenants)
		}
		if len(backup.Nodes) > 0 {
			if err := tx.Clauses(upsert).Create(&backup.Nodes).Error; err != nil {
				return err
			}
			result.Nodes = len(backup.Nodes)
		}
		if len(backup.Nas) > 0 {
			if err := tx.Clauses(upsert).Create(&backup.Nas).Error; err != nil {
				return err
			}
			result.Nas = len(backup.Nas)
		}
		if len(backup.Profiles) > 0 {
			if err := tx.Clauses(upsert).Create(&backup.Profiles).Error; err != nil {
				return err
			}
			result.Profiles = len(backup.Profiles)
		}
		if len(backup.Users) > 0 {
			if err := tx.Clauses(upsert).Create(&backup.Users).Error; err != nil {
				return err
			}
			result.Users = len(backup.Users)
		}
		if len(backup.Accounting) > 0 {
			if err := tx.Clauses(upsert).Create(&backup.Accounting).Error; err != nil {
				return err
			}
			result.Accounting = len(backup.Accounting)
		}
		if len(backup.SessionActions) > 0 {
			if err := tx.Clauses(upsert).Create(&backup.SessionActions).Error; err != nil {
				return err
			}
			result.SessionActions = len(backup.SessionActions)
		}
		if len(backup.Customers) > 0 {
			if err := tx.Clauses(upsert).Create(&backup.Customers).Error; err != nil {
				return err
			}
			result.Customers = len(backup.Customers)
		}
		if len(backup.Packages) > 0 {
			if err := tx.Clauses(upsert).Create(&backup.Packages).Error; err != nil {
				return err
			}
			result.Packages = len(backup.Packages)
		}
		if len(backup.Subscriptions) > 0 {
			if err := tx.Clauses(upsert).Create(&backup.Subscriptions).Error; err != nil {
				return err
			}
			result.Subscriptions = len(backup.Subscriptions)
		}
		if len(backup.Invoices) > 0 {
			if err := tx.Clauses(upsert).Create(&backup.Invoices).Error; err != nil {
				return err
			}
			result.Invoices = len(backup.Invoices)
		}
		if len(backup.InvoiceItems) > 0 {
			if err := tx.Clauses(upsert).Create(&backup.InvoiceItems).Error; err != nil {
				return err
			}
			result.InvoiceItems = len(backup.InvoiceItems)
		}
		if len(backup.Payments) > 0 {
			if err := tx.Clauses(upsert).Create(&backup.Payments).Error; err != nil {
				return err
			}
			result.Payments = len(backup.Payments)
		}
		if len(backup.BillingEvents) > 0 {
			if err := tx.Clauses(upsert).Create(&backup.BillingEvents).Error; err != nil {
				return err
			}
			result.BillingEvents = len(backup.BillingEvents)
		}
		if len(backup.Sequences) > 0 {
			if err := tx.Clauses(upsert).Create(&backup.Sequences).Error; err != nil {
				return err
			}
			result.Sequences = len(backup.Sequences)
		}
		if len(backup.MonitorTargets) > 0 {
			targets := make([]domain.NetMonitorTarget, 0, len(backup.MonitorTargets))
			for _, target := range backup.MonitorTargets {
				targets = append(targets, target.toMonitorTarget())
			}
			if err := tx.Clauses(upsert).Create(&targets).Error; err != nil {
				return err
			}
			result.MonitorTargets = len(targets)
		}
		if len(backup.MonitorSamples) > 0 {
			if err := tx.Clauses(upsert).Create(&backup.MonitorSamples).Error; err != nil {
				return err
			}
			result.MonitorSamples = len(backup.MonitorSamples)
		}
		if len(backup.MonitorIncidents) > 0 {
			if err := tx.Clauses(upsert).Create(&backup.MonitorIncidents).Error; err != nil {
				return err
			}
			result.MonitorIncidents = len(backup.MonitorIncidents)
		}
		if len(backup.NotificationSettings) > 0 {
			if err := tx.Clauses(upsert).Create(&backup.NotificationSettings).Error; err != nil {
				return err
			}
			result.NotificationSettings = len(backup.NotificationSettings)
		}
		if len(backup.NotificationOutbox) > 0 {
			if err := tx.Clauses(upsert).Create(&backup.NotificationOutbox).Error; err != nil {
				return err
			}
			result.NotificationOutbox = len(backup.NotificationOutbox)
		}
		if len(backup.OprLogs) > 0 {
			if err := tx.Clauses(upsert).Create(&backup.OprLogs).Error; err != nil {
				return err
			}
			result.OprLogs = len(backup.OprLogs)
		}
		if len(backup.Configs) > 0 {
			if err := tx.Clauses(upsert).Create(&backup.Configs).Error; err != nil {
				return err
			}
			result.Configs = len(backup.Configs)
		}
		if len(backup.Operators) > 0 {
			// Use the API-hidden field only from the existing database snapshot;
			// the backup file cannot grant platform administrator privileges.
			for i := range backup.Operators {
				backup.Operators[i].PlatformAdmin = platformAdmins[backup.Operators[i].ID]
			}
			if err := tx.Clauses(upsert).Create(&backup.Operators).Error; err != nil {
				return err
			}
			result.Operators = len(backup.Operators)
		}
		if len(backup.Certs) > 0 {
			certs := make([]domain.SysCert, 0, len(backup.Certs))
			for _, bc := range backup.Certs {
				certs = append(certs, bc.toSysCert())
			}
			if err := tx.Clauses(upsert).Create(&certs).Error; err != nil {
				return err
			}
			result.Certs = len(certs)
		}
		return nil
	})
	if err != nil {
		return fail(c, http.StatusInternalServerError, "RESTORE_ERROR", "Failed to restore backup", err.Error())
	}

	return ok(c, result)
}

// validateBackup performs strong, write-free validation of a restore payload.
// It rejects incompatible schema versions, oversized payloads, and records that
// are missing required identifiers or carry invalid enum-like values, ensuring a
// malformed or malicious backup cannot be upserted into the configuration tables.
func validateBackup(b *SystemBackup) error {
	major := b.Version
	if i := strings.IndexByte(major, '.'); i >= 0 {
		major = major[:i]
	}
	if major != supportedBackupMajor {
		return fmt.Errorf("incompatible backup version %q, expected %s.x", b.Version, supportedBackupMajor)
	}
	if b.Version == backupVersion && len(b.Tenants) == 0 {
		return fmt.Errorf("backup version %s must include tenant organizations", backupVersion)
	}

	for name, n := range map[string]int{
		"tenants": len(b.Tenants), "operator_logs": len(b.OprLogs),
		"nodes": len(b.Nodes), "nas": len(b.Nas), "profiles": len(b.Profiles),
		"users": len(b.Users), "configs": len(b.Configs), "operators": len(b.Operators),
		"certs": len(b.Certs), "accounting": len(b.Accounting), "session_actions": len(b.SessionActions),
		"customers": len(b.Customers), "packages": len(b.Packages), "subscriptions": len(b.Subscriptions),
		"invoices": len(b.Invoices), "invoice_items": len(b.InvoiceItems), "payments": len(b.Payments),
		"billing_events": len(b.BillingEvents), "document_sequences": len(b.Sequences),
		"monitor_targets": len(b.MonitorTargets), "monitor_samples": len(b.MonitorSamples),
		"monitor_incidents": len(b.MonitorIncidents), "notification_settings": len(b.NotificationSettings),
		"notification_outbox": len(b.NotificationOutbox),
	} {
		if n > maxRestoreRecords {
			return fmt.Errorf("table %q has %d records, exceeding the limit of %d", name, n, maxRestoreRecords)
		}
	}
	for i := range b.Tenants {
		if b.Tenants[i].ID <= 0 || strings.TrimSpace(b.Tenants[i].Slug) == "" || strings.TrimSpace(b.Tenants[i].Name) == "" {
			return fmt.Errorf("tenants[%d]: id, slug, and name are required", i)
		}
	}

	for i := range b.Nodes {
		if b.Nodes[i].ID == 0 || strings.TrimSpace(b.Nodes[i].Name) == "" {
			return fmt.Errorf("nodes[%d]: id and name are required", i)
		}
	}
	for i := range b.Nas {
		if b.Nas[i].ID == 0 || strings.TrimSpace(b.Nas[i].Name) == "" {
			return fmt.Errorf("nas[%d]: id and name are required", i)
		}
		if !isValidStatus(b.Nas[i].Status) {
			return fmt.Errorf("nas[%d]: invalid status %q", i, b.Nas[i].Status)
		}
	}
	for i := range b.Profiles {
		if b.Profiles[i].ID == 0 || strings.TrimSpace(b.Profiles[i].Name) == "" {
			return fmt.Errorf("profiles[%d]: id and name are required", i)
		}
	}
	for i := range b.Users {
		if b.Users[i].ID == 0 || strings.TrimSpace(b.Users[i].Username) == "" {
			return fmt.Errorf("users[%d]: id and username are required", i)
		}
		if !isValidStatus(b.Users[i].Status) {
			return fmt.Errorf("users[%d]: invalid status %q", i, b.Users[i].Status)
		}
	}
	for i := range b.Configs {
		if b.Configs[i].ID == 0 || strings.TrimSpace(b.Configs[i].Name) == "" {
			return fmt.Errorf("configs[%d]: id and name are required", i)
		}
	}
	for i := range b.Operators {
		if b.Operators[i].ID == 0 || strings.TrimSpace(b.Operators[i].Username) == "" {
			return fmt.Errorf("operators[%d]: id and username are required", i)
		}
		if !isValidLevel(b.Operators[i].Level) {
			return fmt.Errorf("operators[%d]: invalid level %q", i, b.Operators[i].Level)
		}
		if !isValidStatus(b.Operators[i].Status) {
			return fmt.Errorf("operators[%d]: invalid status %q", i, b.Operators[i].Status)
		}
	}
	for i := range b.Certs {
		if b.Certs[i].ID == 0 || strings.TrimSpace(b.Certs[i].Name) == "" {
			return fmt.Errorf("certs[%d]: id and name are required", i)
		}
		if !isValidCertType(b.Certs[i].CertType) {
			return fmt.Errorf("certs[%d]: invalid cert_type %q", i, b.Certs[i].CertType)
		}
	}
	return nil
}

// isValidCertType reports whether t is a recognized managed certificate type,
// matching the values accepted by the certificate admin API.
func isValidCertType(t string) bool {
	switch t {
	case "server", "ca":
		return true
	default:
		return false
	}
}

// isValidStatus reports whether s is an accepted account/device status. An empty
// status is allowed because callers default it elsewhere.
func isValidStatus(s string) bool {
	switch s {
	case "", common.ENABLED, common.DISABLED:
		return true
	default:
		return false
	}
}

// isValidLevel reports whether l is a recognized operator privilege level.
func isValidLevel(l string) bool {
	switch l {
	case LevelSuper, LevelAdmin, LevelOperator:
		return true
	default:
		return false
	}
}
