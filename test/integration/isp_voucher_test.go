//go:build integration

package integration

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/pkg/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"layeh.com/radius"
	"layeh.com/radius/rfc2865"
)

func TestVoucherGenerationUsesPostgresSequenceAndActivatesAfterValidAuth(t *testing.T) {
	db := h.appCtx.DB()
	suffix := uniqueSuffix()
	profileID := seedProfile(t, "it-voucher-profile-"+suffix)
	pkg := domain.InternetPackage{
		Code: "IT-HOT-" + suffix, Name: "Integration hotspot " + suffix,
		Status: "active", RadiusProfileID: profileID,
	}
	require.NoError(t, db.Create(&pkg).Error)

	client := newAPIClient(t)
	const batchCount = 3
	responses := make(chan struct {
		status int
		body   []byte
	}, batchCount)
	var workers sync.WaitGroup
	for i := 0; i < batchCount; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			payload, err := json.Marshal(map[string]any{
				"name": "Concurrent test " + suffix, "package_id": fmt.Sprint(pkg.ID),
				"quantity": 2, "validity_seconds": 2, "quota_mb": 0,
				"code_length": 12, "same_user_pass": true,
			})
			if err != nil {
				responses <- struct {
					status int
					body   []byte
				}{status: 0, body: []byte(err.Error())}
				return
			}
			req, err := http.NewRequest(http.MethodPost, client.base+"/api/v1/isp/vouchers/generate", bytes.NewReader(payload))
			if err != nil {
				responses <- struct {
					status int
					body   []byte
				}{status: 0, body: []byte(err.Error())}
				return
			}
			req.Header.Set("Authorization", "Bearer "+client.token)
			req.Header.Set("Content-Type", "application/json")
			resp, err := client.http.Do(req)
			if err != nil {
				responses <- struct {
					status int
					body   []byte
				}{status: 0, body: []byte(err.Error())}
				return
			}
			defer func() { _ = resp.Body.Close() }()
			var result bytes.Buffer
			_, _ = result.ReadFrom(resp.Body)
			responses <- struct {
				status int
				body   []byte
			}{status: resp.StatusCode, body: result.Bytes()}
		}()
	}
	workers.Wait()
	close(responses)

	var created []domain.HotspotBatch
	for response := range responses {
		require.Equalf(t, http.StatusOK, response.status, "generation response: %s", string(response.body))
		var envelope struct {
			Data struct {
				Batch domain.HotspotBatch `json:"batch"`
			} `json:"data"`
		}
		require.NoError(t, json.Unmarshal(response.body, &envelope))
		created = append(created, envelope.Data.Batch)
	}
	require.Len(t, created, batchCount)
	seenBatchNumbers := make(map[string]struct{}, len(created))
	for _, batch := range created {
		assert.Equal(t, "it-admin", batch.CreatedBy)
		if _, duplicate := seenBatchNumbers[batch.BatchNo]; duplicate {
			t.Fatalf("duplicate concurrent batch number %q", batch.BatchNo)
		}
		seenBatchNumbers[batch.BatchNo] = struct{}{}
	}

	var vouchers []domain.HotspotVoucher
	require.NoError(t, db.Where("batch_id IN ?", batchIDs(created)).Order("id ASC").Find(&vouchers).Error)
	require.Len(t, vouchers, batchCount*2)
	first := vouchers[0]
	require.NotZero(t, first.RadiusUserID)
	var radiusUser domain.RadiusUser
	require.NoError(t, db.First(&radiusUser, first.RadiusUserID).Error)
	require.Equal(t, first.Code, radiusUser.Username)
	require.Equal(t, profileID, radiusUser.ProfileId)
	require.True(t, radiusUser.ExpireTime.After(time.Now().AddDate(50, 0, 0)), "unused voucher should not expire before first login")
	require.Nil(t, first.FirstLoginAt)
	require.Nil(t, first.ExpiresAt)

	const secret = "it-voucher-radius-secret"
	nasIP := uniqueNASIP()
	nasID := "it-voucher-nas-" + suffix
	nas := domain.NetNas{ID: common.UUIDint64(), Identifier: nasID, Ipaddr: nasIP, Secret: secret, VendorCode: "0", Status: common.ENABLED}
	require.NoError(t, db.Create(&nas).Error)
	serverAddr := fmt.Sprintf("127.0.0.1:%d", h.cfg.Radiusd.AuthPort)

	wrong := exchange(t, serverAddr, secret, first.Code, "wrong-password", nasID, nasIP)
	assert.Equal(t, radius.CodeAccessReject, wrong.Code)
	releaseIntegrationAuthRateLimit(first.Code)
	var beforeAuth domain.HotspotVoucher
	require.NoError(t, db.First(&beforeAuth, first.ID).Error)
	require.Nil(t, beforeAuth.FirstLoginAt, "failed credentials must not consume the voucher validity window")
	require.Nil(t, beforeAuth.ExpiresAt)

	accepted := exchange(t, serverAddr, secret, first.Code, first.Password, nasID, nasIP)
	require.Equal(t, radius.CodeAccessAccept, accepted.Code)
	releaseIntegrationAuthRateLimit(first.Code)
	var activated domain.HotspotVoucher
	require.NoError(t, db.First(&activated, first.ID).Error)
	require.Equal(t, "used", activated.Status)
	require.NotNil(t, activated.FirstLoginAt)
	require.NotNil(t, activated.ExpiresAt)
	assert.WithinDuration(t, time.Now(), *activated.FirstLoginAt, 5*time.Second)
	assert.WithinDuration(t, activated.FirstLoginAt.Add(2*time.Second), *activated.ExpiresAt, time.Second)
	require.NoError(t, db.First(&radiusUser, first.RadiusUserID).Error)
	assert.WithinDuration(t, *activated.ExpiresAt, radiusUser.ExpireTime, time.Second)
	if timeout := rfc2865.SessionTimeout_Get(accepted); timeout > 0 {
		assert.LessOrEqual(t, int(timeout), 2)
	}
	time.Sleep(time.Until(*activated.ExpiresAt) + 100*time.Millisecond)
	releaseIntegrationAuthRateLimit(first.Code)
	expired := exchange(t, serverAddr, secret, first.Code, first.Password, nasID, nasIP)
	assert.Equal(t, radius.CodeAccessReject, expired.Code, "an expired voucher must not authenticate")
	require.NoError(t, db.First(&activated, first.ID).Error)
	assert.Equal(t, "expired", activated.Status)

	for _, batch := range created {
		status, body := client.delete(t, fmt.Sprintf("/api/v1/isp/vouchers/batches/%d", batch.ID))
		require.Equalf(t, http.StatusOK, status, "batch cleanup response: %s", string(body))
	}
}

func batchIDs(batches []domain.HotspotBatch) []int64 {
	ids := make([]int64, 0, len(batches))
	for _, batch := range batches {
		ids = append(ids, batch.ID)
	}
	return ids
}
