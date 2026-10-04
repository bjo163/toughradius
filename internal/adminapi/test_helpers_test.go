package adminapi

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/bjo163/mwx-isp/config"
	"github.com/bjo163/mwx-isp/internal/app"
	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/internal/tenancy"
	"github.com/bjo163/mwx-isp/pkg/common"
	customValidator "github.com/bjo163/mwx-isp/pkg/validator"
	"github.com/glebarez/sqlite"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// init wires the test-only operator-resolution seam so that tests can inject an
// authenticated operator by calling c.Set("current_operator", op). This runs
// only in the test binary; the production build leaves testOperatorResolver nil
// and therefore never trusts a context-injected operator.
func init() {
	testOperatorResolver = func(c echo.Context) (*domain.SysOpr, bool) {
		op, ok := c.Get("current_operator").(*domain.SysOpr)
		if !ok || op == nil {
			return nil, false
		}
		return op, true
	}
}

// setupTestEcho creates an Echo instance with a validator
func setupTestEcho() *echo.Echo {
	e := echo.New()
	e.Validator = customValidator.NewValidator()
	return e
}

// setupTestDB creates an in-memory test database
func setupTestDB(t *testing.T) *gorm.DB {
	dbName := fmt.Sprintf("file:%s-%d?mode=memory&cache=shared", t.Name(), common.UUIDint64())
	db, err := gorm.Open(sqlite.Open(dbName), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, tenancy.RegisterCallbacks(db))

	// Automatically migrate common tables
	err = db.AutoMigrate(
		&domain.Tenant{},
		&domain.RadiusProfile{},
		&domain.RadiusUser{},
		&domain.NetNode{},
		&domain.NetNas{},
		&domain.RadiusAccounting{},
		&domain.RadiusOnline{},
		&domain.RadiusSessionActionAudit{},
		&domain.SysOpr{},
		&domain.SysConfig{},
		&domain.SysCert{},
	)
	require.NoError(t, err)
	require.NoError(t, db.Create(&domain.Tenant{
		ID: domain.DefaultTenantID, Name: "Default ISP", Slug: "default", Kind: "isp", Status: "active",
	}).Error)

	return db
}

// setupTestApp creates a test application context and sets it globally
// Returns: app context for injecting into echo context
func setupTestApp(_ *testing.T, db *gorm.DB) app.AppContext {
	cfg := &config.AppConfig{
		System: config.SysConfig{
			Appid:    "TestApp",
			Location: "Asia/Shanghai",
			Workdir:  "/tmp/toughradius-test",
			Debug:    true,
		},
		Web: config.WebConfig{
			Secret: "test-secret-key-for-jwt",
		},
		Database: config.DBConfig{
			Type: "sqlite",
			Name: ":memory:",
		},
	}

	// Create application but don't call Init() which would create a new DB
	testApp := app.NewApplication(cfg)
	testApp.Init(cfg)
	testApp.OverrideDB(db)

	return testApp
}

// CreateTestAppContext creates a test application context with an in-memory SQLite database
// Returns: db, echo instance, and app context
func CreateTestAppContext(t *testing.T) (*gorm.DB, *echo.Echo, app.AppContext) {
	cfg := &config.AppConfig{
		System: config.SysConfig{
			Location: "Asia/Shanghai",
			Workdir:  "/tmp/toughradius-test",
		},
		Database: config.DBConfig{
			Type: "sqlite",
			Name: ":memory:",
		},
		Web: config.WebConfig{
			Secret: "test-secret-key-for-jwt",
		},
	}

	testApp := app.NewApplication(cfg)
	testApp.Init(cfg)

	// Keep endpoint fixtures isolated from first-install application defaults.
	db := setupTestDB(t)
	testApp.OverrideDB(db)

	e := setupTestEcho()

	return db, e, testApp
}

// CreateTestContext creates an echo context with appCtx injected
func CreateTestContext(e *echo.Echo, db *gorm.DB, req *http.Request, rec *httptest.ResponseRecorder, appCtx app.AppContext) echo.Context {
	c := e.NewContext(req, rec)
	c.Set("appCtx", appCtx)
	c.Set("db", db)
	// Inject a default super admin for tests that require authentication
	c.Set("current_operator", &domain.SysOpr{
		ID:       1,
		Username: "superadmin",
		Level:    "super",
		Status:   "enabled",
	})
	return c
}

// CreateTestContextWithApp is a helper that combines setupTestEcho, setupTestDB, and setupTestApp
// for backward compatibility with existing tests
func CreateTestContextWithApp(t *testing.T, req *http.Request, rec *httptest.ResponseRecorder) (echo.Context, *gorm.DB, app.AppContext) {
	e := setupTestEcho()
	db := setupTestDB(t)
	appCtx := setupTestApp(t, db)
	c := CreateTestContext(e, db, req, rec, appCtx)
	return c, db, appCtx
}
