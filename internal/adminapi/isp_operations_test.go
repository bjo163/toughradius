package adminapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestISPOperations(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(
		&domain.HotspotBatch{},
		&domain.HotspotVoucher{},
		&domain.IPAMPool{},
		&domain.TroubleTicket{},
		&domain.RadiusUser{},
		&domain.Customer{},
	))

	// 1. Test Generate Vouchers
	genPayload := []byte(`{
		"name": "Warkop 5k",
		"quantity": 5,
		"price": 5000,
		"validity_seconds": 10800,
		"quota_mb": 1024,
		"prefix": "WRK",
		"code_length": 5,
		"same_user_pass": true
	}`)
	reqGen := httptest.NewRequest(http.MethodPost, "/api/v1/isp/vouchers/generate", bytes.NewReader(genPayload))
	reqGen.Header.Set("Content-Type", "application/json")
	recGen := httptest.NewRecorder()
	cGen := CreateTestContext(e, db, reqGen, recGen, appCtx)

	err := generateVouchers(cGen)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, recGen.Code)

	var vCount int64
	db.Model(&domain.HotspotVoucher{}).Count(&vCount)
	assert.Equal(t, int64(5), vCount)

	// 2. Test List Vouchers
	reqListV := httptest.NewRequest(http.MethodGet, "/api/v1/isp/vouchers", nil)
	recListV := httptest.NewRecorder()
	cListV := CreateTestContext(e, db, reqListV, recListV, appCtx)

	err = listVouchers(cListV)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, recListV.Code)

	// 3. Test IPAM Pool Creation & Listing
	ipamPayload := []byte(`{
		"name": "PPPoE CGNAT Pool 1",
		"cidr": "100.64.0.0/22",
		"pool_type": "cgnat",
		"gateway": "100.64.0.1",
		"dns_primary": "1.1.1.1"
	}`)
	reqIPAM := httptest.NewRequest(http.MethodPost, "/api/v1/network/ipam/pools", bytes.NewReader(ipamPayload))
	reqIPAM.Header.Set("Content-Type", "application/json")
	recIPAM := httptest.NewRecorder()
	cIPAM := CreateTestContext(e, db, reqIPAM, recIPAM, appCtx)

	err = createIPAMPool(cIPAM)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, recIPAM.Code)

	reqListIPAM := httptest.NewRequest(http.MethodGet, "/api/v1/network/ipam/pools", nil)
	recListIPAM := httptest.NewRecorder()
	cListIPAM := CreateTestContext(e, db, reqListIPAM, recListIPAM, appCtx)

	err = listIPAMPools(cListIPAM)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, recListIPAM.Code)

	// 4. Test Trouble Ticket Creation & Update
	customer := domain.Customer{
		Name:    "Pak Joko",
		Phone:   "081234567890",
		Address: "Jl. Merdeka No. 45",
	}
	require.NoError(t, db.Create(&customer).Error)

	ticketPayload := []byte(`{
		"customer_id": "` + strconv.FormatInt(customer.ID, 10) + `",
		"subject": "Kabel FO Terputus / LOS Merah",
		"category": "los_red",
		"priority": "urgent",
		"assigned_technician": "Budi Lapangan",
		"technician_phone": "081987654321"
	}`)
	reqTicket := httptest.NewRequest(http.MethodPost, "/api/v1/isp/tickets", bytes.NewReader(ticketPayload))
	reqTicket.Header.Set("Content-Type", "application/json")
	recTicket := httptest.NewRecorder()
	cTicket := CreateTestContext(e, db, reqTicket, recTicket, appCtx)

	err = createTroubleTicket(cTicket)
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, recTicket.Code)

	var ticketRes struct {
		Data domain.TroubleTicket `json:"data"`
	}
	require.NoError(t, json.Unmarshal(recTicket.Body.Bytes(), &ticketRes))
	assert.Equal(t, "urgent", ticketRes.Data.Priority)
	assert.Equal(t, "open", ticketRes.Data.Status)

	// Dispatch ticket WhatsApp
	reqDispatch := httptest.NewRequest(http.MethodPost, "/api/v1/isp/tickets/"+strconv.FormatInt(ticketRes.Data.ID, 10)+"/dispatch", nil)
	recDispatch := httptest.NewRecorder()
	cDispatch := CreateTestContext(e, db, reqDispatch, recDispatch, appCtx)
	cDispatch.SetParamNames("id")
	cDispatch.SetParamValues(strconv.FormatInt(ticketRes.Data.ID, 10))

	err = dispatchTicketWhatsApp(cDispatch)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, recDispatch.Code)

	// 5. Test Live Ping Tool
	pingPayload := []byte(`{"host": "127.0.0.1", "count": 2}`)
	reqPing := httptest.NewRequest(http.MethodPost, "/api/v1/network/diagnostics/ping", bytes.NewReader(pingPayload))
	reqPing.Header.Set("Content-Type", "application/json")
	recPing := httptest.NewRecorder()
	cPing := CreateTestContext(e, db, reqPing, recPing, appCtx)

	err = runLivePing(cPing)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, recPing.Code)
}

