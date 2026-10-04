package adminapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTelemetryRoutes(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(
		&domain.NetMonitorTarget{},
		&domain.NetMonitorSample{},
		&domain.RadiusTrafficSample{},
		&domain.SyslogEvent{},
		&domain.Subscription{},
		&domain.RadiusUser{},
	))

	// 1. Create a dummy monitor target and sample
	target := domain.NetMonitorTarget{
		Name:            "Core Router",
		Kind:            "router",
		Address:         "10.0.0.1",
		ProbeType:       "snmp",
		Port:            161,
		IntervalSeconds: 60,
		Enabled:         true,
	}
	require.NoError(t, db.Create(&target).Error)

	metricsJSON := `[{"index":1,"name":"ether1","operational":"up","in_octets":"1000000","out_octets":"500000"}]`
	sample1 := domain.NetMonitorSample{
		TargetID:             target.ID,
		CheckedAt:            time.Now().Add(-5 * time.Minute),
		Reachable:            true,
		LatencyMilliseconds:  15,
		InterfaceMetricsJSON: metricsJSON,
	}
	sample2 := domain.NetMonitorSample{
		TargetID:             target.ID,
		CheckedAt:            time.Now(),
		Reachable:            true,
		LatencyMilliseconds:  14,
		InterfaceMetricsJSON: `[{"index":1,"name":"ether1","operational":"up","in_octets":"10600000","out_octets":"3500000"}]`,
	}
	require.NoError(t, db.Create(&sample1).Error)
	require.NoError(t, db.Create(&sample2).Error)

	// 2. Query target traffic
	targetPath := fmt.Sprintf("/api/v1/network/monitor-targets/%d/traffic?range=1h", target.ID)
	req := httptest.NewRequest(http.MethodGet, targetPath, nil)
	rec := httptest.NewRecorder()
	c := CreateTestContext(e, db, req, rec, appCtx)
	c.SetParamNames("id")
	c.SetParamValues(strconv.FormatInt(target.ID, 10))

	err := getMonitorTargetTraffic(c)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)

	var res struct {
		Data TrafficSeriesDTO `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &res))
	assert.Equal(t, "ether1", res.Data.InterfaceName)
	assert.Contains(t, res.Data.AvailableInterfaces, "ether1")
	assert.NotEmpty(t, res.Data.Points)

	// 3. Test Syslog list and inject test
	reqSyslog := httptest.NewRequest(http.MethodGet, "/api/v1/network/syslog", nil)
	recSyslog := httptest.NewRecorder()
	cSyslog := CreateTestContext(e, db, reqSyslog, recSyslog, appCtx)

	err = listSyslogEvents(cSyslog)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, recSyslog.Code)

	// 4. Test User traffic query
	userSample := domain.RadiusTrafficSample{
		Username:      "pppoe-testuser",
		AcctSessionID: "sess-99",
		NasAddr:       "10.0.0.1",
		InOctets:      5000000,
		OutOctets:     1000000,
		InRateBps:     15000000,
		OutRateBps:    3000000,
		RecordedAt:    time.Now(),
	}
	require.NoError(t, db.Create(&userSample).Error)

	reqUser := httptest.NewRequest(http.MethodGet, "/api/v1/radius/traffic/user/pppoe-testuser?range=1h", nil)
	recUser := httptest.NewRecorder()
	cUser := CreateTestContext(e, db, reqUser, recUser, appCtx)
	cUser.SetParamNames("username")
	cUser.SetParamValues("pppoe-testuser")

	err = getUserTraffic(cUser)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, recUser.Code)

	var resUser struct {
		Data TrafficSeriesDTO `json:"data"`
	}
	require.NoError(t, json.Unmarshal(recUser.Body.Bytes(), &resUser))
	assert.Equal(t, "pppoe-testuser", resUser.Data.EntityID)
	assert.NotEmpty(t, resUser.Data.Points)
}
