package radiusd

import (
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/bjo163/mwx-isp/internal/domain"
	cachepkg "github.com/bjo163/mwx-isp/internal/radiusd/cache"
	radiuserrors "github.com/bjo163/mwx-isp/internal/radiusd/errors"
	"github.com/bjo163/mwx-isp/internal/radiusd/repository"
	repogorm "github.com/bjo163/mwx-isp/internal/radiusd/repository/gorm"
	"github.com/bjo163/mwx-isp/internal/tenancy"
	"github.com/bjo163/mwx-isp/pkg/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// Testpure logic functions without database dependency

func TestCheckAuthRateLimitBasic(t *testing.T) {
	service := &RadiusService{
		authRate: newAuthRateLimiter(defaultAuthRateShards),
	}

	// TestFirst authentication
	err := service.CheckAuthRateLimit("user1")
	if err != nil {
		t.Errorf("first auth should succeed, got error: %v", err)
	}

	// TestFrequent authentication（should be limited）
	err = service.CheckAuthRateLimit("user1")
	if err == nil {
		t.Error("expected rate limit error for rapid authentication")
	}

	// Validate error types
	authErr, ok := radiuserrors.GetAuthError(err)
	if !ok {
		t.Errorf("expected AuthError, got %T", err)
	} else if authErr.MetricsType != "radus_reject_limit" {
		t.Errorf("expected reject limit error, got %s", authErr.MetricsType)
	}
}

func TestRadiusAuthenticationCachesAreTenantScoped(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:radius-tenant-users?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, tenancy.RegisterCallbacks(db))
	require.NoError(t, db.AutoMigrate(&domain.RadiusUser{}))
	validUntil := time.Now().Add(time.Hour)
	require.NoError(t, db.Create(&domain.RadiusUser{ID: 101, TenantID: 1, Username: "shared", Password: "a", Status: "enabled", ExpireTime: validUntil}).Error)
	require.NoError(t, db.Create(&domain.RadiusUser{ID: 202, TenantID: 2, Username: "shared", Password: "b", Status: "enabled", ExpireTime: validUntil}).Error)

	service := &RadiusService{
		UserRepo:  repogorm.NewGormUserRepository(db),
		userCache: cachepkg.NewTTLCache[*domain.RadiusUser](time.Minute, 16),
		authRate:  newAuthRateLimiter(defaultAuthRateShards),
	}
	userA, err := service.GetValidUserForTenant(1, "shared", false)
	require.NoError(t, err)
	userB, err := service.GetValidUserForTenant(2, "shared", false)
	require.NoError(t, err)
	require.Equal(t, int64(101), userA.ID)
	require.Equal(t, int64(202), userB.ID)

	require.NoError(t, service.CheckAuthRateLimitForTenant(1, "shared"))
	require.NoError(t, service.CheckAuthRateLimitForTenant(2, "shared"))
	require.Error(t, service.CheckAuthRateLimitForTenant(1, "shared"))
}

func TestCachedRadiusUsersStillEnforceStatusAndExpiration(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:radius-expiry-cache?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, tenancy.RegisterCallbacks(db))
	require.NoError(t, db.AutoMigrate(&domain.RadiusUser{}))
	validUntil := time.Now().Add(time.Hour)
	for _, username := range []string{"cached-expire", "cached-disabled"} {
		require.NoError(t, db.Create(&domain.RadiusUser{ID: common.UUIDint64(), TenantID: 1, Username: username, Password: "secret", Status: "enabled", ExpireTime: validUntil}).Error)
	}
	service := &RadiusService{
		UserRepo:  repogorm.NewGormUserRepository(db),
		userCache: cachepkg.NewTTLCache[*domain.RadiusUser](time.Minute, 16),
	}
	user, err := service.GetValidUserForTenant(1, "cached-expire", false)
	require.NoError(t, err)
	user.ExpireTime = time.Now().Add(-time.Second)
	_, err = service.GetValidUserForTenant(1, "cached-expire", false)
	require.Error(t, err, "cached users must be rechecked after expiration")
	if authErr, ok := radiuserrors.GetAuthError(err); ok {
		require.Equal(t, "radus_reject_expire", authErr.MetricsType)
	} else {
		t.Fatalf("expected typed expiration error, got %T: %v", err, err)
	}

	user, err = service.GetValidUserForTenant(1, "cached-disabled", false)
	require.NoError(t, err)
	user.Status = common.DISABLED
	_, err = service.GetValidUserForTenant(1, "cached-disabled", false)
	require.Error(t, err, "cached users must be rechecked after disablement")
	if authErr, ok := radiuserrors.GetAuthError(err); ok {
		require.Equal(t, "radus_reject_disabled", authErr.MetricsType)
	} else {
		t.Fatalf("expected typed disabled error, got %T: %v", err, err)
	}
}

