//go:build integration

package integration

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/bjo163/mwx-isp/internal/billing"
	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/internal/radiusd"
	"github.com/bjo163/mwx-isp/internal/tenancy"
	"github.com/bjo163/mwx-isp/pkg/common"
	"github.com/stretchr/testify/require"
	"layeh.com/radius"
)

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
	customer := domain.Customer{ID: common.UUIDint64(), CustomerNo: "PRIVATE-" + suffix, Name: "Private Customer", Status: domain.CustomerActive}
	require.NoError(t, tenantDB.Create(&customer).Error)
	pkg := domain.InternetPackage{ID: common.UUIDint64(), Code: "PRIVATE-" + suffix, Name: "Private Package", Price: 100000, RadiusProfileID: profile.ID, BillingCycle: "monthly", Status: "active"}
	require.NoError(t, tenantDB.Create(&pkg).Error)

	client := newAPIClient(t) // authenticates into the default tenant
	status, body := client.get(t, fmt.Sprintf("/api/v1/users/%d", user.ID))
	require.Equalf(t, http.StatusNotFound, status, "cross-tenant user detail leaked: %s", body)
	status, body = client.get(t, "/api/v1/users")
	require.Equalf(t, http.StatusOK, status, "list users response: %s", body)
	require.NotContains(t, string(body), username, "cross-tenant user must not appear in tenant listing")

	request, err := json.Marshal(map[string]string{
		"customer_id": fmt.Sprint(customer.ID), "package_id": fmt.Sprint(pkg.ID),
		"username": "cross-tenant-attempt-" + suffix, "password": "not-a-real-secret",
	})
	require.NoError(t, err)
	status, body = client.post(t, "/api/v1/isp/subscriptions", request)
	require.Equalf(t, http.StatusBadRequest, status, "cross-tenant customer/package reference must fail: %s", body)

	var created []domain.RadiusUser
	require.NoError(t, db.Where("username = ?", "cross-tenant-attempt-"+suffix).Find(&created).Error)
	require.Empty(t, created, "cross-tenant references must not create a subscriber in the caller tenant")
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
