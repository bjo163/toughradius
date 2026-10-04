package app

import (
	"testing"

	"os"
	"path/filepath"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/talkincode/toughradius/v9/config"
	"github.com/talkincode/toughradius/v9/internal/domain"
	"github.com/talkincode/toughradius/v9/pkg/common"
	"gorm.io/gorm"
)

func newTestApplication(t *testing.T) *Application {
	t.Helper()

	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)

	require.NoError(t, db.AutoMigrate(domain.Tables...))

	return &Application{
		gormDB: db,
		appConfig: &config.AppConfig{
			System: config.SysConfig{Workdir: t.TempDir(), Debug: true},
		},
	}
}

func TestIsWellKnownBootstrapPassword(t *testing.T) {
	assert.True(t, IsWellKnownBootstrapPassword(WellKnownBootstrapPassword))
	assert.False(t, IsWellKnownBootstrapPassword("unique-pass-123"))
	assert.False(t, IsWellKnownBootstrapPassword(""))
}

func TestFreshInstallSeedsSamplesOnce(t *testing.T) {
	app := newTestApplication(t)

	app.seedSamplesOnFreshInstall()
	var customers int64
	require.NoError(t, app.gormDB.Model(&domain.Customer{}).Count(&customers).Error)
	require.EqualValues(t, 6, customers)
	var packages int64
	require.NoError(t, app.gormDB.Model(&domain.InternetPackage{}).Count(&packages).Error)
	require.EqualValues(t, 3, packages)
	var sampleUser domain.RadiusUser
	require.NoError(t, app.gormDB.Where("username = ?", "demo-alice").First(&sampleUser).Error)
	require.Equal(t, "disabled", sampleUser.Status, "bootstrap sample credentials must not authenticate by default")

	// Startup after the initial seed must leave samples untouched.
	require.NoError(t, app.gormDB.Model(&sampleUser).Update("realname", "Operator edit").Error)
	app.seedSamplesOnFreshInstall()
	require.NoError(t, app.gormDB.First(&sampleUser, sampleUser.ID).Error)
	require.Equal(t, "Operator edit", sampleUser.Realname)
}

func TestFreshInstallSeedingSkipsExistingInstallation(t *testing.T) {
	app := newTestApplication(t)
	require.NoError(t, app.gormDB.Create(&domain.NetNode{Name: "operator-node"}).Error)

	app.seedSamplesOnFreshInstall()
	var customers int64
	require.NoError(t, app.gormDB.Model(&domain.Customer{}).Count(&customers).Error)
	require.Zero(t, customers)
}

func TestFreshInstallSeedingIgnoresBootstrapAdminAndAutoNode(t *testing.T) {
	app := newTestApplication(t)
	require.NoError(t, app.gormDB.Create(&domain.SysOpr{ID: common.UUIDint64(), Username: "admin", Level: "super", Status: common.ENABLED}).Error)
	require.NoError(t, app.gormDB.Create(&domain.NetNode{ID: AutoRegisterPopNodeId, Name: "default"}).Error)

	app.seedSamplesOnFreshInstall()
	var customers int64
	require.NoError(t, app.gormDB.Model(&domain.Customer{}).Count(&customers).Error)
	require.EqualValues(t, 6, customers, "bootstrap-only records must not prevent samples on an otherwise empty install")
}

func TestCheckSuperCreatesBootstrapAdmin(t *testing.T) {
	app := newTestApplication(t)

	app.checkSuper()

	var admin domain.SysOpr
	err := app.gormDB.Where("username = ?", "admin").First(&admin).Error
	require.NoError(t, err)

	assert.Equal(t, "super", admin.Level)
	assert.Equal(t, common.ENABLED, admin.Status)
	assert.NotEmpty(t, admin.Password)
	assert.True(t, common.VerifyPassword(WellKnownBootstrapPassword, admin.Password))
}

func TestCheckSuperUsesEnvPasswordOnCreation(t *testing.T) {
	t.Setenv(AdminPasswordEnv, "EnvPass123")
	app := newTestApplication(t)

	app.checkSuper()

	var admin domain.SysOpr
	require.NoError(t, app.gormDB.Where("username = ?", "admin").First(&admin).Error)
	assert.True(t, common.VerifyPassword("EnvPass123", admin.Password))
}

func TestCheckSuperUsesAdminEnvPasswordOnCreation(t *testing.T) {
	t.Setenv(AdminPasswordEnv, WellKnownBootstrapPassword)
	app := newTestApplication(t)

	app.checkSuper()

	var admin domain.SysOpr
	require.NoError(t, app.gormDB.Where("username = ?", "admin").First(&admin).Error)
	assert.True(t, common.VerifyPassword(WellKnownBootstrapPassword, admin.Password))
	assert.NotEmpty(t, admin.Password)
}

