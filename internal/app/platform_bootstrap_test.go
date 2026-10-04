package app

import (
	"testing"

	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/pkg/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestPlatformAdminBootstrapRequiresExplicitCredentials(t *testing.T) {
	t.Setenv("MWX_PLATFORM_ADMIN_USERNAME", "")
	t.Setenv("MWX_PLATFORM_ADMIN_PASSWORD", "")
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&domain.Tenant{}, &domain.SysOpr{}))
	app := &Application{gormDB: db}
	require.NoError(t, app.bootstrapPlatformAdminFromEnvironment())
	var count int64
	require.NoError(t, db.Model(&domain.SysOpr{}).Count(&count).Error)
	require.Zero(t, count)
}

func TestPlatformAdminBootstrapCreatesAndDoesNotResetPassword(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&domain.Tenant{}, &domain.SysOpr{}))
	app := &Application{gormDB: db}
	t.Setenv("MWX_PLATFORM_ADMIN_USERNAME", "deployment-owner")
	t.Setenv("MWX_PLATFORM_ADMIN_PASSWORD", "Platform-password-2026")
	require.NoError(t, app.bootstrapPlatformAdminFromEnvironment())
	var operator domain.SysOpr
	require.NoError(t, db.Where("username = ?", "deployment-owner").First(&operator).Error)
	require.True(t, operator.PlatformAdmin)
	require.Equal(t, domain.DefaultTenantID, operator.TenantID)
	require.True(t, common.VerifyPassword("Platform-password-2026", operator.Password))

	t.Setenv("MWX_PLATFORM_ADMIN_PASSWORD", "Different-password-2026")
	require.Error(t, app.bootstrapPlatformAdminFromEnvironment(), "a changed environment password must not silently rotate an existing account")
	require.NoError(t, db.First(&operator, operator.ID).Error)
	require.True(t, common.VerifyPassword("Platform-password-2026", operator.Password))

	t.Setenv("MWX_PLATFORM_ADMIN_USERNAME", "")
	t.Setenv("MWX_PLATFORM_ADMIN_PASSWORD", "")
	require.NoError(t, app.bootstrapPlatformAdminFromEnvironment())
	require.NoError(t, db.First(&operator, operator.ID).Error)
	require.False(t, operator.PlatformAdmin, "removing bootstrap credentials must revoke the deployment platform role")
}
