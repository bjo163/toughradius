package adminapi

import (
	"github.com/bjo163/mwx-isp/internal/app"
	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/internal/tenancy"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

// GetAppContext returns the application context that request middleware stored
// on the echo context under the "appCtx" key. It is the entry point handlers use
// to reach shared services (database, configuration, scheduler).
//
// It panics if no application context is present, which indicates the route was
// registered without the middleware that injects it — a programming error rather
// than a runtime condition, so it is surfaced immediately instead of returning a
// nil context that would fault later.
func GetAppContext(c echo.Context) app.AppContext {
	return c.Get("appCtx").(app.AppContext) //nolint:errcheck // type assertion is safe for middleware-set context
}

// deleteTenantRecord deletes one tenant-owned record and reports whether the
// authenticated tenant owned the requested ID. The explicit predicate keeps
// destructive paths safe even when a database callback or GORM primary-key
// delete would otherwise bypass a request filter.
func deleteTenantRecord(c echo.Context, model any, id int64) (bool, error) {
	tenantID := domain.DefaultTenantID
	if scopedID, ok := tenancy.TenantID(c.Request().Context()); ok {
		tenantID = scopedID
	}
	result := GetDB(c).Where("tenant_id = ?", tenantID).Delete(model, id)
	return result.RowsAffected > 0, result.Error
}

// GetDB returns the GORM database handle for the current request. It prefers a
// per-request handle stored under the "db" key (used by tests and request-scoped
// transactions) and otherwise falls back to the shared connection from the
// application context, so handlers get a usable [*gorm.DB] either way.
func GetDB(c echo.Context) *gorm.DB {
	var db *gorm.DB
	if db, ok := c.Get("db").(*gorm.DB); ok && db != nil {
		return requestTenantDB(c, db)
	}
	db = GetAppContext(c).DB()
	return requestTenantDB(c, db)
}

func requestTenantDB(c echo.Context, db *gorm.DB) *gorm.DB {
	if db == nil {
		return nil
	}
	if id, ok := c.Get("tenant_id").(int64); ok && id > 0 {
		return db.WithContext(tenancy.WithTenantID(c.Request().Context(), id))
	}
	return db
}

// GetConfig returns the configuration manager for the current request, resolved
// from the application context. It is the handler-facing accessor for reading and
// updating dynamic system settings.
func GetConfig(c echo.Context) *app.ConfigManager {
	return GetAppContext(c).ConfigMgr()
}