func TestCheckSuperDoesNotReenableOrPromote(t *testing.T) {
	app := newTestApplication(t)
	password, err := common.HashPassword("CustomPass123")
	require.NoError(t, err)
	require.NoError(t, app.gormDB.Create(&domain.SysOpr{
		ID:       common.UUIDint64(),
		Username: "admin",
		Password: password,
		Level:    "operator",
		Status:   common.DISABLED,
	}).Error)

	app.checkSuper()

	var admin domain.SysOpr
	require.NoError(t, app.gormDB.Where("username = ?", "admin").First(&admin).Error)
	assert.Equal(t, "operator", admin.Level)
	assert.Equal(t, common.DISABLED, admin.Status)
	assert.True(t, common.VerifyPassword("CustomPass123", admin.Password))
}

func TestCheckSuperPreservesBootstrapPassword(t *testing.T) {
	app := newTestApplication(t)
	password, err := common.HashPassword(WellKnownBootstrapPassword)
	require.NoError(t, err)
	require.NoError(t, app.gormDB.Create(&domain.SysOpr{ID: common.UUIDint64(), Username: defaultSuperUsername, Password: password, Level: "super", Status: common.ENABLED}).Error)
	t.Setenv(AdminPasswordEnv, "ChangedBootstrap123")

	app.checkSuper()

	var admin domain.SysOpr
	require.NoError(t, app.gormDB.Where("username = ?", defaultSuperUsername).First(&admin).Error)
	assert.True(t, common.VerifyPassword(WellKnownBootstrapPassword, admin.Password))
}
func TestCheckSuperRotatesEmptyPassword(t *testing.T) {
	app := newTestApplication(t)
	require.NoError(t, app.gormDB.Create(&domain.SysOpr{
		ID:       common.UUIDint64(),
		Username: "admin",
		Password: "",
		Level:    "operator",
		Status:   common.DISABLED,
	}).Error)

	app.checkSuper()

	var admin domain.SysOpr
	require.NoError(t, app.gormDB.Where("username = ?", "admin").First(&admin).Error)
	assert.Equal(t, "operator", admin.Level)
	assert.Equal(t, common.DISABLED, admin.Status)
	assert.NotEmpty(t, admin.Password)
	assert.True(t, common.VerifyPassword(WellKnownBootstrapPassword, admin.Password))
}

func TestCheckSuperDoesNotCreateWhenOtherSuperExists(t *testing.T) {
	app := newTestApplication(t)
	password, err := common.HashPassword("RootPass123")
	require.NoError(t, err)
	require.NoError(t, app.gormDB.Create(&domain.SysOpr{
		ID:       common.UUIDint64(),
		Username: "root",
		Password: password,
		Level:    "super",
		Status:   common.ENABLED,
	}).Error)

	app.checkSuper()

	var count int64
	require.NoError(t, app.gormDB.Model(&domain.SysOpr{}).Where("username = ?", "admin").Count(&count).Error)
	assert.Zero(t, count)
}

func TestCheckSuperUsesDefaultPasswordWithoutWritingFile(t *testing.T) {
	app := newTestApplication(t)
	app.checkSuper()

	var admin domain.SysOpr
	require.NoError(t, app.gormDB.Where("username = ?", "admin").First(&admin).Error)
	assert.True(t, common.VerifyPassword("admin", admin.Password))
	_, err := os.Stat(app.bootstrapPasswordFile())
	assert.True(t, os.IsNotExist(err))
}

func TestCheckSuperPreservesPreviousGeneratedBootstrapPassword(t *testing.T) {
	app := newTestApplication(t)
	legacyPassword := "OldGenerated98765"
	hashed, err := common.HashPassword(legacyPassword)
	require.NoError(t, err)
	require.NoError(t, app.gormDB.Create(&domain.SysOpr{
		ID: common.UUIDint64(), Username: defaultSuperUsername, Password: hashed,
		Level: "super", Status: common.ENABLED,
	}).Error)
	path := app.bootstrapPasswordFile()
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o700))
	require.NoError(t, os.WriteFile(path, []byte(legacyPassword+"\n"), 0o600))

	app.checkSuper()

	var admin domain.SysOpr
	require.NoError(t, app.gormDB.Where("username = ?", defaultSuperUsername).First(&admin).Error)
	assert.True(t, common.VerifyPassword(legacyPassword, admin.Password))
}

func TestCheckSuperEnvPassword(t *testing.T) {
	t.Setenv(AdminPasswordEnv, "EnvPass123")
	app := newTestApplication(t)
	app.checkSuper()

	var admin domain.SysOpr
	require.NoError(t, app.gormDB.Where("username = ?", "admin").First(&admin).Error)
	assert.True(t, common.VerifyPassword("EnvPass123", admin.Password))
}
