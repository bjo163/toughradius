package adminapi

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"golang.org/x/time/rate"
	"gorm.io/gorm"

	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/internal/tenancy"
	"github.com/bjo163/mwx-isp/internal/webserver"
	"github.com/bjo163/mwx-isp/pkg/common"
)

const tokenTTL = 12 * time.Hour

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Tenant   string `json:"tenant_slug"`
}

type loginTenant struct {
	Name string `json:"name"`
	Slug string `json:"slug"`
	Kind string `json:"kind"`
}

// loginRateLimiter throttles authentication attempts per client IP to slow down
// brute-force / credential-stuffing attacks. It allows a short burst of attempts
// and then refills slowly; exhausting the budget yields HTTP 429.
func loginRateLimiter() echo.MiddlewareFunc {
	store := middleware.NewRateLimiterMemoryStoreWithConfig(middleware.RateLimiterMemoryStoreConfig{
		Rate:      rate.Every(3 * time.Second),
		Burst:     5,
		ExpiresIn: 3 * time.Minute,
	})
	return middleware.RateLimiterWithConfig(middleware.RateLimiterConfig{
		Store: store,
		IdentifierExtractor: func(c echo.Context) (string, error) {
			return c.RealIP(), nil
		},
		ErrorHandler: func(c echo.Context, err error) error {
			return fail(c, http.StatusForbidden, "RATE_LIMIT_ERROR", "Unable to evaluate rate limit", nil)
		},
		DenyHandler: func(c echo.Context, identifier string, err error) error {
			return fail(c, http.StatusTooManyRequests, "RATE_LIMITED",
				"Too many login attempts, please try again later", nil)
		},
	})
}

func registerAuthRoutes() {
	webserver.ApiPOST("/auth/login", loginHandler, loginRateLimiter())
	webserver.ApiGET("/auth/tenants", listLoginTenantsHandler)
	webserver.ApiGET("/auth/me", currentUserHandler)
}

func listLoginTenantsHandler(c echo.Context) error {
	var tenants []loginTenant
	err := GetDB(c).Model(&domain.Tenant{}).
		Select("name", "slug", "kind").
		Where("status = ?", "active").Order("name ASC, id ASC").Find(&tenants).Error
	if err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to list organizations", err.Error())
	}
	return ok(c, tenants)
}

func tenantContextMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if c.Get("user") == nil {
				// Public auth routes are skipped by JWT middleware. Protected routes
				// without a token have already been rejected before reaching here.
				return next(c)
			}
			operator, err := resolveOperatorFromContext(c)
			if err != nil {
				return fail(c, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required", nil)
			}
			c.Set("authenticated_operator", operator)
			return next(c)
		}
	}
}

func loginHandler(c echo.Context) error {
	var req loginRequest
	if err := c.Bind(&req); err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Unable to parse login parameters", nil)
	}
	req.Username = strings.TrimSpace(req.Username)
	req.Password = strings.TrimSpace(req.Password)
	req.Tenant = strings.ToLower(strings.TrimSpace(req.Tenant))
	if req.Tenant == "" {
		req.Tenant = "default"
	}
	if req.Username == "" || req.Password == "" {
		return fail(c, http.StatusBadRequest, "INVALID_CREDENTIALS", "Username and password cannot be empty", nil)
	}
	var tenant domain.Tenant
	err := GetDB(c).Where("slug = ? AND status = ?", req.Tenant, "active").First(&tenant).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return fail(c, http.StatusUnauthorized, "INVALID_CREDENTIALS", "Incorrect organization, username, or password", nil)
	}
	if err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to query organization", err.Error())
	}

	var operators []domain.SysOpr
	err = GetDB(c).Where("tenant_id = ? AND username = ?", tenant.ID, req.Username).Limit(2).Find(&operators).Error
	if err == nil && len(operators) > 1 {
		return fail(c, http.StatusInternalServerError, "AMBIGUOUS_OPERATOR", "Multiple operator accounts match this organization", nil)
	}
	var operator domain.SysOpr
	if len(operators) == 1 {
		operator = operators[0]
	} else if err == nil {
		err = gorm.ErrRecordNotFound
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return fail(c, http.StatusUnauthorized, "INVALID_CREDENTIALS", "Incorrect organization, username, or password", nil)
	}
	if err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to query user", err.Error())
	}

	if !common.VerifyPassword(req.Password, operator.Password) {
		return fail(c, http.StatusUnauthorized, "INVALID_CREDENTIALS", "Incorrect organization, username, or password", nil)
	}
	if strings.EqualFold(operator.Status, common.DISABLED) {
		return fail(c, http.StatusForbidden, "ACCOUNT_DISABLED", "Account has been disabled", nil)
	}
	var membership domain.TenantMembership
	if err := GetDB(c).Where("tenant_id = ? AND operator_id = ? AND status = ?", tenant.ID, operator.ID, common.ENABLED).First(&membership).Error; err != nil {
		return fail(c, http.StatusUnauthorized, "MEMBERSHIP_REVOKED", "This account is not an active member of the organization", nil)
	}
	operator.Level = membership.Level
	operator.Status = membership.Status
	operator.MembershipVersion = membership.TokenVersion

	token, err := issueToken(c, operator)
	if err != nil {
		return fail(c, http.StatusInternalServerError, "TOKEN_ERROR", "Failed to generate login token", nil)
	}

	db := GetDB(c)
	go func(id, tenantID int64) {
		db.Model(&domain.SysOpr{}).Where("id = ? AND tenant_id = ?", id, tenantID).Update("last_login", time.Now())
	}(operator.ID, tenant.ID)

	operator.Password = ""
	permissions := []string{}
	if operator.PlatformAdmin {
		permissions = append(permissions, "platform_admin")
	}
	return ok(c, map[string]interface{}{
		"token":        token,
		"user":         operator,
		"tenant":       tenant,
		"permissions":  permissions,
		"tokenExpires": time.Now().Add(tokenTTL).Unix(),
	})
}

