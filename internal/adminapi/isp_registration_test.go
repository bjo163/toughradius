package adminapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestPublicRegistrationRequiresActivePackageAndPersistsCustomerAndWorkOrderAtomically(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(&domain.Customer{}, &domain.InternetPackage{}, &domain.Subscription{}, &domain.BillingEvent{}, &domain.TroubleTicket{}, &domain.DocumentSequence{}))
	profile := domain.RadiusProfile{Name: "Fiber 20 Mbps", Status: "enabled"}
	require.NoError(t, db.Create(&profile).Error)
	activePackage := domain.InternetPackage{Code: "FIBER-20", Name: "Fiber 20 Mbps", RadiusProfileID: profile.ID, Status: "active"}
	require.NoError(t, db.Create(&activePackage).Error)
	inactivePackage := domain.InternetPackage{Code: "FIBER-OLD", Name: "Old package", RadiusProfileID: profile.ID, Status: "inactive"}
	require.NoError(t, db.Create(&inactivePackage).Error)

	call := func(payload string) (*httptest.ResponseRecorder, error) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/public/register", strings.NewReader(payload))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		return rec, registerPublicCustomer(CreateTestContext(e, db, req, rec, appCtx))
	}

	for _, payload := range []string{
		`{"name":"A","phone":"081234567890","address":"Jl. Test 1"}`,
		fmt.Sprintf(`{"name":"A","phone":"081234567890","address":"Jl. Test 1","package_id":"%d"}`, inactivePackage.ID),
		`{"name":"A","phone":"081234567890","address":"Jl. Test 1","package_id":"999999"}`,
		fmt.Sprintf(`{"name":"A","phone":"letters-only","address":"Jl. Test 1","package_id":"%d"}`, activePackage.ID),
		fmt.Sprintf(`{"name":"A","phone":"081234567890","email":"invalid-email","address":"Jl. Test 1","package_id":"%d"}`, activePackage.ID),
	} {
		rec, err := call(payload)
		require.NoError(t, err)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	}
	var customers int64
	var tickets int64
	var subscriptions int64
	var billingEvents int64
	require.NoError(t, db.Model(&domain.Customer{}).Count(&customers).Error)
	require.NoError(t, db.Model(&domain.TroubleTicket{}).Count(&tickets).Error)
	require.NoError(t, db.Model(&domain.Subscription{}).Count(&subscriptions).Error)
	require.NoError(t, db.Model(&domain.BillingEvent{}).Count(&billingEvents).Error)
	assert.Zero(t, customers)
	assert.Zero(t, tickets)
	assert.Zero(t, subscriptions)
	assert.Zero(t, billingEvents)

	const callbackName = "test:fail-registration-workorder"
	require.NoError(t, db.Callback().Create().Before("gorm:create").Register(callbackName, func(tx *gorm.DB) {
		if ticket, ok := tx.Statement.Model.(*domain.TroubleTicket); ok && strings.HasPrefix(ticket.Subject, "Pasang Baru:") {
			_ = tx.AddError(errors.New("injected work order insert failure"))
		}
	}))
	rec, err := call(fmt.Sprintf(`{"name":"Dewi","phone":"081234567890","address":"Jl. Test 1","email":"dewi@example.test","package_id":"%d","id_card_number":"ID-123"}`, activePackage.ID))
	require.NoError(t, db.Callback().Create().Remove(callbackName))
	require.NoError(t, err)
	assert.Equal(t, http.StatusInternalServerError, rec.Code)
	require.NoError(t, db.Model(&domain.Customer{}).Count(&customers).Error)
	require.NoError(t, db.Model(&domain.TroubleTicket{}).Count(&tickets).Error)
	require.NoError(t, db.Model(&domain.Subscription{}).Count(&subscriptions).Error)
	require.NoError(t, db.Model(&domain.BillingEvent{}).Count(&billingEvents).Error)
	assert.Zero(t, customers, "customer insert must roll back when work-order insert fails")
	assert.Zero(t, tickets)
	assert.Zero(t, subscriptions)
	assert.Zero(t, billingEvents)
	var seqCount int64
	require.NoError(t, db.Model(&domain.DocumentSequence{}).Count(&seqCount).Error)
	assert.Zero(t, seqCount, "document sequence must roll back with the registration")

	rec, err = call(fmt.Sprintf(`{"name":"Dewi","phone":"081234567890","address":"Jl. Test 1","email":"dewi@example.test","package_id":"%d","id_card_number":"ID-123"}`, activePackage.ID))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
	var response struct {
		Data struct {
			CustomerNo         string `json:"customer_no"`
			SubscriptionNo     string `json:"subscription_no"`
			SubscriptionStatus string `json:"subscription_status"`
			TicketNo           string `json:"ticket_no"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
	assert.NotEmpty(t, response.Data.CustomerNo)
	assert.NotEmpty(t, response.Data.SubscriptionNo)
	assert.Equal(t, domain.SubscriptionPending, response.Data.SubscriptionStatus)
	assert.Regexp(t, `^WO-[0-9]{6}-[0-9]{6}$`, response.Data.TicketNo)
	require.NoError(t, db.Model(&domain.Customer{}).Count(&customers).Error)
	require.NoError(t, db.Model(&domain.TroubleTicket{}).Count(&tickets).Error)
	assert.EqualValues(t, 1, customers)
	assert.EqualValues(t, 1, tickets)
	var customer domain.Customer
	require.NoError(t, db.First(&customer).Error)
	assert.Equal(t, "ID-123", customer.IdentityNo, "website id_card_number must map to customer identity_no")
	var ticket domain.TroubleTicket
	require.NoError(t, db.First(&ticket).Error)
	assert.Equal(t, customer.ID, ticket.CustomerID)
	var subscription domain.Subscription
	require.NoError(t, db.First(&subscription).Error)
	assert.Equal(t, customer.ID, subscription.CustomerID)
	assert.Equal(t, activePackage.ID, subscription.PackageID)
	assert.Equal(t, subscription.ID, ticket.SubscriptionID)
	var registrationEvent domain.BillingEvent
	require.NoError(t, db.Where("subscription_id = ?", subscription.ID).First(&registrationEvent).Error)
	assert.Equal(t, "registration_submitted", registrationEvent.Type)
}

func TestTicketAndWorkOrderNumbersShareSequenceAndFlappingRequestsDeduplicate(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(&domain.Customer{}, &domain.TroubleTicket{}, &domain.DocumentSequence{}, &domain.Subscription{}))
	radiusUser := domain.RadiusUser{Username: "flap-user-01", Password: "test-secret", Status: "enabled"}
	require.NoError(t, db.Create(&radiusUser).Error)
	createTicket := func() domain.TroubleTicket {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/isp/tickets", bytes.NewBufferString(`{"subject":"Router LOS"}`))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		err := createTroubleTicket(CreateTestContext(e, db, req, rec, appCtx))
		require.NoError(t, err)
		require.Equal(t, http.StatusCreated, rec.Code)
		var result struct {
			Data domain.TroubleTicket `json:"data"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &result))
		return result.Data
	}
	createFlapping := func() domain.TroubleTicket {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/network/diagnostics/flapping/auto-ticket", bytes.NewBufferString(`{"username":"flap-user-01","description":"8 disconnects in one hour"}`))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		err := createFlappingTicket(CreateTestContext(e, db, req, rec, appCtx))
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, rec.Code)
		var result struct {
			Data domain.TroubleTicket `json:"data"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &result))
		return result.Data
	}

	regular := createTicket()
	flapping := createFlapping()
	flappingAgain := createFlapping()
	assert.Regexp(t, `^TCK-[0-9]{6}-000001$`, regular.TicketNo)
	assert.Regexp(t, `^FLAP-[0-9]{6}-000002$`, flapping.TicketNo)
	assert.Equal(t, flapping.ID, flappingAgain.ID)
	assert.Equal(t, flapping.TicketNo, flappingAgain.TicketNo)
	var count int64
	require.NoError(t, db.Model(&domain.TroubleTicket{}).Count(&count).Error)
	assert.EqualValues(t, 2, count, "repeating the same active flapping incident must not create a second ticket")
}