func TestODPAndFlappingOperations(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(
		&domain.ODP{},
		&domain.Customer{},
		&domain.Subscription{},
		&domain.RadiusUser{},
		&domain.RadiusAccounting{},
		&domain.TroubleTicket{},
	))

	// 1. Create ODP
	odpPayload := []byte(`{
		"code": "ODP-KNG-001",
		"name": "ODP Kuningan Barat 01",
		"zone": "Kuningan",
		"olt_name": "OLT-ZTE-CORE-01",
		"pon_port": "gpon-olt_1/1/3",
		"total_ports": 16,
		"optical_loss": -18.5,
		"status": "active",
		"latitude": -6.2297,
		"longitude": 106.8294
	}`)
	reqODP := httptest.NewRequest(http.MethodPost, "/api/v1/network/odp", bytes.NewReader(odpPayload))
	reqODP.Header.Set("Content-Type", "application/json")
	recODP := httptest.NewRecorder()
	cODP := CreateTestContext(e, db, reqODP, recODP, appCtx)
	require.NoError(t, createODP(cODP))
	assert.Equal(t, http.StatusOK, recODP.Code)

	// 2. List ODPs
	reqListODP := httptest.NewRequest(http.MethodGet, "/api/v1/network/odp", nil)
	recListODP := httptest.NewRecorder()
	cListODP := CreateTestContext(e, db, reqListODP, recListODP, appCtx)
	require.NoError(t, listODPs(cListODP))
	assert.Equal(t, http.StatusOK, recListODP.Code)

	// 3. Flapping Detection and Auto-Ticket
	reqFlap := httptest.NewRequest(http.MethodGet, "/api/v1/network/diagnostics/flapping", nil)
	recFlap := httptest.NewRecorder()
	cFlap := CreateTestContext(e, db, reqFlap, recFlap, appCtx)
	require.NoError(t, detectFlappingSubscribers(cFlap))
	assert.Equal(t, http.StatusOK, recFlap.Code)

	// 4. Auto Ticket for Flapping
	ticketPayload := []byte(`{
		"username": "customer_flap_01",
		"customer_no": "CUST-0099",
		"description": "Redaman dropcore drop ke -29 dBm"
	}`)
	reqTicket := httptest.NewRequest(http.MethodPost, "/api/v1/network/diagnostics/flapping/auto-ticket", bytes.NewReader(ticketPayload))
	reqTicket.Header.Set("Content-Type", "application/json")
	recTicket := httptest.NewRecorder()
	cTicket := CreateTestContext(e, db, reqTicket, recTicket, appCtx)
	require.NoError(t, createFlappingTicket(cTicket))
	assert.Equal(t, http.StatusOK, recTicket.Code)
}
