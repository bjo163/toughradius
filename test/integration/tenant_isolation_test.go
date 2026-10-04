//go:build integration

package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"testing"
	"time"

	"github.com/bjo163/mwx-isp/internal/billing"
	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/internal/radiusd"
	"github.com/bjo163/mwx-isp/internal/tenancy"
	"github.com/bjo163/mwx-isp/pkg/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"layeh.com/radius"
)

func TestPostgresRetentionCleanupScopesEveryTenant(t *testing.T) {
	db := h.appCtx.DB()
	oldDays := h.appCtx.ConfigMgr().Get("radius", "AccountingHistoryDays")
	require.NoError(t, h.appCtx.ConfigMgr().Set("radius", "AccountingHistoryDays", "30"))
	t.Cleanup(func() {
		_ = h.appCtx.ConfigMgr().Set("radius", "AccountingHistoryDays", oldDays)
	})

	tenantIDs := make([]int64, 0, 2)
	for _, suffix := range []string{"a", "b"} {
		tenant := domain.Tenant{Name: "Retention tenant", Slug: fmt.Sprintf("it-retention-%s-%d", suffix, common.UUIDint64()), Kind: "isp", Status: "active"}
		require.NoError(t, db.Create(&tenant).Error)
		tenantIDs = append(tenantIDs, tenant.ID)
		tenantDB := db.WithContext(tenancy.WithTenantID(t.Context(), tenant.ID))
		require.NoError(t, tenantDB.Create(&domain.RadiusOnline{Username: "same-user", AcctSessionId: "same-session", LastUpdate: time.Now().Add(-time.Hour)}).Error)
		require.NoError(t, tenantDB.Create(&domain.RadiusOnline{Username: "recent-user", AcctSessionId: "recent-session", LastUpdate: time.Now()}).Error)
		require.NoError(t, tenantDB.Create(&domain.RadiusAccounting{Username: "same-user", AcctSessionId: "same-session", AcctStopTime: time.Now().AddDate(0, 0, -60)}).Error)
		require.NoError(t, tenantDB.Create(&domain.SysOprLog{OprName: "old-operator", OptTime: time.Now().AddDate(-2, 0, 0)}).Error)
		require.NoError(t, tenantDB.Create(&domain.SysOprLog{OprName: "recent-operator", OptTime: time.Now()}).Error)
	}

	h.appCtx.SchedClearExpireData()
	for _, tenantID := range tenantIDs {
		tenantDB := db.WithContext(tenancy.WithTenantID(t.Context(), tenantID))
		for _, model := range []any{&domain.RadiusOnline{}, &domain.RadiusAccounting{}} {
			var count int64
			require.NoError(t, tenantDB.Model(model).Where("username = ?", "same-user").Count(&count).Error)
			assert.Zero(t, count, "expired RADIUS records should be pruned for tenant %d", tenantID)
		}
		var recentSession, oldLog, recentLog int64
		require.NoError(t, tenantDB.Model(&domain.RadiusOnline{}).Where("username = ?", "recent-user").Count(&recentSession).Error)
		require.NoError(t, tenantDB.Model(&domain.SysOprLog{}).Where("opr_name = ?", "old-operator").Count(&oldLog).Error)
		require.NoError(t, tenantDB.Model(&domain.SysOprLog{}).Where("opr_name = ?", "recent-operator").Count(&recentLog).Error)
		assert.EqualValues(t, 1, recentSession, "live sessions must be preserved for tenant %d", tenantID)
		assert.Zero(t, oldLog, "expired audit rows should be pruned for tenant %d", tenantID)
		assert.EqualValues(t, 1, recentLog, "recent audit rows must be preserved for tenant %d", tenantID)
	}
}

