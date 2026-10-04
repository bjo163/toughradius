//go:build integration

package integration

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"testing"
	"time"

	"github.com/bjo163/mwx-isp/internal/billing"
	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/pkg/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"layeh.com/radius"
	"layeh.com/radius/rfc2865"
	"layeh.com/radius/rfc2866"
)

// TestISPBillingLifecycleThroughRadius verifies the existing ISP workflow
// through the HTTP API, billing service, PostgreSQL records, and live RADIUS
// Access-Requests. It intentionally shares the serial integration harness.
func TestISPBillingLifecycleThroughRadius(t *testing.T) {
	c := newAPIClient(t)
	suffix := uniqueSuffix()
	profileID := seedProfile(t, "it-isp-profile-"+suffix)

	customerStatus, customerBody := c.post(t, "/api/v1/isp/customers", mustJSON(t, map[string]string{
		"name": "Integration Customer " + suffix,
	}))
	require.Equalf(t, http.StatusCreated, customerStatus, "%s", customerBody)
	var customer domain.Customer
	unwrapData(t, customerBody, &customer)
	require.NotZero(t, customer.ID)
	require.Regexp(t, `^MWX-[0-9]{6}$`, customer.CustomerNo)

	packageStatus, packageBody := c.post(t, "/api/v1/isp/packages", mustJSON(t, map[string]interface{}{
		"name":              "Integration Package " + suffix,
		"price":             int64(125000),
		"radius_profile_id": fmt.Sprint(profileID),
	}))
	require.Equalf(t, http.StatusCreated, packageStatus, "%s", packageBody)
	var pkg domain.InternetPackage
	unwrapData(t, packageBody, &pkg)
	require.NotZero(t, pkg.ID)
	require.Regexp(t, `^PKG-[0-9]{6}$`, pkg.Code)

	username := "it-isp-" + suffix
	const password = "isp-test-Pw-123"
	billingDay := min(time.Now().Day(), 28)
	graceDays := 2
	startDate := time.Date(time.Now().Year(), time.Now().Month(), billingDay, 0, 0, 0, 0, time.Local)
	subStatus, subBody := c.post(t, "/api/v1/isp/subscriptions", mustJSON(t, map[string]interface{}{
		"customer_id": fmt.Sprint(customer.ID),
		"package_id":  fmt.Sprint(pkg.ID),
		"username":    username,
		"password":    password,
		"status":      domain.SubscriptionActive,
		"start_date":  startDate.Format(time.RFC3339),
		"billing_day": billingDay,
		"grace_days":  graceDays,
	}))
	require.Equalf(t, http.StatusCreated, subStatus, "%s", subBody)
	var sub domain.Subscription
	unwrapData(t, subBody, &sub)
	require.NotZero(t, sub.ID)
	require.NotZero(t, sub.RadiusUserID)
	assert.Equal(t, fmt.Sprintf("SUB-%06d", sub.ID), sub.SubscriptionNo)

	var linkedUser domain.RadiusUser
	require.NoError(t, h.appCtx.DB().First(&linkedUser, sub.RadiusUserID).Error)
	assert.Equal(t, "enabled", linkedUser.Status)
	assert.Equal(t, profileID, linkedUser.ProfileId)

	nasIP := uniqueNASIP()
	nasID := "it-isp-nas-" + suffix
	secret := "it-isp-secret-" + suffix
	require.NoError(t, h.appCtx.DB().Create(&domain.NetNas{
		ID: common.UUIDint64(), Identifier: nasID, Ipaddr: nasIP, Secret: secret,
		VendorCode: "0", Status: common.ENABLED,
	}).Error)
	serverAddr := fmt.Sprintf("127.0.0.1:%d", h.cfg.Radiusd.AuthPort)
	acctAddr := fmt.Sprintf("127.0.0.1:%d", h.cfg.Radiusd.AcctPort)
	assert.Equal(t, radius.CodeAccessAccept, exchangeISP(t, serverAddr, secret, username, password, nasID, nasIP).Code)
	h.radiusSvc.ReleaseAuthRateLimit(username)

	// Exercise the production accounting listener with the session the simulated
	// NAS would create after Access-Accept, then close it cleanly before billing.
	sessionID := "it-isp-session-" + suffix
	acctStart := accountingRequestISP(t, rfc2866.AcctStatusType_Value_Start, secret, username, nasID, nasIP, sessionID)
	acctResp, err := exchangeFromNAS(context.Background(), acctStart, acctAddr, nasIP)
	require.NoError(t, err)
	require.Equal(t, radius.CodeAccountingResponse, acctResp.Code)
	online := waitForOnline(t, sessionID)
	require.Equal(t, username, online.Username)
	acctStop := accountingRequestISP(t, rfc2866.AcctStatusType_Value_Stop, secret, username, nasID, nasIP, sessionID)
	acctResp, err = exchangeFromNAS(context.Background(), acctStop, acctAddr, nasIP)
	require.NoError(t, err)
	require.Equal(t, radius.CodeAccountingResponse, acctResp.Code)
	accounting := waitForAccountingStopISP(t, sessionID)
	require.False(t, accounting.AcctStopTime.IsZero())

	// Generate the current cycle invoice twice to prove the scheduler operation
	// is idempotent, then let the exact due/grace boundary drive suspension.
	cycleDate := time.Date(time.Now().Year(), time.Now().Month(), time.Now().Day(), 12, 0, 0, 0, time.Local)
	created, err := billing.GenerateMonthlyInvoices(h.appCtx.DB(), cycleDate, 0)
	require.NoError(t, err)
	// First-start sample subscriptions may also qualify for this billing cycle.
	require.GreaterOrEqual(t, created, 1)
	created, err = billing.GenerateMonthlyInvoices(h.appCtx.DB(), cycleDate.Add(time.Hour), 0)
	require.NoError(t, err)
	assert.Zero(t, created)
	var invoice domain.Invoice
	require.NoError(t, h.appCtx.DB().Where("subscription_id = ? AND period_start = ?", sub.ID, startDate).First(&invoice).Error)
	assert.Equal(t, pkg.Price, invoice.Total)
	assert.Equal(t, invoice.Total, invoice.Balance)
	require.NoError(t, billing.ProcessOverdueInvoices(h.appCtx.DB(), invoice.DueDate.AddDate(0, 0, 1)))
	require.NoError(t, billing.SuspendOverdueSubscriptions(h.appCtx.DB(), invoice.DueDate.AddDate(0, 0, graceDays+1)))

	require.NoError(t, h.appCtx.DB().First(&sub, sub.ID).Error)
	require.NoError(t, h.appCtx.DB().First(&linkedUser, linkedUser.ID).Error)
	assert.Equal(t, domain.SubscriptionSuspended, sub.Status)
	assert.Equal(t, domain.SuspensionBillingOverdue, sub.SuspensionReason)
	assert.Equal(t, "disabled", linkedUser.Status)
	// Successful RADIUS lookups are cached for 10 seconds. Wait for that
	// authorization entry to expire before asserting the suspended account is
	// rejected, so the check covers the persisted status transition.
	require.Eventually(t, func() bool {
		h.radiusSvc.ReleaseAuthRateLimit(username)
		return exchangeISP(t, serverAddr, secret, username, password, nasID, nasIP).Code == radius.CodeAccessReject
	}, 12*time.Second, 100*time.Millisecond, "suspended subscriber should be rejected after the user cache expires")
	h.radiusSvc.ReleaseAuthRateLimit(username)

	// Enable the existing setting through the admin API. Pay through the same
	// endpoint operators use, then verify both persisted state and RADIUS access.
	settingValue := "true"
	var setting domain.SysConfig
	require.NoError(t, h.appCtx.DB().Where("type = ? AND name = ?", "isp", "AutoReactivate").First(&setting).Error)
	settingStatus, settingBody := c.put(t, "/api/v1/system/settings/"+fmt.Sprint(setting.ID), mustJSON(t, map[string]string{
		"value": settingValue,
	}))
	require.Equalf(t, http.StatusOK, settingStatus, "%s", settingBody)

	paymentStatus, paymentBody := c.post(t, "/api/v1/isp/payments", mustJSON(t, map[string]interface{}{
		"invoice_id": fmt.Sprint(invoice.ID),
		"amount":     invoice.Total,
		"method":     "manual",
		"reference":  "it-" + suffix,
	}))
	require.Equalf(t, http.StatusCreated, paymentStatus, "%s", paymentBody)
	var payment domain.Payment
	unwrapData(t, paymentBody, &payment)
	assert.Regexp(t, `^PAY-[0-9]{6}-[0-9]{6}$`, payment.PaymentNo)

	require.NoError(t, h.appCtx.DB().First(&invoice, invoice.ID).Error)
	require.NoError(t, h.appCtx.DB().First(&sub, sub.ID).Error)
	require.NoError(t, h.appCtx.DB().First(&linkedUser, linkedUser.ID).Error)
	assert.Equal(t, domain.InvoicePaid, invoice.Status)
	assert.Zero(t, invoice.Balance)
	assert.Equal(t, domain.SubscriptionActive, sub.Status)
	assert.Empty(t, sub.SuspensionReason)
	assert.Equal(t, "enabled", linkedUser.Status)
	assert.Equal(t, radius.CodeAccessAccept, exchangeISP(t, serverAddr, secret, username, password, nasID, nasIP).Code)
	h.radiusSvc.ReleaseAuthRateLimit(username)
}