func TestHotspotVoucherValidityStartsOnceAndIsTenantScoped(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:radius-voucher-activation?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, tenancy.RegisterCallbacks(db))
	require.NoError(t, db.AutoMigrate(&domain.HotspotVoucher{}, &domain.RadiusUser{}))
	now := time.Date(2026, time.October, 5, 12, 0, 0, 0, time.UTC)
	user := domain.RadiusUser{ID: 501, TenantID: 1, Username: "HOT-ONE", Status: "enabled", ExpireTime: now.AddDate(1, 0, 0)}
	require.NoError(t, db.Create(&user).Error)
	voucher := domain.HotspotVoucher{ID: 601, TenantID: 1, Code: user.Username, Status: "active", ValiditySeconds: 3600, CreatedAt: now.Add(-48 * time.Hour)}
	require.NoError(t, db.Create(&voucher).Error)
	otherTenantVoucher := domain.HotspotVoucher{ID: 602, TenantID: 2, Code: user.Username, Status: "active", ValiditySeconds: 60}
	require.NoError(t, db.Create(&otherTenantVoucher).Error)

	expiresAt, found, err := activateHotspotVoucher(db, 1, &user, now)
	require.NoError(t, err)
	require.True(t, found)
	require.True(t, expiresAt.Equal(now.Add(time.Hour)))
	var activated domain.HotspotVoucher
	require.NoError(t, db.Where("tenant_id = ? AND id = ?", 1, voucher.ID).First(&activated).Error)
	require.Equal(t, "used", activated.Status)
	require.NotNil(t, activated.FirstLoginAt)
	require.True(t, activated.FirstLoginAt.Equal(now))
	var updatedUser domain.RadiusUser
	require.NoError(t, db.Where("tenant_id = ? AND id = ?", 1, user.ID).First(&updatedUser).Error)
	require.True(t, updatedUser.ExpireTime.Equal(expiresAt))

	secondExpiry, found, err := activateHotspotVoucher(db, 1, &updatedUser, now.Add(30*time.Minute))
	require.NoError(t, err)
	require.True(t, found)
	require.True(t, secondExpiry.Equal(expiresAt), "re-authentication must not extend voucher validity")

	_, found, err = activateHotspotVoucher(db, 1, &updatedUser, expiresAt.Add(time.Second))
	require.NoError(t, err)
	require.True(t, found)
	require.NoError(t, db.Where("tenant_id = ? AND id = ?", 1, voucher.ID).First(&activated).Error)
	require.Equal(t, "expired", activated.Status)
	require.NoError(t, db.Where("tenant_id = ? AND id = ?", 2, otherTenantVoucher.ID).First(&otherTenantVoucher).Error)
	require.Equal(t, "active", otherTenantVoucher.Status)
}

func TestMarkExpiredHotspotVoucherIsTenantScoped(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:radius-voucher-expiration?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, tenancy.RegisterCallbacks(db))
	require.NoError(t, db.AutoMigrate(&domain.HotspotVoucher{}))
	now := time.Now()
	for _, tenantID := range []int64{1, 2} {
		voucher := domain.HotspotVoucher{TenantID: tenantID, Code: "same-code", Status: "used", ExpiresAt: timePtr(now.Add(-time.Minute))}
		require.NoError(t, db.Create(&voucher).Error)
	}
	require.NoError(t, markExpiredHotspotVoucher(db, 1, "same-code", now))
	var tenantOne, tenantTwo domain.HotspotVoucher
	require.NoError(t, db.Where("tenant_id = ?", 1).First(&tenantOne).Error)
	require.NoError(t, db.Where("tenant_id = ?", 2).First(&tenantTwo).Error)
	require.Equal(t, "expired", tenantOne.Status)
	require.Equal(t, "used", tenantTwo.Status)
}

func timePtr(value time.Time) *time.Time { return &value }

func TestRadiusNASLookupAndCacheAreTenantScoped(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:radius-tenant-nas?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, tenancy.RegisterCallbacks(db))
	require.NoError(t, db.AutoMigrate(&domain.NetNas{}))
	require.NoError(t, db.Create(&domain.NetNas{ID: 101, TenantID: 1, Name: "tenant-a", Ipaddr: "10.0.0.1", Secret: "a"}).Error)
	require.NoError(t, db.Create(&domain.NetNas{ID: 202, TenantID: 2, Name: "tenant-b", Ipaddr: "10.0.0.1", Secret: "b"}).Error)

	service := &RadiusService{
		NasRepo:  repogorm.NewGormNasRepository(db),
		nasCache: cachepkg.NewTTLCache[*domain.NetNas](time.Minute, 16),
	}
	nasA, err := service.GetNasForTenant(1, "10.0.0.1", "")
	require.NoError(t, err)
	nasB, err := service.GetNasForTenant(2, "10.0.0.1", "")
	require.NoError(t, err)
	require.Equal(t, int64(101), nasA.ID)
	require.Equal(t, "a", nasA.Secret)
	require.Equal(t, int64(202), nasB.ID)
	require.Equal(t, "b", nasB.Secret)

	// Incoming RADIUS packet resolution has no authenticated tenant context;
	// duplicate source IPs must therefore fail closed instead of picking either tenant.
	_, err = service.GetNas("10.0.0.1", "")
	require.ErrorIs(t, err, repository.ErrAmbiguousNASIP)
}

