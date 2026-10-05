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

func TestCustomerRegistrationAndTicketsSharePostgresSequenceConcurrently(t *testing.T) {
	db := h.appCtx.DB()
	suffix := uniqueSuffix()
	profileID := seedProfile(t, "it-registration-profile-"+suffix)
	pkg := domain.InternetPackage{
		Code: "IT-REG-" + suffix, Name: "Integration registration " + suffix,
		Status: "active", RadiusProfileID: profileID,
	}
	require.NoError(t, db.Create(&pkg).Error)
	client := newAPIClient(t)

	const requestCount = 12
	type result struct {
		status   int
		expected int
		body     []byte
		ticketNo string
	}
	results := make(chan result, requestCount)
	var workers sync.WaitGroup
	for i := 0; i < requestCount; i++ {
		workers.Add(1)
		go func(index int) {
			defer workers.Done()
			var path string
			var payload []byte
			expectedStatus := http.StatusOK
			if index%2 == 0 {
				path = "/api/v1/isp/tickets"
				expectedStatus = http.StatusCreated
				payload, _ = json.Marshal(map[string]any{"subject": fmt.Sprintf("Concurrent ticket %s %d", suffix, index)})
			} else {
				path = "/api/v1/public/register"
				payload, _ = json.Marshal(map[string]any{
					"name":  fmt.Sprintf("Concurrent customer %s %d", suffix, index),
					"phone": fmt.Sprintf("08123456%04d", index), "address": "Integration test address",
					"package_id": fmt.Sprint(pkg.ID),
				})
			}
			req, err := http.NewRequest(http.MethodPost, client.base+path, bytes.NewReader(payload))
			if err != nil {
				results <- result{body: []byte(err.Error()), expected: expectedStatus}
				return
			}
			req.Header.Set("Authorization", "Bearer "+client.token)
			req.Header.Set("Content-Type", "application/json")
			resp, err := client.http.Do(req)
			if err != nil {
				results <- result{body: []byte(err.Error()), expected: expectedStatus}
				return
			}
			defer func() { _ = resp.Body.Close() }()
			var body bytes.Buffer
			_, _ = body.ReadFrom(resp.Body)
			var envelope struct {
				Data struct {
					TicketNo string `json:"ticket_no"`
				} `json:"data"`
			}
			_ = json.Unmarshal(body.Bytes(), &envelope)
			results <- result{status: resp.StatusCode, expected: expectedStatus, body: body.Bytes(), ticketNo: envelope.Data.TicketNo}
		}(i)
	}
	workers.Wait()
	close(results)

	seen := make(map[string]struct{}, requestCount)
	for result := range results {
		require.Equalf(t, result.expected, result.status, "request response: %s", string(result.body))
		require.Regexp(t, `^(TCK|WO)-[0-9]{6}-[0-9]{6}$`, result.ticketNo, "response: %s", string(result.body))
		if _, exists := seen[result.ticketNo]; exists {
			t.Fatalf("concurrent request received duplicate ticket/work-order number %q", result.ticketNo)
		}
		seen[result.ticketNo] = struct{}{}
	}
	require.Len(t, seen, requestCount)

	var ticketCount int64
	require.NoError(t, db.Model(&domain.TroubleTicket{}).Where("ticket_no LIKE ? OR ticket_no LIKE ?", "TCK-%", "WO-%").Count(&ticketCount).Error)
	assert.EqualValues(t, requestCount, ticketCount)
	var customerCount int64
	require.NoError(t, db.Model(&domain.Customer{}).Where("name LIKE ?", "Concurrent customer "+suffix+"%").Count(&customerCount).Error)
	assert.EqualValues(t, requestCount/2, customerCount)
	var registrationSubscriptionCount int64
	require.NoError(t, db.Model(&domain.Subscription{}).
		Where("package_id = ? AND customer_id IN (SELECT id FROM isp_customer WHERE name LIKE ?)", pkg.ID, "Concurrent customer "+suffix+"%").
		Count(&registrationSubscriptionCount).Error)
	assert.EqualValues(t, requestCount/2, registrationSubscriptionCount, "every accepted registration must retain its selected package relationship")

	// The NOC can be polled or clicked more than once while an alert is open.
	// Row locking by RADIUS username must collapse concurrent repeats to one
	// active incident, even when the PostgreSQL requests overlap.
	flapUser := "it-flap-" + suffix
	require.NoError(t, db.Create(&domain.RadiusUser{Username: flapUser, Password: "test-secret", Status: "enabled"}).Error)
	const repeats = 8
	flapResults := make(chan result, repeats)
	for i := 0; i < repeats; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			payload, _ := json.Marshal(map[string]string{"username": flapUser, "description": "same active alert"})
			req, err := http.NewRequest(http.MethodPost, client.base+"/api/v1/network/diagnostics/flapping/auto-ticket", bytes.NewReader(payload))
			if err != nil {
				flapResults <- result{body: []byte(err.Error()), expected: http.StatusOK}
				return
			}
			req.Header.Set("Authorization", "Bearer "+client.token)
			req.Header.Set("Content-Type", "application/json")
			resp, err := client.http.Do(req)
			if err != nil {
				flapResults <- result{body: []byte(err.Error()), expected: http.StatusOK}
				return
			}
			defer func() { _ = resp.Body.Close() }()
			var body bytes.Buffer
			_, _ = body.ReadFrom(resp.Body)
			var envelope struct {
				Data domain.TroubleTicket `json:"data"`
			}
			_ = json.Unmarshal(body.Bytes(), &envelope)
			flapResults <- result{status: resp.StatusCode, expected: http.StatusOK, body: body.Bytes(), ticketNo: envelope.Data.TicketNo}
		}()
	}
	workers.Wait()
	close(flapResults)
	var flapTicketNo string
	for response := range flapResults {
		require.Equalf(t, response.expected, response.status, "flapping response: %s", string(response.body))
		require.NotEmpty(t, response.ticketNo, "flapping response: %s", string(response.body))
		if flapTicketNo == "" {
			flapTicketNo = response.ticketNo
		} else {
			assert.Equal(t, flapTicketNo, response.ticketNo, "repeat active incident should return existing ticket")
		}
	}
	var flapCount int64
	require.NoError(t, db.Model(&domain.TroubleTicket{}).Where("ticket_no = ?", flapTicketNo).Count(&flapCount).Error)
	assert.EqualValues(t, 1, flapCount)
}

func batchIDs(batches []domain.HotspotBatch) []int64 {
	ids := make([]int64, 0, len(batches))
	for _, batch := range batches {
		ids = append(ids, batch.ID)
	}
	return ids
}
