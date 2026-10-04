package adminapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/bjo163/mwx-isp/internal/domain"
)

func TestPackageCodeIsGeneratedAndStableOnEdit(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(&domain.InternetPackage{}, &domain.Subscription{}, &domain.Invoice{}))
	profile := domain.RadiusProfile{Name: "Base profile", Status: "enabled"}
	require.NoError(t, db.Create(&profile).Error)

	create := func(name string) domain.InternetPackage {
		body := fmt.Sprintf(`{"name":%q,"price":100000,"radius_profile_id":"%d"}`, name, profile.ID)
		req := httptest.NewRequest(http.MethodPost, "/isp/packages", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		c := CreateTestContext(e, db, req, rec, appCtx)
		require.NoError(t, createPackage(c))
		require.Equal(t, http.StatusCreated, rec.Code)
		var response struct {
			Data domain.InternetPackage `json:"data"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
		return response.Data
	}

	first := create("Home 100")
	second := create("Home 200")
	require.Equal(t, "PKG-000001", first.Code)
	require.Equal(t, "PKG-000002", second.Code)

	body := fmt.Sprintf(`{"name":"Updated package","price":120000,"radius_profile_id":"%d"}`, profile.ID)
	req := httptest.NewRequest(http.MethodPut, "/isp/packages/1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := CreateTestContext(e, db, req, rec, appCtx)
	c.SetParamNames("id")
	c.SetParamValues("1")
	require.NoError(t, updatePackage(c))

	var updated domain.InternetPackage
	require.NoError(t, db.First(&updated, first.ID).Error)
	require.Equal(t, "PKG-000001", updated.Code)
	require.Equal(t, "Updated package", updated.Name)
}

func TestLookupCustomerPortal(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(&domain.Customer{}, &domain.InternetPackage{}, &domain.Subscription{}, &domain.Invoice{}))

	cust := domain.Customer{
		CustomerNo: "CUST-0001",
		Name:       "Budi Santoso",
		Phone:      "08123456789",
		IdentityNo: "3201010101010001",
		Status:     "active",
	}
	require.NoError(t, db.Create(&cust).Error)

	pkg := domain.InternetPackage{
		Code:  "PKG-001",
		Name:  "50 Mbps Home",
		Price: 250000,
	}
	require.NoError(t, db.Create(&pkg).Error)

	sub := domain.Subscription{
		CustomerID: cust.ID,
		PackageID:  pkg.ID,
		Status:     domain.SubscriptionActive,
	}
	require.NoError(t, db.Create(&sub).Error)

	inv := domain.Invoice{
		CustomerID:     cust.ID,
		SubscriptionID: sub.ID,
		InvoiceNo:      "INV-2026-0001",
		Total:          250000,
		Balance:        250000,
		Status:         domain.InvoiceIssued,
	}
	require.NoError(t, db.Create(&inv).Error)

	// 1. Query by customer_no
	req := httptest.NewRequest(http.MethodGet, "/portal/lookup?q=CUST-0001", nil)
	rec := httptest.NewRecorder()
	c := CreateTestContext(e, db, req, rec, appCtx)
	require.NoError(t, lookupCustomerPortal(c))
	require.Equal(t, http.StatusOK, rec.Code)

	var resp struct {
		Data struct {
			CustomerNo         string `json:"customer_no"`
			Name               string `json:"name"`
			Status             string `json:"status"`
			PackageName        string `json:"package_name"`
			PackagePrice       int64  `json:"package_price"`
			SubscriptionStatus string `json:"subscription_status"`
			Outstanding        int64  `json:"outstanding"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "CUST-0001", resp.Data.CustomerNo)
	require.Equal(t, "Budi Santoso", resp.Data.Name)
	require.Equal(t, "50 Mbps Home", resp.Data.PackageName)
	require.Equal(t, int64(250000), resp.Data.PackagePrice)
	require.Equal(t, int64(250000), resp.Data.Outstanding)

	// 2. Query by phone
	req2 := httptest.NewRequest(http.MethodGet, "/portal/lookup?q=08123456789", nil)
	rec2 := httptest.NewRecorder()
	c2 := CreateTestContext(e, db, req2, rec2, appCtx)
	require.NoError(t, lookupCustomerPortal(c2))
	require.Equal(t, http.StatusOK, rec2.Code)

	// 3. Query non-existent
	req3 := httptest.NewRequest(http.MethodGet, "/portal/lookup?q=UNKNOWN", nil)
	rec3 := httptest.NewRecorder()
	c3 := CreateTestContext(e, db, req3, rec3, appCtx)
	require.NoError(t, lookupCustomerPortal(c3))
	require.Equal(t, http.StatusNotFound, rec3.Code)
}

func TestSubscriptionDisconnectAction(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(&domain.Customer{}, &domain.Subscription{}, &domain.RadiusUser{}, &domain.RadiusOnline{}, &domain.NetNas{}))

	user := domain.RadiusUser{
		Username: "subuser01",
		Status:   "enabled",
	}
	require.NoError(t, db.Create(&user).Error)

	sub := domain.Subscription{
		CustomerID:   1,
		RadiusUserID: user.ID,
		Status:       domain.SubscriptionActive,
	}
	require.NoError(t, db.Create(&sub).Error)

	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/isp/subscriptions/%d/disconnect", sub.ID), nil)
	rec := httptest.NewRecorder()
	c := CreateTestContext(e, db, req, rec, appCtx)
	c.SetParamNames("id", "action")
	c.SetParamValues(fmt.Sprintf("%d", sub.ID), "disconnect")

	require.NoError(t, subscriptionAction(c))
	require.Equal(t, http.StatusOK, rec.Code)
	var resp struct {
		Data struct {
			DisconnectedSessions int `json:"disconnected_sessions"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, 0, resp.Data.DisconnectedSessions)
}

func TestSendInvoiceWhatsAppValidation(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(&domain.Customer{}, &domain.Invoice{}))

	// 1. Non-existent invoice
	req := httptest.NewRequest(http.MethodPost, "/isp/invoices/999/send-whatsapp", nil)
	rec := httptest.NewRecorder()
	c := CreateTestContext(e, db, req, rec, appCtx)
	c.SetParamNames("id")
	c.SetParamValues("999")
	require.NoError(t, sendInvoiceWhatsApp(c))
	require.Equal(t, http.StatusNotFound, rec.Code)

	// 2. Invoice with customer that has no phone
	cust := domain.Customer{Name: "No Phone Customer", Phone: ""}
	require.NoError(t, db.Create(&cust).Error)
	inv := domain.Invoice{CustomerID: cust.ID, InvoiceNo: "INV-001", Total: 100000}
	require.NoError(t, db.Create(&inv).Error)

	req2 := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/isp/invoices/%d/send-whatsapp", inv.ID), nil)
	rec2 := httptest.NewRecorder()
	c2 := CreateTestContext(e, db, req2, rec2, appCtx)
	c2.SetParamNames("id")
	c2.SetParamValues(fmt.Sprintf("%d", inv.ID))
	require.NoError(t, sendInvoiceWhatsApp(c2))
	require.Equal(t, http.StatusBadRequest, rec2.Code)
}

func TestHandlePaymentWebhook(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(&domain.Customer{}, &domain.InternetPackage{}, &domain.Subscription{}, &domain.Invoice{}, &domain.Payment{}, &domain.RadiusUser{}, &domain.BillingEvent{}, &domain.DocumentSequence{}))

	cust := domain.Customer{Name: "Webhook Customer", Phone: "08123456789"}
	require.NoError(t, db.Create(&cust).Error)

	rUser := domain.RadiusUser{Username: "webhookuser", Status: "disabled"}
	require.NoError(t, db.Create(&rUser).Error)

	sub := domain.Subscription{
		CustomerID:       cust.ID,
		RadiusUserID:     rUser.ID,
		Status:           domain.SubscriptionSuspended,
		SuspensionReason: domain.SuspensionBillingOverdue,
	}
	require.NoError(t, db.Create(&sub).Error)

	inv := domain.Invoice{
		CustomerID:     cust.ID,
		SubscriptionID: sub.ID,
		InvoiceNo:      "INV-202610-009999",
		Total:          350000,
		Balance:        350000,
		Status:         domain.InvoiceOverdue,
	}
	require.NoError(t, db.Create(&inv).Error)

	body := `{"invoice_no":"INV-202610-009999","amount":350000,"method":"bank_transfer","reference":"TRIPAY-987654","status":"paid"}`
	req := httptest.NewRequest(http.MethodPost, "/portal/payments/webhook", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := CreateTestContext(e, db, req, rec, appCtx)

	require.NoError(t, handlePaymentWebhook(c))
	require.Equal(t, http.StatusOK, rec.Code)

	var resp struct {
		Data struct {
			Success   bool   `json:"success"`
			InvoiceNo string `json:"invoice_no"`
			PaymentNo string `json:"payment_no"`
			Status    string `json:"status"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.True(t, resp.Data.Success)
	require.Equal(t, "INV-202610-009999", resp.Data.InvoiceNo)
	require.Equal(t, "paid", resp.Data.Status)

	var checkInv domain.Invoice
	require.NoError(t, db.First(&checkInv, inv.ID).Error)
	require.Equal(t, domain.InvoicePaid, checkInv.Status)
	require.Equal(t, int64(0), checkInv.Balance)
	require.Equal(t, int64(350000), checkInv.PaidAmount)

	var checkSub domain.Subscription
	require.NoError(t, db.First(&checkSub, sub.ID).Error)
	require.Equal(t, domain.SubscriptionActive, checkSub.Status)
	require.Equal(t, "", checkSub.SuspensionReason)

	var checkUser domain.RadiusUser
	require.NoError(t, db.First(&checkUser, rUser.ID).Error)
	require.Equal(t, "enabled", checkUser.Status)

	req2 := httptest.NewRequest(http.MethodPost, "/portal/payments/webhook", strings.NewReader(body))
	req2.Header.Set("Content-Type", "application/json")
	rec2 := httptest.NewRecorder()
	c2 := CreateTestContext(e, db, req2, rec2, appCtx)
	require.NoError(t, handlePaymentWebhook(c2))
	require.Equal(t, http.StatusOK, rec2.Code)
}

func TestFUPApplyAndReset(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(&domain.Customer{}, &domain.InternetPackage{}, &domain.Subscription{}, &domain.RadiusProfile{}, &domain.RadiusUser{}, &domain.BillingEvent{}))

	profile := domain.RadiusProfile{Name: "50M Profile", UpRate: 50000, DownRate: 50000, Status: "enabled"}
	require.NoError(t, db.Create(&profile).Error)

	pkg := domain.InternetPackage{
		Name:            "Giga 50",
		Price:           300000,
		RadiusProfileID: profile.ID,
		FupLimitGB:      500,
		FupRateDown:     2048,
		FupRateUp:       1024,
		Status:          "active",
	}
	require.NoError(t, db.Create(&pkg).Error)

	cust := domain.Customer{Name: "Eko Pratama", CustomerNo: "CUST-002", Status: "active"}
	require.NoError(t, db.Create(&cust).Error)

	rUser := domain.RadiusUser{Username: "eko50", UpRate: 50000, DownRate: 50000, Status: "enabled"}
	require.NoError(t, db.Create(&rUser).Error)

	sub := domain.Subscription{
		CustomerID:   cust.ID,
		PackageID:    pkg.ID,
		RadiusUserID: rUser.ID,
		Status:       domain.SubscriptionActive,
	}
	require.NoError(t, db.Create(&sub).Error)

	// 1. Apply FUP
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/isp/subscriptions/%d/apply-fup", sub.ID), nil)
	rec := httptest.NewRecorder()
	c := CreateTestContext(e, db, req, rec, appCtx)
	c.SetParamNames("id")
	c.SetParamValues(fmt.Sprintf("%d", sub.ID))

	require.NoError(t, applySubscriptionFUP(c))
	require.Equal(t, http.StatusOK, rec.Code)

	var checkSub domain.Subscription
	require.NoError(t, db.First(&checkSub, sub.ID).Error)
	require.True(t, checkSub.FupTriggered)

	var checkUser domain.RadiusUser
	require.NoError(t, db.First(&checkUser, rUser.ID).Error)
	require.Equal(t, 1024, checkUser.UpRate)
	require.Equal(t, 2048, checkUser.DownRate)

	// 2. Reset FUP
	req2 := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/isp/subscriptions/%d/reset-fup", sub.ID), nil)
	rec2 := httptest.NewRecorder()
	c2 := CreateTestContext(e, db, req2, rec2, appCtx)
	c2.SetParamNames("id")
	c2.SetParamValues(fmt.Sprintf("%d", sub.ID))

	require.NoError(t, resetSubscriptionFUP(c2))
	require.Equal(t, http.StatusOK, rec2.Code)

	require.NoError(t, db.First(&checkSub, sub.ID).Error)
	require.False(t, checkSub.FupTriggered)

	require.NoError(t, db.First(&checkUser, rUser.ID).Error)
	require.Equal(t, 50000, checkUser.UpRate)
	require.Equal(t, 50000, checkUser.DownRate)
}

func TestInvoicePaymentChannelAndSimulatePay(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(&domain.Customer{}, &domain.InternetPackage{}, &domain.Subscription{}, &domain.Invoice{}, &domain.Payment{}, &domain.BillingEvent{}, &domain.DocumentSequence{}))

	cust := domain.Customer{Name: "Dewi Lestari", CustomerNo: "CUST-0099", Status: "active"}
	require.NoError(t, db.Create(&cust).Error)

	inv := domain.Invoice{
		CustomerID: cust.ID,
		InvoiceNo:  "INV-202610-008888",
		Total:      250000,
		Balance:    250000,
		Status:     domain.InvoiceIssued,
	}
	require.NoError(t, db.Create(&inv).Error)

	// 1. Get Payment Channel
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/portal/invoices/%d/payment-channel", inv.ID), nil)
	rec := httptest.NewRecorder()
	c := CreateTestContext(e, db, req, rec, appCtx)
	c.SetParamNames("id")
	c.SetParamValues(fmt.Sprintf("%d", inv.ID))

	require.NoError(t, getInvoicePaymentChannel(c))
	require.Equal(t, http.StatusOK, rec.Code)

	var channelResp struct {
		Data struct {
			InvoiceNo   string          `json:"invoice_no"`
			Amount      int64           `json:"amount"`
			QRISPayload string          `json:"qris_payload"`
			VAChannels  []vaChannelInfo `json:"va_channels"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &channelResp))
	require.Equal(t, "INV-202610-008888", channelResp.Data.InvoiceNo)
	require.NotEmpty(t, channelResp.Data.QRISPayload)
	require.Len(t, channelResp.Data.VAChannels, 4)

	// 2. Simulate Pay
	body := `{"method":"qris_instant","reference":"QRIS-TEST-1234"}`
	req2 := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/portal/invoices/%d/simulate-pay", inv.ID), strings.NewReader(body))
	req2.Header.Set("Content-Type", "application/json")
	rec2 := httptest.NewRecorder()
	c2 := CreateTestContext(e, db, req2, rec2, appCtx)
	c2.SetParamNames("id")
	c2.SetParamValues(fmt.Sprintf("%d", inv.ID))

	require.NoError(t, simulateInvoicePayment(c2))
	require.Equal(t, http.StatusOK, rec2.Code)

	var checkInv domain.Invoice
	require.NoError(t, db.First(&checkInv, inv.ID).Error)
	require.Equal(t, domain.InvoicePaid, checkInv.Status)
	require.Equal(t, int64(0), checkInv.Balance)
	require.Equal(t, int64(250000), checkInv.PaidAmount)
}


