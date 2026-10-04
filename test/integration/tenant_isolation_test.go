//go:build integration

package integration

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/bjo163/mwx-isp/internal/billing"
	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/internal/tenancy"
	"github.com/bjo163/mwx-isp/pkg/common"
	"github.com/stretchr/testify/require"
)

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
