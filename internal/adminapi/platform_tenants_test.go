package adminapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/pkg/common"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"
)

func TestPlatformTenantCreationRequiresPlatformAdminAndCreatesInitialOperator(t *testing.T) {
	db := setupTestDB(t)
	appCtx := setupTestApp(t, db)

	request := func(platform bool) (*httptest.ResponseRecorder, error) {
		e := setupTestEcho()
		req := httptest.NewRequest(http.MethodPost, "/platform/tenants", strings.NewReader(`{"name":"North ISP","slug":"north-isp","kind":"isp","company_name":"North Networks","admin_username":"northadmin","admin_password":"A-strong-password-2026"}`))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		c := CreateTestContext(e, db, req, rec, appCtx)
		c.Set("current_operator", &domain.SysOpr{ID: 1, TenantID: domain.DefaultTenantID, Username: "platform", Level: LevelSuper, Status: common.ENABLED, PlatformAdmin: platform})
		handler := requirePlatformAdmin()(createPlatformTenant)
		return rec, handler(c)
	}

	denied, err := request(false)
	require.NoError(t, err)
	require.Equal(t, http.StatusForbidden, denied.Code)
	var count int64
	require.NoError(t, db.Model(&domain.Tenant{}).Where("slug = ?", "north-isp").Count(&count).Error)
	require.Zero(t, count, "tenant super operators without platform_admin must not create tenants")

	created, err := request(true)
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, created.Code, created.Body.String())
	var tenant domain.Tenant
	require.NoError(t, db.Where("slug = ?", "north-isp").First(&tenant).Error)
	require.Equal(t, "North Networks", tenant.CompanyName)
	var operator domain.SysOpr
	require.NoError(t, db.Where("tenant_id = ? AND username = ?", tenant.ID, "northadmin").First(&operator).Error)
	require.Equal(t, LevelSuper, operator.Level)
	require.True(t, common.VerifyPassword("A-strong-password-2026", operator.Password))
}

func TestCreatePlatformTenantRejectsWeakCredentials(t *testing.T) {
	db := setupTestDB(t)
	appCtx := setupTestApp(t, db)
	e := setupTestEcho()
	req := httptest.NewRequest(http.MethodPost, "/platform/tenants", strings.NewReader(`{"name":"Weak","slug":"weak","kind":"rtrw","admin_username":"ab","admin_password":"short"}`))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := CreateTestContext(e, db, req, rec, appCtx)
	c.Set("current_operator", &domain.SysOpr{ID: 1, TenantID: domain.DefaultTenantID, Level: LevelSuper, Status: common.ENABLED, PlatformAdmin: true})
	require.NoError(t, requirePlatformAdmin()(createPlatformTenant)(c))
	require.Equal(t, http.StatusBadRequest, rec.Code)
	var count int64
	require.NoError(t, db.Model(&domain.Tenant{}).Where("slug = ?", "weak").Count(&count).Error)
	require.Zero(t, count)

	var payload map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &payload))
}

func TestPlatformGlobalBackupIsDeniedToTenantSuper(t *testing.T) {
	db := setupTestDB(t)
	appCtx := setupTestApp(t, db)
	e := setupTestEcho()
	request := httptest.NewRequest(http.MethodGet, "/system/backup", nil)
	recorder := httptest.NewRecorder()
	c := CreateTestContext(e, db, request, recorder, appCtx)
	c.Set("current_operator", &domain.SysOpr{
		ID: 2, TenantID: 2, Username: "tenant-super", Level: LevelSuper,
		Status: common.ENABLED,
	})

	called := false
	err := requirePlatformAdmin()(func(echo.Context) error {
		called = true
		return nil
	})(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusForbidden, recorder.Code)
	require.False(t, called, "tenant-level super operators must not access installation-wide backup/restore")
}

