//go:build integration

package integration

import (
	"context"
	"fmt"
	"net"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"layeh.com/radius"
	"layeh.com/radius/rfc2865"

	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/internal/tenancy"
	"github.com/bjo163/mwx-isp/pkg/common"
)

// TestRadiusPAPAuthentication drives the running RADIUS auth server (backed by
// PostgreSQL) with a real PAP Access-Request and asserts Accept/Reject outcomes.
// It is intentionally serial (no t.Parallel) because the RADIUS plugin registry
// and rate limiter are process-global shared state.
func TestRadiusPAPAuthentication(t *testing.T) {
	const secret = "it-radius-secret"
	suffix := uniqueSuffix()
	nasIP := uniqueNASIP()
	nasID := "it-nas-" + suffix

	nas := &domain.NetNas{
		ID:         common.UUIDint64(),
		Identifier: nasID,
		Ipaddr:     nasIP,
		Secret:     secret,
		VendorCode: "0",
		Status:     common.ENABLED,
	}
	require.NoError(t, h.appCtx.DB().Create(nas).Error)

	profileID := seedProfile(t, "it-radius-profile-"+suffix)
	username := "it-radius-" + suffix
	const password = "radius-Pw-123"
	user := &domain.RadiusUser{
		ID:         common.UUIDint64(),
		ProfileId:  profileID,
		Username:   username,
		Password:   password,
		Status:     common.ENABLED,
		ExpireTime: time.Now().AddDate(1, 0, 0),
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}
	require.NoError(t, h.appCtx.DB().Create(user).Error)

	serverAddr := fmt.Sprintf("127.0.0.1:%d", h.cfg.Radiusd.AuthPort)

	t.Run("accept valid credentials", func(t *testing.T) {
		resp := exchange(t, serverAddr, secret, username, password, nasID, nasIP)
		assert.Equalf(t, radius.CodeAccessAccept, resp.Code, "expected Access-Accept, got %v", resp.Code)
		releaseIntegrationAuthRateLimit(username)
	})

	t.Run("reject wrong password", func(t *testing.T) {
		resp := exchange(t, serverAddr, secret, username, "wrong-password", nasID, nasIP)
		assert.Equalf(t, radius.CodeAccessReject, resp.Code, "expected Access-Reject, got %v", resp.Code)
		releaseIntegrationAuthRateLimit(username)
	})
}

func TestRadiusAuthenticationSelectsTenantFromNASBeforeUserLookup(t *testing.T) {
	db := h.appCtx.DB()
	suffix := uniqueSuffix()
	username := "shared-radius-user-" + suffix
	serverAddr := fmt.Sprintf("127.0.0.1:%d", h.cfg.Radiusd.AuthPort)
	type tenantAuth struct {
		id                                int64
		sourceIP, nasID, secret, password string
	}
	configs := make([]tenantAuth, 0, 2)
	for _, label := range []string{"a", "b"} {
		tenant := domain.Tenant{Name: "RADIUS tenant " + label, Slug: fmt.Sprintf("it-radius-tenant-%s-%d", label, common.UUIDint64()), Kind: "isp", Status: "active"}
		require.NoError(t, db.Create(&tenant).Error)
		tenantDB := db.WithContext(tenancy.WithTenantID(t.Context(), tenant.ID))
		sourceIP := uniqueNASIP()
		nasID, secret, password := "nas-"+label+"-"+suffix, "nas-secret-"+label+"-"+suffix, "tenant-password-"+label
		nas := domain.NetNas{ID: common.UUIDint64(), Identifier: nasID, Ipaddr: sourceIP, Secret: secret, VendorCode: "0", Status: common.ENABLED}
		require.NoError(t, tenantDB.Create(&nas).Error)
		profile := domain.RadiusProfile{ID: common.UUIDint64(), Name: "Tenant profile " + label + " " + suffix, Status: common.ENABLED}
		require.NoError(t, tenantDB.Create(&profile).Error)
		user := domain.RadiusUser{ID: common.UUIDint64(), ProfileId: profile.ID, Username: username, Password: password, Status: common.ENABLED, ExpireTime: time.Now().AddDate(1, 0, 0)}
		require.NoError(t, tenantDB.Create(&user).Error)
		configs = append(configs, tenantAuth{id: tenant.ID, sourceIP: sourceIP, nasID: nasID, secret: secret, password: password})
	}

	for _, tenant := range configs {
		resp := exchange(t, serverAddr, tenant.secret, username, tenant.password, tenant.nasID, tenant.sourceIP)
		require.Equalf(t, radius.CodeAccessAccept, resp.Code, "NAS for tenant %s should authenticate its own duplicate username", tenant.id)
		h.radiusSvc.ReleaseAuthRateLimitForTenant(tenant.id, username)
	}

	for index := range configs {
		other := configs[(index+1)%len(configs)]
		wrongCredential := configs[index]
		resp := exchange(t, serverAddr, other.secret, username, wrongCredential.password, other.nasID, other.sourceIP)
		require.Equalf(t, radius.CodeAccessReject, resp.Code, "credentials from another tenant must not authenticate at NAS %s", other.nasID)
		h.radiusSvc.ReleaseAuthRateLimitForTenant(other.id, username)
	}
}

// exchange sends a single PAP Access-Request with a bounded timeout so a stuck
// server fails the test fast instead of hanging.
func exchange(t *testing.T, serverAddr, secret, username, password, nasID, nasIP string) *radius.Packet {
	t.Helper()
	packet := radius.New(radius.CodeAccessRequest, []byte(secret))
	_ = rfc2865.UserName_SetString(packet, username)
	_ = rfc2865.UserPassword_SetString(packet, password)
	_ = rfc2865.NASIdentifier_SetString(packet, nasID)
	_ = rfc2865.NASIPAddress_Set(packet, net.ParseIP(nasIP))

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := exchangeFromNAS(ctx, packet, serverAddr, nasIP)
	require.NoError(t, err)
	return resp
}