func issueToken(c echo.Context, op domain.SysOpr) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"sub":                fmt.Sprintf("%d", op.ID),
		"tenant_id":          fmt.Sprintf("%d", op.TenantID),
		"membership_version": membershipVersion(op.MembershipVersion),
		"username":           op.Username,
		"role":               op.Level,
		"exp":                now.Add(tokenTTL).Unix(),
		"iat":                now.Unix(),
		"nbf":                now.Add(-1 * time.Minute).Unix(),
		"iss":                "mwx-isp",
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(GetAppContext(c).Config().Web.Secret))
}

func currentUserHandler(c echo.Context) error {
	operator, err := resolveOperatorFromContext(c)
	if err != nil {
		return fail(c, http.StatusUnauthorized, "UNAUTHORIZED", err.Error(), nil)
	}
	permissions := []string{}
	if operator.PlatformAdmin {
		permissions = append(permissions, "platform_admin")
	}
	return ok(c, map[string]interface{}{
		"user":        operator,
		"tenant":      c.Get("tenant"),
		"permissions": permissions,
	})
}

// testOperatorResolver is a test-only seam. It is nil in production builds and
// is assigned only by test code (see test_helpers_test.go), letting unit tests
// inject an already-resolved operator without standing up the full JWT
// middleware. Production code never assigns it, so the shipped binary always
// resolves caller identity from the signed JWT below and never trusts an
// operator placed directly into the request context.
var testOperatorResolver func(c echo.Context) (*domain.SysOpr, bool)

func resolveOperatorFromContext(c echo.Context) (*domain.SysOpr, error) {
	if testOperatorResolver != nil {
		if op, ok := testOperatorResolver(c); ok {
			c.Set("tenant_id", op.TenantID)
			c.SetRequest(c.Request().WithContext(tenancy.WithTenantID(c.Request().Context(), op.TenantID)))
			return op, nil
		}
	}

	userVal := c.Get("user")
	if userVal == nil {
		return nil, errors.New("no user in context")
	}

	token, ok := userVal.(*jwt.Token)
	if !ok {
		return nil, fmt.Errorf("invalid token type, got: %T", userVal)
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("invalid token claims")
	}
	sub, _ := claims["sub"].(string)
	if sub == "" {
		return nil, errors.New("invalid token subject")
	}
	id, err := strconv.ParseInt(sub, 10, 64)
	if err != nil {
		return nil, errors.New("invalid token id")
	}
	tenantClaim, _ := claims["tenant_id"].(string)
	tenantID, err := strconv.ParseInt(tenantClaim, 10, 64)
	if err != nil || tenantID <= 0 {
		return nil, errors.New("invalid token tenant")
	}
	var tenant domain.Tenant
	err = GetDB(c).Where("id = ? AND status = ?", tenantID, "active").First(&tenant).Error
	if err != nil {
		return nil, errors.New("tenant unavailable")
	}
	var operator domain.SysOpr
	err = GetDB(c).Where("id = ? AND tenant_id = ?", id, tenantID).First(&operator).Error
	if err != nil {
		return nil, err
	}
	// Reject tokens issued to accounts that have since been disabled so that
	// revoking an operator takes effect immediately, before the JWT expires.
	if strings.EqualFold(operator.Status, common.DISABLED) {
		return nil, errors.New("account disabled")
	}
	var membership domain.TenantMembership
	if err := GetDB(c).Where("tenant_id = ? AND operator_id = ? AND status = ?", tenantID, operator.ID, common.ENABLED).First(&membership).Error; err != nil {
		return nil, errors.New("tenant membership unavailable")
	}
	operator.Level = membership.Level
	operator.Status = membership.Status
	operator.MembershipVersion = membership.TokenVersion
	version, ok := claims["membership_version"].(float64)
	if !ok || int64(version) != membership.TokenVersion {
		return nil, errors.New("tenant membership changed")
	}
	c.Set("tenant_id", tenantID)
	c.Set("tenant", tenant)
	c.SetRequest(c.Request().WithContext(tenancy.WithTenantID(c.Request().Context(), tenantID)))
	operator.Password = ""
	return &operator, nil
}

func membershipVersion(version int64) int64 {
	if version <= 0 {
		return 1
	}
	return version
}