func TestPlatformTenantUpdateCompanyIdentity(t *testing.T) {
	db := setupTestDB(t)
	appCtx := setupTestApp(t, db)
	tenant := domain.Tenant{Name: "Before", Slug: "before", Kind: "rtrw", Status: "active"}
	require.NoError(t, db.Create(&tenant).Error)
	e := setupTestEcho()
	body := `{"name":"After","company_name":"After Networks","tax_id":"ID-123","billing_address":"Jalan Utama 1","contact_email":"ops@example.test","contact_phone":"081234567890"}`
	req := httptest.NewRequest(http.MethodPut, "/platform/tenants/"+strconv.FormatInt(tenant.ID, 10), strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := CreateTestContext(e, db, req, rec, appCtx)
	c.SetParamNames("id")
	c.SetParamValues(strconv.FormatInt(tenant.ID, 10))
	c.Set("current_operator", &domain.SysOpr{ID: 1, TenantID: domain.DefaultTenantID, Level: LevelSuper, Status: common.ENABLED, PlatformAdmin: true})

	require.NoError(t, requirePlatformAdmin()(updatePlatformTenant)(c))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var updated domain.Tenant
	require.NoError(t, db.First(&updated, tenant.ID).Error)
	require.Equal(t, "After", updated.Name)
	require.Equal(t, "After Networks", updated.CompanyName)
	require.Equal(t, "ID-123", updated.TaxID)
	require.Equal(t, "Jalan Utama 1", updated.BillingAddress)
	require.Equal(t, "ops@example.test", updated.ContactEmail)
	require.Equal(t, "081234567890", updated.ContactPhone)
}

func TestPlatformTenantMembershipGrantAndRevocation(t *testing.T) {
	db := setupTestDB(t)
	appCtx := setupTestApp(t, db)
	tenant := domain.Tenant{Name: "Membership ISP", Slug: "membership-isp", Kind: "isp", Status: "active"}
	require.NoError(t, db.Create(&tenant).Error)
	actor := &domain.SysOpr{ID: 9001, TenantID: domain.DefaultTenantID, Username: "platform", Level: LevelSuper, Status: common.ENABLED, PlatformAdmin: true}
	makeContext := func(method, path, body string) echo.Context {
		e := setupTestEcho()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		if body != "" {
			req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		}
		rec := httptest.NewRecorder()
		ctx := CreateTestContext(e, db, req, rec, appCtx)
		ctx.Set("current_operator", actor)
		ctx.SetParamNames("id")
		ctx.SetParamValues(strconv.FormatInt(tenant.ID, 10))
		return ctx
	}

	created := makeContext(http.MethodPost, "/platform/tenants/"+strconv.FormatInt(tenant.ID, 10)+"/operators", `{"username":"isp-operator","password":"Strong-password-2026","level":"admin"}`)
	require.NoError(t, requirePlatformAdmin()(createPlatformTenantOperator)(created))
	require.Equal(t, http.StatusCreated, created.Response().Status)
	var operator domain.SysOpr
	require.NoError(t, db.Where("tenant_id = ? AND username = ?", tenant.ID, "isp-operator").First(&operator).Error)
	var membership domain.TenantMembership
	require.NoError(t, db.Where("tenant_id = ? AND operator_id = ?", tenant.ID, operator.ID).First(&membership).Error)
	require.Equal(t, LevelAdmin, membership.Level)
	require.Equal(t, common.ENABLED, membership.Status)

	loginBody, err := json.Marshal(map[string]string{"tenant_slug": tenant.Slug, "username": operator.Username, "password": "Strong-password-2026"})
	require.NoError(t, err)
	loginReq := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(string(loginBody)))
	loginReq.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	loginRec := httptest.NewRecorder()
	loginCtx := CreateTestContext(setupTestEcho(), db, loginReq, loginRec, appCtx)
	require.NoError(t, loginHandler(loginCtx))
	require.Equal(t, http.StatusOK, loginRec.Code, loginRec.Body.String())

	revoke := makeContext(http.MethodDelete, "/platform/tenants/"+strconv.FormatInt(tenant.ID, 10)+"/operators/"+strconv.FormatInt(operator.ID, 10), "")
	revoke.SetParamNames("id", "operator_id")
	revoke.SetParamValues(strconv.FormatInt(tenant.ID, 10), strconv.FormatInt(operator.ID, 10))
	require.NoError(t, requirePlatformAdmin()(revokePlatformTenantOperator)(revoke))
	require.Equal(t, http.StatusOK, revoke.Response().Status)
	require.NoError(t, db.Where("tenant_id = ? AND operator_id = ?", tenant.ID, operator.ID).First(&membership).Error)
	require.Equal(t, common.DISABLED, membership.Status)

	loginRec = httptest.NewRecorder()
	loginReq = httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(string(loginBody)))
	loginReq.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	loginCtx = CreateTestContext(setupTestEcho(), db, loginReq, loginRec, appCtx)
	require.NoError(t, loginHandler(loginCtx))
	require.Equal(t, http.StatusForbidden, loginRec.Code, "a revoked membership must reject future logins")
}
