//go:build integration

package integration

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/internal/tenancy"
	"github.com/bjo163/mwx-isp/pkg/common"
)

// uniqueSuffix returns a per-test suffix so tests stay isolated on the shared
// database without truncation or parallel-unsafe global resets.
func uniqueSuffix() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

func seedProfile(t *testing.T, name string) int64 {
	t.Helper()
	p := &domain.RadiusProfile{
		ID:        common.UUIDint64(),
		Name:      name,
		Status:    common.ENABLED,
		AddrPool:  "it-pool",
		ActiveNum: 1,
		UpRate:    1000,
		DownRate:  2000,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	require.NoError(t, h.appCtx.DB().Create(p).Error)
	return p.ID
}

// TestSystemBackupRestoreRoundTrip exercises the real /system/backup and
// /system/restore HTTP endpoints against PostgreSQL and proves the security
// behaviour we rely on: backups carry plaintext RADIUS passwords (unlike the
// list API, which strips them) and restore reinstates a deleted user with the
// password intact via an ON CONFLICT upsert on real Postgres.
func TestSystemBackupRestoreRoundTrip(t *testing.T) {
	c := newAPIClient(t)
	suffix := uniqueSuffix()
	db := h.appCtx.DB()
	profileID := seedProfile(t, "it-profile-"+suffix)

	username := "it-backup-" + suffix
	const password = "secret-Pw-123"
	user := &domain.RadiusUser{
		ID:         common.UUIDint64(),
		ProfileId:  profileID,
		Username:   username,
		Password:   password,
		Status:     common.ENABLED,
		ExpireTime: time.Now().AddDate(1, 0, 0),
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}
	require.NoError(t, h.appCtx.DB().Create(user).Error)

	// A platform backup must include tenant-owned data beyond the default
	// organization, even though TenantID is hidden from ordinary JSON APIs.
	tenant := domain.Tenant{Name: "Backup Tenant " + suffix, Slug: "it-backup-" + suffix, Kind: "rtrw", Status: "active"}
	require.NoError(t, db.Create(&tenant).Error)
	tenantDB := db.WithContext(tenancy.WithTenantID(t.Context(), tenant.ID))
	tenantOperator := domain.SysOpr{ID: common.UUIDint64(), TenantID: tenant.ID, Username: "backup-operator-" + suffix, Password: "stored-hash", Level: "admin", Status: common.ENABLED}
	require.NoError(t, tenantDB.Create(&tenantOperator).Error)
	tenantProfile := domain.RadiusProfile{ID: common.UUIDint64(), Name: "Tenant backup profile " + suffix, Status: common.ENABLED}
	require.NoError(t, tenantDB.Create(&tenantProfile).Error)
	tenantUser := domain.RadiusUser{ID: common.UUIDint64(), ProfileId: tenantProfile.ID, Username: "it-tenant-backup-" + suffix, Password: "tenant-secret", Status: common.ENABLED, ExpireTime: time.Now().AddDate(1, 0, 0)}
	require.NoError(t, tenantDB.Create(&tenantUser).Error)
	tenantCustomer := domain.Customer{ID: common.UUIDint64(), CustomerNo: "C-" + suffix, Name: "Tenant Backup Customer", Status: domain.CustomerActive}
	require.NoError(t, tenantDB.Create(&tenantCustomer).Error)
	tenantPackage := domain.InternetPackage{ID: common.UUIDint64(), Code: "P-" + suffix, Name: "Tenant Backup Package", Price: 100000, RadiusProfileID: tenantProfile.ID, BillingCycle: "monthly", Status: "active"}
	require.NoError(t, tenantDB.Create(&tenantPackage).Error)
	tenantMonitor := domain.NetMonitorTarget{
		ID: common.UUIDint64(), Name: "Tenant router " + suffix, Kind: "router", Address: "192.0.2.10",
		ProbeType: "icmp", Enabled: true, SNMPCommunityEncrypted: []byte("community-ciphertext"),
		SNMPAuthEncrypted: []byte("auth-ciphertext"), SNMPPrivacyEncrypted: []byte("privacy-ciphertext"),
	}
	require.NoError(t, tenantDB.Create(&tenantMonitor).Error)

	// 1) Download a backup over HTTP and confirm the plaintext password is present.
	// The endpoint streams the bare SystemBackup JSON (no {"data":...} envelope).
	status, backupBytes := c.get(t, "/api/v1/system/backup")
	require.Equalf(t, http.StatusOK, status, "backup body: %s", string(backupBytes))

	var backup struct {
		Version        string                    `json:"version"`
		Tenants        []domain.Tenant           `json:"tenants"`
		Users          []domain.RadiusUser       `json:"users"`
		Customers      []domain.Customer         `json:"customers"`
		Packages       []domain.InternetPackage  `json:"packages"`
		Memberships    []domain.TenantMembership `json:"tenant_memberships"`
		MonitorTargets []struct {
			ID                     string `json:"id"`
			SNMPCommunityEncrypted []byte `json:"snmp_community_encrypted"`
			SNMPAuthEncrypted      []byte `json:"snmp_auth_encrypted"`
			SNMPPrivacyEncrypted   []byte `json:"snmp_privacy_encrypted"`
		} `json:"monitor_targets"`
		TenantIDs map[string]map[string]int64 `json:"tenant_ids"`
	}
	require.NoErrorf(t, json.Unmarshal(backupBytes, &backup), "backup not JSON: %s", string(backupBytes))
	require.Equal(t, "9.2", backup.Version)
	require.True(t, containsUserWithPassword(backup.Users, username, password),
		"backup must contain %s with its plaintext password", username)
	var backedUpTenant *domain.Tenant
	for i := range backup.Tenants {
		if backup.Tenants[i].ID == tenant.ID {
			backedUpTenant = &backup.Tenants[i]
			break
		}
	}
	require.NotNil(t, backedUpTenant)
	require.Equal(t, tenant.Slug, backedUpTenant.Slug)
	customerIncluded, packageIncluded := false, false
	for _, customer := range backup.Customers {
		if customer.ID == tenantCustomer.ID {
			customerIncluded = true
			assert.Equal(t, tenantCustomer.CustomerNo, customer.CustomerNo)
		}
	}
	for _, pkg := range backup.Packages {
		if pkg.ID == tenantPackage.ID {
			packageIncluded = true
			assert.Equal(t, tenantPackage.Code, pkg.Code)
		}
	}
	require.True(t, customerIncluded)
	require.True(t, packageIncluded)
	require.True(t, containsUserWithPassword(backup.Users, tenantUser.Username, tenantUser.Password))
	require.Equal(t, tenant.ID, backup.TenantIDs["radius_user"][fmt.Sprint(tenantUser.ID)])
	require.Equal(t, tenant.ID, backup.TenantIDs["isp_customer"][fmt.Sprint(tenantCustomer.ID)])
	var backedUpMembership *domain.TenantMembership
	for i := range backup.Memberships {
		if backup.Memberships[i].OperatorID == tenantOperator.ID && backup.Memberships[i].TenantID == tenant.ID {
			backedUpMembership = &backup.Memberships[i]
			break
		}
	}
	require.NotNil(t, backedUpMembership)
	require.Equal(t, "admin", backedUpMembership.Level)
	var backedUpMonitor *struct {
		ID                     string `json:"id"`
		SNMPCommunityEncrypted []byte `json:"snmp_community_encrypted"`
		SNMPAuthEncrypted      []byte `json:"snmp_auth_encrypted"`
		SNMPPrivacyEncrypted   []byte `json:"snmp_privacy_encrypted"`
	}
	for i := range backup.MonitorTargets {
		if backup.MonitorTargets[i].ID == fmt.Sprint(tenantMonitor.ID) {
			backedUpMonitor = &backup.MonitorTargets[i]
			break
		}
	}
	require.NotNil(t, backedUpMonitor)
	require.Equal(t, tenant.ID, backup.TenantIDs["net_monitor_target"][fmt.Sprint(tenantMonitor.ID)])
	require.Equal(t, tenantMonitor.SNMPCommunityEncrypted, backedUpMonitor.SNMPCommunityEncrypted)

	// 2) Delete tenant-owned rows directly, simulating data loss.
	require.NoError(t, h.appCtx.DB().Where("username = ?", username).Delete(&domain.RadiusUser{}).Error)
	for _, row := range []struct {
		model any
		id    int64
	}{
		{&domain.RadiusUser{}, tenantUser.ID}, {&domain.RadiusProfile{}, tenantProfile.ID},
		{&domain.Customer{}, tenantCustomer.ID}, {&domain.InternetPackage{}, tenantPackage.ID},
		{&domain.NetMonitorTarget{}, tenantMonitor.ID}, {&domain.Tenant{}, tenant.ID},
	} {
		require.NoError(t, db.Delete(row.model, row.id).Error)
	}
	require.NoError(t, db.Where("tenant_id = ? AND operator_id = ?", tenant.ID, tenantOperator.ID).Delete(&domain.TenantMembership{}).Error)
	var count int64
	require.NoError(t, h.appCtx.DB().Model(&domain.RadiusUser{}).Where("username = ?", username).Count(&count).Error)
	require.Equal(t, int64(0), count)

	// 3) Restore the backup over HTTP (multipart upload of the bare backup JSON).
	status, body := c.postMultipart(t, "/api/v1/system/restore", "backup.json", backupBytes)
	require.Equalf(t, http.StatusOK, status, "restore body: %s", string(body))

	// 4) Tenant and its rows are restored with the original tenant ownership.
	var restored domain.RadiusUser
	require.NoError(t, h.appCtx.DB().Where("username = ?", username).First(&restored).Error)
	assert.Equal(t, password, restored.Password, "restore must preserve the plaintext password")
	var restoredTenant domain.Tenant
	require.NoError(t, db.First(&restoredTenant, tenant.ID).Error)
	assert.Equal(t, tenant.Slug, restoredTenant.Slug)
	var restoredTenantUser domain.RadiusUser
	require.NoError(t, db.WithContext(tenancy.WithTenantID(t.Context(), tenant.ID)).Where("id = ?", tenantUser.ID).First(&restoredTenantUser).Error)
	assert.Equal(t, tenant.ID, restoredTenantUser.TenantID)
	assert.Equal(t, tenantUser.Password, restoredTenantUser.Password)
	var restoredTenantCustomer domain.Customer
	require.NoError(t, db.WithContext(tenancy.WithTenantID(t.Context(), tenant.ID)).First(&restoredTenantCustomer, tenantCustomer.ID).Error)
	assert.Equal(t, tenant.ID, restoredTenantCustomer.TenantID)
	var restoredMonitor domain.NetMonitorTarget
	require.NoError(t, db.WithContext(tenancy.WithTenantID(t.Context(), tenant.ID)).First(&restoredMonitor, tenantMonitor.ID).Error)
	assert.Equal(t, tenant.ID, restoredMonitor.TenantID)
	assert.Equal(t, tenantMonitor.SNMPCommunityEncrypted, restoredMonitor.SNMPCommunityEncrypted)
	assert.Equal(t, tenantMonitor.SNMPAuthEncrypted, restoredMonitor.SNMPAuthEncrypted)
	assert.Equal(t, tenantMonitor.SNMPPrivacyEncrypted, restoredMonitor.SNMPPrivacyEncrypted)
	var restoredMembership domain.TenantMembership
	require.NoError(t, db.Where("tenant_id = ? AND operator_id = ?", tenant.ID, tenantOperator.ID).First(&restoredMembership).Error)
	assert.Equal(t, "admin", restoredMembership.Level)
	assert.Equal(t, common.ENABLED, restoredMembership.Status)
	var platformAdmin domain.SysOpr
	require.NoError(t, h.appCtx.DB().Where("username = ?", h.adminUser).First(&platformAdmin).Error)
	assert.True(t, platformAdmin.PlatformAdmin, "restoring a backup must preserve the active platform administrator")
	refreshSharedAdminToken(t)
}

// TestSystemRestoreRejectsNonBackup ensures uploading a non-backup file (e.g. a
// CSV meant for user import) is rejected with a clear error, mirroring the
// real-world confusion between the restore and import features.
func TestSystemRestoreRejectsNonBackup(t *testing.T) {
	c := newAPIClient(t)
	csv := csvRow("username", "password", "profile_id") + csvRow("x", "y", "1")
	status, body := c.postMultipart(t, "/api/v1/system/restore", "users.csv", []byte(csv))
	require.Equalf(t, http.StatusBadRequest, status, "expected 400, body: %s", string(body))
	assert.Contains(t, string(body), "INVALID_BACKUP")
}

// TestUserImportCSV exercises the real /users/import endpoint with a multipart
// CSV upload against PostgreSQL and verifies the row lands in the database.
func TestUserImportCSV(t *testing.T) {
	c := newAPIClient(t)
	suffix := uniqueSuffix()
	profileID := seedProfile(t, "it-import-profile-"+suffix)

	username := "it-import-" + suffix
	csv := csvRow("username", "password", "profile_id") +
		csvRow(username, "import-Pw-123", fmt.Sprintf("%d", profileID))

	status, body := c.postMultipart(t, "/api/v1/users/import", "users.csv", []byte(csv))
	require.Equalf(t, http.StatusOK, status, "import body: %s", string(body))

	var result struct {
		Total   int `json:"total"`
		Success int `json:"success"`
		Failed  int `json:"failed"`
	}
	unwrapData(t, body, &result)
	assert.Equal(t, 1, result.Total)
	assert.Equalf(t, 1, result.Success, "import should succeed, body: %s", string(body))

	var created domain.RadiusUser
	require.NoError(t, h.appCtx.DB().Where("username = ?", username).First(&created).Error)
	assert.Equal(t, "import-Pw-123", created.Password)
	assert.Equal(t, profileID, created.ProfileId)
}

func containsUserWithPassword(users []domain.RadiusUser, username, password string) bool {
	for _, u := range users {
		if u.Username == username && u.Password == password {
			return true
		}
	}
	return false
}