func mustJSON(t *testing.T, v interface{}) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	require.NoError(t, err)
	return b
}

func exchangeISP(t *testing.T, serverAddr, secret, username, password, nasID, nasIP string) *radius.Packet {
	t.Helper()
	packet := radius.New(radius.CodeAccessRequest, []byte(secret))
	require.NoError(t, rfc2865.UserName_SetString(packet, username))
	require.NoError(t, rfc2865.UserPassword_SetString(packet, password))
	require.NoError(t, rfc2865.NASIdentifier_SetString(packet, nasID))
	require.NoError(t, rfc2865.NASIPAddress_Set(packet, net.ParseIP(nasIP)))
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := exchangeFromNAS(ctx, packet, serverAddr, nasIP)
	require.NoError(t, err)
	return resp
}

func accountingRequestISP(t *testing.T, status rfc2866.AcctStatusType, secret, username, nasID, nasIP, sessionID string) *radius.Packet {
	t.Helper()
	packet := radius.New(radius.CodeAccountingRequest, []byte(secret))
	require.NoError(t, rfc2866.AcctStatusType_Set(packet, status))
	require.NoError(t, rfc2866.AcctSessionID_SetString(packet, sessionID))
	require.NoError(t, rfc2865.UserName_SetString(packet, username))
	require.NoError(t, rfc2865.NASIdentifier_SetString(packet, nasID))
	require.NoError(t, rfc2865.NASIPAddress_Set(packet, net.ParseIP(nasIP)))
	return packet
}

func waitForAccountingStopISP(t *testing.T, sessionID string) domain.RadiusAccounting {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	var row domain.RadiusAccounting
	for time.Now().Before(deadline) {
		if err := h.appCtx.DB().Where("acct_session_id = ?", sessionID).First(&row).Error; err == nil && !row.AcctStopTime.IsZero() {
			return row
		}
		time.Sleep(100 * time.Millisecond)
	}
	require.FailNowf(t, "accounting stop not persisted", "no completed RadiusAccounting row for acct_session_id=%s", sessionID)
	return row
}
