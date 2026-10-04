package adminapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestISPOperations(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(
		&domain.HotspotBatch{},
		&domain.HotspotVoucher{},
		&domain.InternetPackage{},
		&domain.RadiusProfile{},
		&domain.DocumentSequence{},
		&domain.IPAMPool{},
		&domain.TroubleTicket{},
		&domain.RadiusUser{},
		&domain.Customer{},
	))
	profile := domain.RadiusProfile{Name: "Hotspot 10 Mbps", Status: "enabled", UpRate: 10000, DownRate: 10000, ActiveNum: 1}
	require.NoError(t, db.Create(&profile).Error)
	pkg := domain.InternetPackage{Code: "HOT-10", Name: "Hotspot 10 Mbps", Status: "active", RadiusProfileID: profile.ID}
	require.NoError(t, db.Create(&pkg).Error)

	// 1. Test Generate Vouchers
	genPayload := []byte(`{
		"name": "Warkop 5k",
		"package_id": "` + strconv.FormatInt(pkg.ID, 10) + `",
		"quantity": 5,
		"price": 5000,
		"validity_seconds": 10800,
		"quota_mb": 0,
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
	require.NoError(t, db.Model(&domain.HotspotVoucher{}).Count(&vCount).Error)
	assert.Equal(t, int64(5), vCount)
	var batchCount int64
	require.NoError(t, db.Model(&domain.HotspotBatch{}).Count(&batchCount).Error)
	assert.Equal(t, int64(1), batchCount)
	var radiusCount int64
	require.NoError(t, db.Model(&domain.RadiusUser{}).Where("profile_id = ?", profile.ID).Count(&radiusCount).Error)
	assert.Equal(t, int64(5), radiusCount)
	var generatedUser domain.RadiusUser
	require.NoError(t, db.Where("profile_id = ?", profile.ID).First(&generatedUser).Error)
	assert.Equal(t, "enabled", generatedUser.Status)
	assert.True(t, generatedUser.ExpireTime.After(time.Now()))
	var generatedVoucher domain.HotspotVoucher
	require.NoError(t, db.Where("code = ?", generatedUser.Username).First(&generatedVoucher).Error)
	assert.Equal(t, generatedUser.ID, generatedVoucher.RadiusUserID)

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

func TestVoucherGenerationRequiresUsablePackageAndRollsBack(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(&domain.HotspotBatch{}, &domain.HotspotVoucher{}, &domain.InternetPackage{}, &domain.RadiusProfile{}, &domain.RadiusUser{}, &domain.DocumentSequence{}))
	pkg := domain.InternetPackage{Code: "NO-PROFILE", Name: "Missing profile", Status: "active"}
	require.NoError(t, db.Create(&pkg).Error)
	body := []byte(`{"name":"Invalid","package_id":"` + strconv.FormatInt(pkg.ID, 10) + `","quantity":2}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/isp/vouchers/generate", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := CreateTestContext(e, db, req, rec, appCtx)
	require.NoError(t, generateVouchers(c))
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	for _, model := range []any{&domain.HotspotBatch{}, &domain.HotspotVoucher{}, &domain.RadiusUser{}, &domain.DocumentSequence{}} {
		var count int64
		require.NoError(t, db.Model(model).Count(&count).Error)
		assert.Zero(t, count)
	}
	profile := domain.RadiusProfile{Name: "Usable profile", Status: "enabled"}
	require.NoError(t, db.Create(&profile).Error)
	pkg.RadiusProfileID = profile.ID
	require.NoError(t, db.Save(&pkg).Error)
	body = []byte(`{"name":"Quota claim","package_id":"` + strconv.FormatInt(pkg.ID, 10) + `","quantity":1,"quota_mb":256}`)
	req = httptest.NewRequest(http.MethodPost, "/api/v1/isp/vouchers/generate", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	c = CreateTestContext(e, db, req, rec, appCtx)
	require.NoError(t, generateVouchers(c))
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	var batches int64
	require.NoError(t, db.Model(&domain.HotspotBatch{}).Count(&batches).Error)
	assert.Zero(t, batches)

	const callbackName = "test:fail_radius_user_create"
	require.NoError(t, db.Callback().Create().Before("gorm:create").Register(callbackName, func(tx *gorm.DB) {
		if tx.Statement.Table == (domain.RadiusUser{}).TableName() {
			_ = tx.AddError(errors.New("injected RADIUS credential insert failure"))
		}
	}))
	body = []byte(`{"name":"Rollback","package_id":"` + strconv.FormatInt(pkg.ID, 10) + `","quantity":2}`)
	req = httptest.NewRequest(http.MethodPost, "/api/v1/isp/vouchers/generate", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	c = CreateTestContext(e, db, req, rec, appCtx)
	require.NoError(t, generateVouchers(c))
	assert.Equal(t, http.StatusInternalServerError, rec.Code)
	require.NoError(t, db.Callback().Create().Remove(callbackName))
	for _, model := range []any{&domain.HotspotBatch{}, &domain.HotspotVoucher{}, &domain.RadiusUser{}, &domain.DocumentSequence{}} {
		var count int64
		require.NoError(t, db.Model(model).Count(&count).Error)
		assert.Zero(t, count, "failed credential creation must roll back every generated record")
	}
}

func TestVoucherBatchNumbersUseAtomicDailySequence(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(&domain.HotspotBatch{}, &domain.HotspotVoucher{}, &domain.InternetPackage{}, &domain.RadiusProfile{}, &domain.RadiusUser{}, &domain.DocumentSequence{}))
	profile := domain.RadiusProfile{Name: "Voucher profile", Status: "enabled"}
	require.NoError(t, db.Create(&profile).Error)
	pkg := domain.InternetPackage{Code: "BATCH-TEST", Name: "Batch test", Status: "active", RadiusProfileID: profile.ID}
	require.NoError(t, db.Create(&pkg).Error)
	for i := 0; i < 2; i++ {
		body := []byte(`{"package_id":"` + strconv.FormatInt(pkg.ID, 10) + `","quantity":3,"code_length":8}`)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/isp/vouchers/generate", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		ctx := CreateTestContext(e, db, req, rec, appCtx)
		require.NoError(t, generateVouchers(ctx))
		assert.Equal(t, http.StatusOK, rec.Code)
	}
	var batches []domain.HotspotBatch
	require.NoError(t, db.Order("id ASC").Find(&batches).Error)
	require.Len(t, batches, 2)
	assert.NotEqual(t, batches[0].BatchNo, batches[1].BatchNo)
	assert.Equal(t, "BATCH-"+time.Now().Format("060102")+"-000001", batches[0].BatchNo)
	assert.Equal(t, "BATCH-"+time.Now().Format("060102")+"-000002", batches[1].BatchNo)
}

func TestDeleteVoucherBatchReportsMissingAndRemovesCredentials(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(&domain.HotspotBatch{}, &domain.HotspotVoucher{}, &domain.RadiusUser{}))
	batch := domain.HotspotBatch{BatchNo: "BATCH-DELETE-1", Quantity: 1}
	require.NoError(t, db.Create(&batch).Error)
	user := domain.RadiusUser{Username: "DELETE-ME", Password: "secret", Status: "enabled"}
	require.NoError(t, db.Create(&user).Error)
	voucher := domain.HotspotVoucher{BatchID: batch.ID, Code: user.Username, Password: user.Password, RadiusUserID: user.ID, Status: "active"}
	require.NoError(t, db.Create(&voucher).Error)

	missingReq := httptest.NewRequest(http.MethodDelete, "/api/v1/isp/vouchers/batches/999", nil)
	missingRec := httptest.NewRecorder()
	missingCtx := CreateTestContext(e, db, missingReq, missingRec, appCtx)
	missingCtx.SetParamNames("id")
	missingCtx.SetParamValues("999")
	require.NoError(t, deleteVoucherBatch(missingCtx))
	assert.Equal(t, http.StatusNotFound, missingRec.Code)

	const deleteCallbackName = "test:fail_radius_user_delete"
	require.NoError(t, db.Callback().Delete().Before("gorm:delete").Register(deleteCallbackName, func(tx *gorm.DB) {
		if tx.Statement.Table == (domain.RadiusUser{}).TableName() {
			_ = tx.AddError(errors.New("injected RADIUS credential delete failure"))
		}
	}))
	failingReq := httptest.NewRequest(http.MethodDelete, "/api/v1/isp/vouchers/batches/"+strconv.FormatInt(batch.ID, 10), nil)
	failingRec := httptest.NewRecorder()
	failingCtx := CreateTestContext(e, db, failingReq, failingRec, appCtx)
	failingCtx.SetParamNames("id")
	failingCtx.SetParamValues(strconv.FormatInt(batch.ID, 10))
	require.NoError(t, deleteVoucherBatch(failingCtx))
	assert.Equal(t, http.StatusInternalServerError, failingRec.Code)
	require.NoError(t, db.Callback().Delete().Remove(deleteCallbackName))
	for _, model := range []any{&domain.HotspotBatch{}, &domain.HotspotVoucher{}, &domain.RadiusUser{}} {
		var count int64
		require.NoError(t, db.Model(model).Count(&count).Error)
		assert.EqualValues(t, 1, count, "failed delete must roll back every record")
	}

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/isp/vouchers/batches/"+strconv.FormatInt(batch.ID, 10), nil)
	rec := httptest.NewRecorder()
	ctx := CreateTestContext(e, db, req, rec, appCtx)
	ctx.SetParamNames("id")
	ctx.SetParamValues(strconv.FormatInt(batch.ID, 10))
	require.NoError(t, deleteVoucherBatch(ctx))
	assert.Equal(t, http.StatusOK, rec.Code)
	for _, model := range []any{&domain.HotspotBatch{}, &domain.HotspotVoucher{}, &domain.RadiusUser{}} {
		var count int64
		require.NoError(t, db.Model(model).Count(&count).Error)
		assert.Zero(t, count)
	}
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