func TestTenantAdminAPIRejectsCrossTenantIDsAndReferences(t *testing.T) {
	db := h.appCtx.DB()
	suffix := uniqueSuffix()
	tenant := domain.Tenant{Name: "Private API tenant", Slug: "it-api-" + suffix, Kind: "rtrw", Status: "active"}
	require.NoError(t, db.Create(&tenant).Error)
	tenantDB := db.WithContext(tenancy.WithTenantID(context.Background(), tenant.ID))
	profile := domain.RadiusProfile{ID: common.UUIDint64(), Name: "Private profile " + suffix, Status: common.ENABLED}
	require.NoError(t, tenantDB.Create(&profile).Error)
	username := "private-user-" + suffix
	user := domain.RadiusUser{ID: common.UUIDint64(), ProfileId: profile.ID, Username: username, Password: "private-secret", Status: common.ENABLED, ExpireTime: time.Now().AddDate(1, 0, 0)}
	require.NoError(t, tenantDB.Create(&user).Error)
	defaultProfile := domain.RadiusProfile{ID: common.UUIDint64(), Name: "Default profile " + suffix, Status: common.ENABLED}
	require.NoError(t, db.Create(&defaultProfile).Error)
	defaultUser := domain.RadiusUser{ID: common.UUIDint64(), ProfileId: defaultProfile.ID, Username: "default-user-" + suffix, Password: "default-secret", Status: common.ENABLED, ExpireTime: time.Now().AddDate(1, 0, 0)}
	require.NoError(t, db.Create(&defaultUser).Error)
	node := domain.NetNode{ID: common.UUIDint64(), Name: "Private node " + suffix}
	require.NoError(t, tenantDB.Create(&node).Error)
	nas := domain.NetNas{ID: common.UUIDint64(), NodeId: node.ID, Name: "Private NAS " + suffix, Identifier: "private-nas-" + suffix, Ipaddr: uniqueNASIP(), Secret: "private-nas-secret", VendorCode: "0", Status: common.ENABLED}
	require.NoError(t, tenantDB.Create(&nas).Error)
	operator := domain.SysOpr{ID: common.UUIDint64(), Username: "private-operator-" + suffix, Password: "hash", Level: "admin", Status: common.ENABLED}
	require.NoError(t, tenantDB.Create(&operator).Error)
	accounting := domain.RadiusAccounting{ID: common.UUIDint64(), Username: username, AcctSessionId: "private-accounting-" + suffix}
	require.NoError(t, tenantDB.Create(&accounting).Error)
	session := domain.RadiusOnline{ID: common.UUIDint64(), Username: username, AcctSessionId: "private-session-" + suffix}
	require.NoError(t, tenantDB.Create(&session).Error)
	customer := domain.Customer{ID: common.UUIDint64(), CustomerNo: "PRIVATE-" + suffix, Name: "Private Customer", Status: domain.CustomerActive}
	require.NoError(t, tenantDB.Create(&customer).Error)
	pkg := domain.InternetPackage{ID: common.UUIDint64(), Code: "PRIVATE-" + suffix, Name: "Private Package", Price: 100000, RadiusProfileID: profile.ID, BillingCycle: "monthly", Status: "active"}
	require.NoError(t, tenantDB.Create(&pkg).Error)

	client := newAPIClient(t) // authenticates into the default tenant
	status, body := client.get(t, fmt.Sprintf("/api/v1/users/%d", user.ID))
	require.Equalf(t, http.StatusNotFound, status, "cross-tenant user detail leaked: %s", body)
	for _, path := range []string{
		fmt.Sprintf("/api/v1/radius-profiles/%d", profile.ID),
		fmt.Sprintf("/api/v1/network/nodes/%d", node.ID),
		fmt.Sprintf("/api/v1/network/nas/%d", nas.ID),
		fmt.Sprintf("/api/v1/system/operators/%d", operator.ID),
		fmt.Sprintf("/api/v1/accounting/%d", accounting.ID),
		fmt.Sprintf("/api/v1/sessions/%d", session.ID),
		fmt.Sprintf("/api/v1/isp/customers/%d", customer.ID),
		fmt.Sprintf("/api/v1/isp/packages/%d", pkg.ID),
	} {
		status, body = client.get(t, path)
		require.Equalf(t, http.StatusNotFound, status, "cross-tenant resource %s must be hidden: %s", path, body)
	}
	status, body = client.get(t, "/api/v1/users")
	require.Equalf(t, http.StatusOK, status, "list users response: %s", body)
	require.NotContains(t, string(body), username, "cross-tenant user must not appear in tenant listing")

	// Every mutation must perform its lookup through the caller's tenant scope.
	// Use valid payloads so these requests exercise authorization/isolation rather
	// than failing request validation first.
	mutationCases := []struct {
		name   string
		path   string
		update []byte
	}{
		{"user", fmt.Sprintf("/api/v1/users/%d", user.ID), []byte(`{"realname":"Cross tenant overwrite"}`)},
		{"profile", fmt.Sprintf("/api/v1/radius-profiles/%d", profile.ID), []byte(`{"name":"Cross tenant overwrite"}`)},
		{"node", fmt.Sprintf("/api/v1/network/nodes/%d", node.ID), []byte(`{"name":"Cross tenant overwrite"}`)},
		{"nas", fmt.Sprintf("/api/v1/network/nas/%d", nas.ID), []byte(`{"name":"Cross tenant overwrite"}`)},
		{"operator", fmt.Sprintf("/api/v1/system/operators/%d", operator.ID), []byte(`{"realname":"Cross tenant overwrite"}`)},
		{"customer", fmt.Sprintf("/api/v1/isp/customers/%d", customer.ID), []byte(`{"name":"Cross tenant overwrite"}`)},
		{"package", fmt.Sprintf("/api/v1/isp/packages/%d", pkg.ID), []byte(fmt.Sprintf(`{"name":"Cross tenant overwrite","price":100000,"radius_profile_id":"%d"}`, defaultProfile.ID))},
	}
	for _, tc := range mutationCases {
		t.Run(tc.name+"_update", func(t *testing.T) {
			status, body := client.put(t, tc.path, tc.update)
			require.Equalf(t, http.StatusNotFound, status, "cross-tenant update must be hidden: %s", body)
		})
		t.Run(tc.name+"_delete", func(t *testing.T) {
			status, body := client.delete(t, tc.path)
			require.Equalf(t, http.StatusNotFound, status, "cross-tenant delete must be hidden: %s", body)
		})
	}

	var persistedUser domain.RadiusUser
	require.NoError(t, tenantDB.First(&persistedUser, user.ID).Error)
	assert.Equal(t, username, persistedUser.Username)
	var persistedProfile domain.RadiusProfile
	require.NoError(t, tenantDB.First(&persistedProfile, profile.ID).Error)
	assert.Equal(t, profile.Name, persistedProfile.Name)
	var persistedNode domain.NetNode
	require.NoError(t, tenantDB.First(&persistedNode, node.ID).Error)
	assert.Equal(t, node.Name, persistedNode.Name)
	var persistedNAS domain.NetNas
	require.NoError(t, tenantDB.First(&persistedNAS, nas.ID).Error)
	assert.Equal(t, nas.Name, persistedNAS.Name)
	var persistedOperator domain.SysOpr
	require.NoError(t, tenantDB.First(&persistedOperator, operator.ID).Error)
	assert.Equal(t, operator.Username, persistedOperator.Username)
	var persistedCustomer domain.Customer
	require.NoError(t, tenantDB.First(&persistedCustomer, customer.ID).Error)
	assert.Equal(t, customer.Name, persistedCustomer.Name)
	var persistedPackage domain.InternetPackage
	require.NoError(t, tenantDB.First(&persistedPackage, pkg.ID).Error)
	assert.Equal(t, pkg.Name, persistedPackage.Name)

	request, err := json.Marshal(map[string]string{
		"customer_id": fmt.Sprint(customer.ID), "package_id": fmt.Sprint(pkg.ID),
		"username": "cross-tenant-attempt-" + suffix, "password": "not-a-real-secret",
	})
	require.NoError(t, err)
	status, body = client.post(t, "/api/v1/isp/subscriptions", request)
	require.Equalf(t, http.StatusBadRequest, status, "cross-tenant customer/package reference must fail: %s", body)
	request, err = json.Marshal(map[string]string{"profile_id": fmt.Sprint(profile.ID)})
	require.NoError(t, err)
	status, body = client.put(t, fmt.Sprintf("/api/v1/users/%d", defaultUser.ID), request)
	require.Equalf(t, http.StatusBadRequest, status, "cross-tenant profile reassignment must fail: %s", body)
	var unchangedUser domain.RadiusUser
	require.NoError(t, db.WithContext(tenancy.WithTenantID(t.Context(), domain.DefaultTenantID)).First(&unchangedUser, defaultUser.ID).Error)
	require.Equal(t, defaultProfile.ID, unchangedUser.ProfileId, "a failed cross-tenant reassignment must leave the subscriber unchanged")

	var created []domain.RadiusUser
	require.NoError(t, db.Where("username = ?", "cross-tenant-attempt-"+suffix).Find(&created).Error)
	require.Empty(t, created, "cross-tenant references must not create a subscriber in the caller tenant")
}