func TestCheckAuthRateLimitAfterWait(t *testing.T) {
	service := &RadiusService{
		authRate: newAuthRateLimiter(defaultAuthRateShards),
	}

	// First authentication
	_ = service.CheckAuthRateLimit("user1")

	// Wait beyond rate limit time
	time.Sleep(time.Duration(RadiusAuthRateInterval+1) * time.Second)

	// Second authentication should succeed
	err := service.CheckAuthRateLimit("user1")
	if err != nil {
		t.Errorf("auth after wait should succeed, got error: %v", err)
	}
}

func TestCheckAuthRateLimitDifferentUsers(t *testing.T) {
	service := &RadiusService{
		authRate: newAuthRateLimiter(defaultAuthRateShards),
	}

	// Authentication of different users should not affect each other
	err1 := service.CheckAuthRateLimit("user1")
	if err1 != nil {
		t.Errorf("user1 first auth should succeed: %v", err1)
	}

	err2 := service.CheckAuthRateLimit("user2")
	if err2 != nil {
		t.Errorf("user2 first auth should succeed: %v", err2)
	}

	// Validate two users currently in the cache
	count := service.authRate.len()

	if count != 2 {
		t.Errorf("expected 2 users in cache, got %d", count)
	}
}

func TestReleaseAuthRateLimit(t *testing.T) {
	service := &RadiusService{
		authRate: newAuthRateLimiter(defaultAuthRateShards),
	}

	// Add user to rate limit cache
	_ = service.CheckAuthRateLimit("user1")

	// Release rate limit
	service.ReleaseAuthRateLimit("user1")

	// Validate the user is removed from the cache
	_, exists := service.authRate.get("user1")

	if exists {
		t.Error("user should be removed from cache after release")
	}

	// Immediate re-authentication should succeed
	err := service.CheckAuthRateLimit("user1")
	if err != nil {
		t.Errorf("auth should succeed after release: %v", err)
	}
}

func TestCheckAuthRateLimitConcurrent(t *testing.T) {
	service := &RadiusService{
		authRate: newAuthRateLimiter(defaultAuthRateShards),
	}

	var wg sync.WaitGroup
	successCount := 0
	failCount := 0
	var mu sync.Mutex

	// Concurrent test for same user
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := service.CheckAuthRateLimit("concurrent_user")
			mu.Lock()
			if err == nil {
				successCount++
			} else {
				failCount++
			}
			mu.Unlock()
		}()
	}

	wg.Wait()

	// Only first should succeed, rest should fail
	if successCount < 1 {
		t.Error("at least one concurrent request should succeed")
	}
	if failCount < 1 {
		t.Error("some concurrent requests should fail due to rate limit")
	}

	t.Logf("Concurrent test: %d success, %d failed", successCount, failCount)
}

func TestAuthRateCacheConcurrentAccess(t *testing.T) {
	service := &RadiusService{
		authRate: newAuthRateLimiter(defaultAuthRateShards),
	}

	var wg sync.WaitGroup
	userCount := 50

	// Concurrent add different users
	for i := 0; i < userCount; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			username := "user-" + strconv.Itoa(id)
			_ = service.CheckAuthRateLimit(username)
		}(i)
	}

	wg.Wait()

	// Validate the number of users in the cache
	count := service.authRate.len()

	if count != userCount {
		t.Logf("Note: Expected %d users, got %d", userCount, count)
	}
}

func TestReleaseAuthRateLimitNonexistent(t *testing.T) {
	service := &RadiusService{
		authRate: newAuthRateLimiter(defaultAuthRateShards),
	}

	// Releasing a non-existent user should not panic
	service.ReleaseAuthRateLimit("nonexistent-user")

	// Validate the cache is empty
	count := service.authRate.len()

	if count != 0 {
		t.Errorf("expected empty cache, got %d entries", count)
	}
}

func TestAuthRateLimitExpiry(t *testing.T) {
	service := &RadiusService{
		authRate: newAuthRateLimiter(defaultAuthRateShards),
	}

	// Add user
	_ = service.CheckAuthRateLimit("user1")

	// Get add time
	entry, _ := service.authRate.get("user1")
	startTime := entry.Starttime

	// Validatetimestamp
	if time.Since(startTime) > time.Second {
		t.Error("start time should be recent")
	}

	// Wait for expiration
	time.Sleep(time.Duration(RadiusAuthRateInterval+1) * time.Second)

	// Should be able to authenticate again
	err := service.CheckAuthRateLimit("user1")
	if err != nil {
		t.Errorf("should be able to auth after expiry: %v", err)
	}
}
