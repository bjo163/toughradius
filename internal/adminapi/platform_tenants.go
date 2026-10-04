package adminapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/internal/webserver"
	"github.com/bjo163/mwx-isp/pkg/common"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

var tenantSlugPattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$`)

type createTenantPayload struct {
	Name           string `json:"name"`
	Slug           string `json:"slug"`
	Kind           string `json:"kind"`
	CompanyName    string `json:"company_name"`
	TaxID          string `json:"tax_id"`
	BillingAddress string `json:"billing_address"`
	ContactEmail   string `json:"contact_email"`
	ContactPhone   string `json:"contact_phone"`
	AdminUsername  string `json:"admin_username"`
	AdminPassword  string `json:"admin_password"`
}

type updateTenantPayload struct {
	Name           *string `json:"name"`
	CompanyName    *string `json:"company_name"`
	TaxID          *string `json:"tax_id"`
	BillingAddress *string `json:"billing_address"`
	ContactEmail   *string `json:"contact_email"`
	ContactPhone   *string `json:"contact_phone"`
	Status         *string `json:"status"`
}

func registerPlatformTenantRoutes() {
	webserver.ApiGET("/platform/tenants", listPlatformTenants, requirePlatformAdmin())
	webserver.ApiGET("/platform/tenants/:id", getPlatformTenant, requirePlatformAdmin())
	webserver.ApiPOST("/platform/tenants", createPlatformTenant, requirePlatformAdmin())
	webserver.ApiPUT("/platform/tenants/:id", updatePlatformTenant, requirePlatformAdmin())
}

func requirePlatformAdmin() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			operator, err := resolveOperatorFromContext(c)
			if err != nil {
				return fail(c, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required", nil)
			}
			if !operator.PlatformAdmin || operator.Level != LevelSuper {
				return fail(c, http.StatusForbidden, "PLATFORM_ACCESS_REQUIRED", "Platform administrator access is required", nil)
			}
			return next(c)
		}
	}
}

func listPlatformTenants(c echo.Context) error {
	page, pageSize := parsePagination(c)
	query := GetDB(c).Model(&domain.Tenant{})
	if search := strings.TrimSpace(c.QueryParam("q")); search != "" {
		query = query.Where("name LIKE ? OR slug LIKE ? OR company_name LIKE ?", "%"+search+"%", "%"+search+"%", "%"+search+"%")
	}
	if status := strings.TrimSpace(c.QueryParam("status")); status != "" {
		query = query.Where("status = ?", status)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to list tenants", err)
	}
	var rows []domain.Tenant
	if err := query.Order("id ASC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to list tenants", err)
	}
	return paged(c, rows, total, page, pageSize)
}

func getPlatformTenant(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil || id <= 0 {
		return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid tenant ID", nil)
	}
	var tenant domain.Tenant
	if err := GetDB(c).First(&tenant, id).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		return fail(c, http.StatusNotFound, "TENANT_NOT_FOUND", "Tenant not found", nil)
	} else if err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to load tenant", err)
	}
	return ok(c, tenant)
}

func createPlatformTenant(c echo.Context) error {
	var payload createTenantPayload
	if err := c.Bind(&payload); err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Unable to parse tenant parameters", nil)
	}
	payload.Name = strings.TrimSpace(payload.Name)
	payload.Slug = strings.ToLower(strings.TrimSpace(payload.Slug))
	payload.Kind = strings.ToLower(strings.TrimSpace(payload.Kind))
	payload.AdminUsername = strings.TrimSpace(payload.AdminUsername)
	if payload.Name == "" || len(payload.Name) > 120 || !tenantSlugPattern.MatchString(payload.Slug) {
		return fail(c, http.StatusBadRequest, "INVALID_TENANT", "Tenant name or slug is invalid", nil)
	}
	if payload.Kind != "isp" && payload.Kind != "rtrw" {
		return fail(c, http.StatusBadRequest, "INVALID_TENANT_KIND", "Tenant kind must be isp or rtrw", nil)
	}
	if len(payload.AdminUsername) < 3 || len(payload.AdminUsername) > 64 || len(payload.AdminPassword) < 12 {
		return fail(c, http.StatusBadRequest, "INVALID_TENANT_ADMIN", "Initial admin username must be 3–64 characters and password at least 12 characters", nil)
	}
	hashedPassword, err := common.HashPassword(payload.AdminPassword)
	if err != nil {
		return fail(c, http.StatusInternalServerError, "PASSWORD_ERROR", "Unable to prepare tenant administrator", err)
	}
	now := time.Now()
	tenant := domain.Tenant{
		Name: payload.Name, Slug: payload.Slug, Kind: payload.Kind, Status: "active",
		CompanyName: strings.TrimSpace(payload.CompanyName), TaxID: strings.TrimSpace(payload.TaxID),
		BillingAddress: strings.TrimSpace(payload.BillingAddress), ContactEmail: strings.TrimSpace(payload.ContactEmail),
		ContactPhone: strings.TrimSpace(payload.ContactPhone), CreatedAt: now, UpdatedAt: now,
	}
	err = GetDB(c).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&tenant).Error; err != nil {
			return err
		}
		admin := domain.SysOpr{
			ID: common.UUIDint64(), TenantID: tenant.ID, Username: payload.AdminUsername,
			Password: hashedPassword, Realname: payload.AdminUsername,
			Level: LevelSuper, Status: common.ENABLED, CreatedAt: now, UpdatedAt: now,
		}
		// The creating platform administrator is authenticated in the default
		// tenant context; this one audited operation provisions the first user
		// for the newly created tenant.
		return tx.WithContext(context.Background()).Session(&gorm.Session{NewDB: true}).Create(&admin).Error
	})
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") || strings.Contains(strings.ToLower(err.Error()), "duplicate") {
			return fail(c, http.StatusConflict, "TENANT_EXISTS", "Tenant slug or administrator username already exists", nil)
		}
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to create tenant", err)
	}
	return c.JSON(http.StatusCreated, Response{Data: map[string]any{"tenant": tenant, "admin_username": payload.AdminUsername}})
}

func updatePlatformTenant(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil || id <= 0 || id == domain.DefaultTenantID {
		return fail(c, http.StatusBadRequest, "INVALID_ID", "The default tenant cannot be changed through this operation", nil)
	}
	var payload updateTenantPayload
	if err := c.Bind(&payload); err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Unable to parse tenant update", nil)
	}
	updates := map[string]any{"updated_at": time.Now()}
	if payload.Name != nil {
		value := strings.TrimSpace(*payload.Name)
		if value == "" || len(value) > 120 {
			return fail(c, http.StatusBadRequest, "INVALID_TENANT", "Tenant name must contain 1–120 characters", nil)
		}
		updates["name"] = value
	}
	for key, value := range map[string]*string{
		"company_name": payload.CompanyName, "tax_id": payload.TaxID, "billing_address": payload.BillingAddress,
		"contact_email": payload.ContactEmail, "contact_phone": payload.ContactPhone,
	} {
		if value != nil {
			updates[key] = strings.TrimSpace(*value)
		}
	}
	if payload.Status != nil {
		status := strings.ToLower(strings.TrimSpace(*payload.Status))
		if status != "active" && status != "suspended" {
			return fail(c, http.StatusBadRequest, "INVALID_TENANT_STATUS", "Tenant status must be active or suspended", nil)
		}
		updates["status"] = status
	}
	result := GetDB(c).Model(&domain.Tenant{}).Where("id = ?", id).Updates(updates)
	if result.Error != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to update tenant", result.Error)
	}
	if result.RowsAffected == 0 {
		return fail(c, http.StatusNotFound, "TENANT_NOT_FOUND", "Tenant not found", nil)
	}
	var tenant domain.Tenant
	if err := GetDB(c).First(&tenant, id).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to load updated tenant", fmt.Errorf("reload tenant: %w", err))
	}
	return ok(c, tenant)
}
