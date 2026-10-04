package billing

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/talkincode/toughradius/v9/internal/domain"
)

func TestGenerateMonthlyInvoicesForSubscriptionsIsScoped(t *testing.T) {
	db := billingTestDB(t)
	now := time.Date(2026, time.October, 4, 0, 0, 0, 0, time.UTC)
	pkg := domain.InternetPackage{Code: "SAMPLE", Name: "Sample", Price: 1000, RadiusProfileID: 1, BillingCycle: "monthly", Status: "active"}
	require.NoError(t, db.Create(&pkg).Error)
	ids := make([]int64, 0, 2)
	for i := 0; i < 2; i++ {
		customer := domain.Customer{CustomerNo: fmt.Sprintf("SAMPLE-CUST-%d", i+1), Name: "Sample customer", Status: domain.CustomerActive}
		require.NoError(t, db.Create(&customer).Error)
		subscription := domain.Subscription{SubscriptionNo: fmt.Sprintf("SUB-SAMPLE-%d", i+1), CustomerID: customer.ID, PackageID: pkg.ID, Status: domain.SubscriptionActive,
			StartDate: now.AddDate(0, -1, 0), BillingDay: 1, GraceDays: 3}
		require.NoError(t, db.Create(&subscription).Error)
		ids = append(ids, subscription.ID)
	}
	otherCustomer := domain.Customer{CustomerNo: "SAMPLE-CUST-3", Name: "Unselected customer", Status: domain.CustomerActive}
	require.NoError(t, db.Create(&otherCustomer).Error)
	other := domain.Subscription{SubscriptionNo: "SUB-SAMPLE-3", CustomerID: otherCustomer.ID, PackageID: pkg.ID, Status: domain.SubscriptionActive,
		StartDate: now.AddDate(0, -1, 0), BillingDay: 1, GraceDays: 3}
	require.NoError(t, db.Create(&other).Error)

	created, err := GenerateMonthlyInvoicesForSubscriptions(db, now, 10, ids)
	require.NoError(t, err)
	require.Equal(t, 2, created)
	var count int64
	require.NoError(t, db.Model(&domain.Invoice{}).Count(&count).Error)
	require.EqualValues(t, 2, count)
	var invoices []domain.Invoice
	require.NoError(t, db.Order("invoice_no").Find(&invoices).Error)
	require.Equal(t, "INV-202610-000001", invoices[0].InvoiceNo)
	require.Equal(t, "INV-202610-000002", invoices[1].InvoiceNo)
	_, err = GenerateMonthlyInvoicesForSubscriptions(db, now, 10, nil)
	require.Error(t, err)
}
