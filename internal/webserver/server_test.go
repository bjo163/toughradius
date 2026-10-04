package webserver

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
)

// TestJwtSkipFuncDoesNotBypassWithDevmode ensures the JWT skipper only skips
// the explicitly public routes and never disables auth globally, including when
// the removed TOUGHRADIUS_DEVMODE environment variable is set.
func TestJwtSkipFuncDoesNotBypassWithDevmode(t *testing.T) {
	e := echo.New()
	skip := jwtSkipFunc()

	newCtx := func(path string) echo.Context {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.SetPath(path)
		return c
	}

	// Authentication and public branding are intentionally available before login.
	assert.True(t, skip(newCtx("/ready")))
	assert.True(t, skip(newCtx(apiBasePath+"/auth/login")))
	assert.True(t, skip(newCtx(apiBasePath+"/auth/tenants")))
	assert.True(t, skip(newCtx(apiBasePath+"/public/branding")))
	assert.True(t, skip(newCtx(apiBasePath+"/public/branding/logo")))

	// Business and customer data routes require a signed operator token.
	assert.False(t, skip(newCtx(apiBasePath+"/public/packages")))
	assert.False(t, skip(newCtx(apiBasePath+"/public/register")))
	assert.False(t, skip(newCtx(apiBasePath+"/public/vouchers/check")))
	assert.False(t, skip(newCtx(apiBasePath+"/portal/lookup")))
	assert.False(t, skip(newCtx(apiBasePath+"/portal/payments/webhook")))

	// Protected routes are never skipped.
	assert.False(t, skip(newCtx(apiBasePath+"/users")))
	assert.False(t, skip(newCtx(apiBasePath+"/system/branding")))

	// Setting the former bypass env var must not disable auth.
	t.Setenv("TOUGHRADIUS_DEVMODE", "true")
	assert.False(t, skip(newCtx(apiBasePath+"/users")))
}

func TestShouldStartTLSManagementPort(t *testing.T) {
	enabled := true
	disabled := false

	assert.True(t, shouldStartTLSManagementPort(nil), "nil preserves legacy enabled behavior")
	assert.True(t, shouldStartTLSManagementPort(&enabled))
	assert.False(t, shouldStartTLSManagementPort(&disabled))
}