func TestPostgresPlatformTenantMembershipGrantAndRevocation(t *testing.T) {
	db := h.appCtx.DB()
	admin := newAPIClient(t)
	tenant := domain.Tenant{Name: "Membership acceptance", Slug: "it-membership-" + uniqueSuffix(), Kind: "rtrw", Status: "active"}
	require.NoError(t, db.Create(&tenant).Error)
	path := "/api/v1/platform/tenants/" + fmt.Sprint(tenant.ID) + "/operators"
	payload, err := json.Marshal(map[string]string{
		"username": "member-" + uniqueSuffix(), "password": "Strong-membership-2026", "level": "admin",
	})
	require.NoError(t, err)
	status, body := admin.post(t, path, payload)
	require.Equalf(t, http.StatusCreated, status, "membership grant response: %s", body)
	var operator domain.SysOpr
	unwrapData(t, body, &operator)
	require.NotZero(t, operator.ID)

	var membership domain.TenantMembership
	require.NoError(t, db.Where("tenant_id = ? AND operator_id = ?", tenant.ID, operator.ID).First(&membership).Error)
	require.Equal(t, "admin", membership.Level)
	require.Equal(t, common.ENABLED, membership.Status)

	loginBody, err := json.Marshal(map[string]string{
		"tenant_slug": tenant.Slug, "username": operator.Username, "password": "Strong-membership-2026",
	})
	require.NoError(t, err)
	loginResponse, err := http.Post(h.webBaseURL+"/api/v1/auth/login", "application/json", bytes.NewReader(loginBody))
	require.NoError(t, err)
	loginData, err := io.ReadAll(loginResponse.Body)
	_ = loginResponse.Body.Close()
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, loginResponse.StatusCode, "tenant login: %s", loginData)
	var loginEnvelope struct {
		Data struct {
			Token string `json:"token"`
			User  struct {
				Level string `json:"level"`
			} `json:"user"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(loginData, &loginEnvelope))
	require.NotEmpty(t, loginEnvelope.Data.Token)
	require.Equal(t, "admin", loginEnvelope.Data.User.Level, "role must come from this tenant membership")
	tenantClient := &apiClient{base: h.webBaseURL, http: &http.Client{}, token: loginEnvelope.Data.Token}

	status, body = admin.delete(t, path+"/"+fmt.Sprint(operator.ID))
	require.Equalf(t, http.StatusOK, status, "membership revocation response: %s", body)
	require.NoError(t, db.Where("tenant_id = ? AND operator_id = ?", tenant.ID, operator.ID).First(&membership).Error)
	require.Equal(t, common.DISABLED, membership.Status)
	status, body = tenantClient.get(t, "/api/v1/users")
	require.Equalf(t, http.StatusUnauthorized, status, "revoked active token must stop working: %s", body)
	status, body = admin.post(t, path+"/"+fmt.Sprint(operator.ID)+"/activate", nil)
	require.Equalf(t, http.StatusOK, status, "membership reactivation response: %s", body)
	status, body = tenantClient.get(t, "/api/v1/users")
	require.Equalf(t, http.StatusUnauthorized, status, "reactivation must not revive a previously revoked token: %s", body)
	newToken, err := loginTenantToken(h.webBaseURL, tenant.Slug, operator.Username, "Strong-membership-2026")
	require.NoError(t, err)
	status, body = (&apiClient{base: h.webBaseURL, http: &http.Client{}, token: newToken}).get(t, "/api/v1/users")
	require.Equalf(t, http.StatusOK, status, "fresh login after membership reactivation: %s", body)
}

func loginTenantToken(base, tenantSlug, username, password string) (string, error) {
	body, err := json.Marshal(map[string]string{"tenant_slug": tenantSlug, "username": username, "password": password})
	if err != nil {
		return "", err
	}
	resp, err := http.Post(base+"/api/v1/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("login status %d: %s", resp.StatusCode, string(data))
	}
	var envelope struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return "", err
	}
	if envelope.Data.Token == "" {
		return "", fmt.Errorf("login returned an empty token")
	}
	return envelope.Data.Token, nil
}

func TestPostgresTenantBillingAndSequencesAreIsolated(t *testing.T) {
	db := h.appCtx.DB()
	now := time.Date(2026, time.October, 1, 0, 0, 0, 0, time.UTC)
	tenantIDs := make([]int64, 0, 2)
	for _, slug := range []string{
		fmt.Sprintf("it-billing-a-%d", common.UUIDint64()),
		fmt.Sprintf("it-billing-b-%d", common.UUIDint64()),
	} {
		tenant := domain.Tenant{Name: "Billing Isolation", Slug: slug, Kind: "isp", Status: "active"}
		require.NoError(t, db.Create(&tenant).Error)
		tenantIDs = append(tenantIDs, tenant.ID)
	}

	// GORM Save falls back to an ON CONFLICT upsert after a tenant-scoped
	// update cannot see a row owned by another organization. PostgreSQL must
	// preserve that ownership on the conflict branch too.
	sharedProfile := domain.RadiusProfile{ID: common.UUIDint64(), Name: "tenant A protected profile", Status: common.ENABLED}
	tenantA := db.WithContext(tenancy.WithTenantID(context.Background(), tenantIDs[0]))
	tenantB := db.WithContext(tenancy.WithTenantID(context.Background(), tenantIDs[1]))
	require.NoError(t, tenantA.Create(&sharedProfile).Error)
	require.NoError(t, tenantB.Save(&domain.RadiusProfile{ID: sharedProfile.ID, Name: "tenant B overwrite attempt", Status: common.ENABLED}).Error)
	var persistedProfile domain.RadiusProfile
	require.NoError(t, db.First(&persistedProfile, sharedProfile.ID).Error)
	require.Equal(t, tenantIDs[0], persistedProfile.TenantID)
	require.Equal(t, sharedProfile.Name, persistedProfile.Name, "a foreign primary-key collision must not overwrite tenant A")

	for index, tenantID := range tenantIDs {
		tenantDB := db.WithContext(tenancy.WithTenantID(context.Background(), tenantID))
		operator := domain.SysOpr{ID: common.UUIDint64(), TenantID: tenantID, Username: "tenant-admin", Level: "super", Status: "enabled"}
		require.NoError(t, db.Create(&operator).Error,
			"the same operator username must be valid for a different tenant")
		require.Error(t, db.Create(&domain.SysOpr{ID: common.UUIDint64(), TenantID: tenantID, Username: "tenant-admin", Level: "operator", Status: "enabled"}).Error,
			"the operator username must remain unique inside one tenant")
		customer := domain.Customer{ID: common.UUIDint64(), CustomerNo: "SAME-001", Name: fmt.Sprintf("Tenant %d customer", index), Status: domain.CustomerActive}
		require.NoError(t, tenantDB.Create(&customer).Error)
		pkg := domain.InternetPackage{ID: common.UUIDint64(), Code: "SAME-PKG", Name: "Home", Price: 150000, RadiusProfileID: 1, BillingCycle: "monthly", Status: "active"}
		require.NoError(t, tenantDB.Create(&pkg).Error)
		sub := domain.Subscription{ID: common.UUIDint64(), SubscriptionNo: "SAME-SUB", CustomerID: customer.ID, PackageID: pkg.ID,
			Status: domain.SubscriptionActive, StartDate: now.AddDate(0, -1, 0), BillingDay: 1, GraceDays: 3}
		require.NoError(t, tenantDB.Create(&sub).Error)
	}

	for _, tenantID := range tenantIDs {
		tenantDB := db.WithContext(tenancy.WithTenantID(context.Background(), tenantID))
		created, err := billing.GenerateMonthlyInvoices(tenantDB, now, 10)
		require.NoError(t, err)
		require.Equal(t, 1, created)
		var invoices []domain.Invoice
		require.NoError(t, tenantDB.Find(&invoices).Error)
		require.Len(t, invoices, 1)
		require.Equal(t, "INV-202610-000001", invoices[0].InvoiceNo,
			"document numbering starts independently for each tenant")
	}

	for _, tenantID := range tenantIDs {
		tenantDB := db.WithContext(tenancy.WithTenantID(context.Background(), tenantID))
		var customers []domain.Customer
		require.NoError(t, tenantDB.Where("customer_no = ?", "SAME-001").Find(&customers).Error)
		require.Len(t, customers, 1)
		var allInvoices int64
		require.NoError(t, tenantDB.Model(&domain.Invoice{}).Count(&allInvoices).Error)
		require.EqualValues(t, 1, allInvoices)
	}
}

func TestPostgresTenantCoAResolvesNASAndSessionsWithinTenant(t *testing.T) {
	db := h.appCtx.DB()
	tenantIDs := make([]int64, 0, 2)
	for _, slug := range []string{
		fmt.Sprintf("it-coa-tenant-a-%d", common.UUIDint64()),
		fmt.Sprintf("it-coa-tenant-b-%d", common.UUIDint64()),
	} {
		tenant := domain.Tenant{Name: "CoA Isolation", Slug: slug, Kind: "isp", Status: "active"}
		require.NoError(t, db.Create(&tenant).Error)
		tenantIDs = append(tenantIDs, tenant.ID)
	}

	const acctSessionID = "shared-acct-session"
	nasA := newITFakeNAS(t, "tenant-a-secret", radius.CodeDisconnectACK, 0)
	nasB := newITFakeNAS(t, "tenant-b-secret", radius.CodeDisconnectACK, 0)
	coa := radiusd.NewCoAService(h.radiusSvc)
	firstTenantNASID := ""
	for index, tenantID := range tenantIDs {
		tenantDB := db.WithContext(tenancy.WithTenantID(context.Background(), tenantID))
		fakeNAS := nasA
		secret := "tenant-a-secret"
		port := nasA.port(t)
		if index == 1 {
			fakeNAS = nasB
			secret = "tenant-b-secret"
			port = nasB.port(t)
		}
		nas := domain.NetNas{
			ID: common.UUIDint64(), Name: fmt.Sprintf("CoA NAS %d", index),
			Identifier: fmt.Sprintf("coa-nas-%d", index), Ipaddr: "127.0.0.1",
			Secret: secret, CoaPort: port, Status: common.ENABLED,
		}
		require.NoError(t, tenantDB.Create(&nas).Error)
		if index == 0 {
			firstTenantNASID = nas.Identifier
		}
		session := domain.RadiusOnline{
			ID: common.UUIDint64(), Username: fmt.Sprintf("tenant-user-%d", index),
			NasId: nas.Identifier, NasAddr: nas.Ipaddr, AcctSessionId: acctSessionID,
			LastUpdate: time.Now(),
		}
		require.NoError(t, tenantDB.Create(&session).Error)

		result, err := coa.DisconnectSession(tenancy.WithTenantID(context.Background(), tenantID), acctSessionID)
		require.NoError(t, err)
		require.True(t, result.Success)
		require.Equal(t, fmt.Sprintf("127.0.0.1:%d", port), result.Target)
		require.Equal(t, 1, fakeNAS.requestCount())
		require.Equal(t, 0, fakeNAS.badAuthCount())
	}

	ctxA := tenancy.WithTenantID(context.Background(), tenantIDs[0])
	require.NoError(t, h.radiusSvc.SessionRepo.BatchDeleteByNas(ctxA, "127.0.0.1", firstTenantNASID))
	for index, tenantID := range tenantIDs {
		tenantDB := db.WithContext(tenancy.WithTenantID(context.Background(), tenantID))
		var remaining int64
		require.NoError(t, tenantDB.Model(&domain.RadiusOnline{}).Where("acct_session_id = ?", acctSessionID).Count(&remaining).Error)
		if index == 0 {
			require.Zero(t, remaining, "Accounting-On/Off cleanup must remove only sessions owned by the source tenant NAS")
		} else {
			require.EqualValues(t, 1, remaining, "NAS state cleanup must not remove another tenant's session")
		}
	}
}
