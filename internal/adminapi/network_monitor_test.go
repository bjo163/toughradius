package adminapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"
	"github.com/bjo163/mwx-isp/internal/domain"
)

func TestCreateMonitorTargetValidatesAddressAndHidesSNMPCredentials(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(&domain.NetMonitorTarget{}))

	request := func(body string) (echo.Context, *httptest.ResponseRecorder) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/network/monitor-targets", strings.NewReader(body))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		return CreateTestContext(e, db, req, rec, appCtx), rec
	}
	invalid, invalidRec := request(`{"name":"bad","address":"0.0.0.0","probe_type":"icmp","interval_seconds":60,"timeout_milliseconds":1000,"failure_threshold":2}`)
	require.NoError(t, createMonitorTarget(invalid))
	require.Equal(t, http.StatusBadRequest, invalidRec.Code)

	c, rec := request(`{"name":"router-1","kind":"router","address":"192.0.2.1","probe_type":"snmp","port":161,"interval_seconds":60,"timeout_milliseconds":1000,"failure_threshold":2,"snmp_version":"v2c","snmp_community":"private"}`)
	require.NoError(t, createMonitorTarget(c))
	require.Equal(t, http.StatusCreated, rec.Code)
	var response map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
	payload := response["data"].(map[string]any)
	require.Equal(t, true, payload["snmp_secret_configured"])
	_, leaked := payload["snmp_community_encrypted"]
	require.False(t, leaked)
	_, leaked = payload["snmp_community"]
	require.False(t, leaked)
	var stored domain.NetMonitorTarget
	require.NoError(t, db.First(&stored).Error)
	require.NotEmpty(t, stored.SNMPCommunityEncrypted)
	require.NotContains(t, string(stored.SNMPCommunityEncrypted), "private")
}

func TestListMonitorTargetsHasPaginationMetadata(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(&domain.NetMonitorTarget{}))
	require.NoError(t, db.Create(&domain.NetMonitorTarget{Name: "router", Kind: "router", Address: "192.0.2.1", ProbeType: "icmp", IntervalSeconds: 60, TimeoutMilliseconds: 1000, FailureThreshold: 2, Enabled: true, LastStatus: "unknown"}).Error)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/network/monitor-targets?page=1&perPage=10", nil)
	rec := httptest.NewRecorder()
	c := CreateTestContext(e, db, req, rec, appCtx)
	require.NoError(t, listMonitorTargets(c))
	require.Equal(t, http.StatusOK, rec.Code)
	var response struct {
		Data []map[string]any `json:"data"`
		Meta map[string]any   `json:"meta"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
	require.Len(t, response.Data, 1)
	require.Equal(t, float64(1), response.Meta["total"])
}

func TestMonitorTargetDTOReportsSecretConfigured(t *testing.T) {
	dto := toMonitorDTO(domain.NetMonitorTarget{SNMPCommunityEncrypted: []byte("cipher"), LastCheckedAt: func() *time.Time { v := time.Now(); return &v }()})
	require.True(t, dto.SNMPSecretConfigured)
	require.Empty(t, dto.SNMPCommunityEncrypted)
}
