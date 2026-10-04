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
	"github.com/bjo163/mwx-isp/internal/tenancy"
	"github.com/bjo163/mwx-isp/internal/webserver"
	"github.com/bjo163/mwx-isp/pkg/common"
	"github.com/bjo163/mwx-isp/pkg/validutil"
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
	webserver.ApiGET("/platform/tenants/:id/operators", listPlatformTenantOperators, requirePlatformAdmin())
	webserver.ApiPOST("/platform/tenants/:id/operators", createPlatformTenantOperator, requirePlatformAdmin())
	webserver.ApiDELETE("/platform/tenants/:id/operators/:operator_id", revokePlatformTenantOperator, requirePlatformAdmin())
	webserver.ApiPOST("/platform/tenants/:id/operators/:operator_id/activate", activatePlatformTenantOperator, requirePlatformAdmin())
}

type tenantOperatorView struct {
	ID            int64     `json:"id,string"`
	Username      string    `json:"username"`
	Realname      string    `json:"realname"`
	Email         string    `json:"email"`
	Mobile        string    `json:"mobile"`
	Level         string    `json:"level"`
	Status        string    `json:"status"`
	PlatformAdmin bool      `json:"platform_admin"`
	CreatedAt     time.Time `json:"created_at"`
}

type createTenantOperatorPayload struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Realname string `json:"realname"`
	Email    string `json:"email"`
	Mobile   string `json:"mobile"`
	Level    string `json:"level"`
}

func platformTenantID(c echo.Context) (int64, error) {
	id, err := parseIDParam(c, "id")
	if err != nil || id <= 0 {
		return 0, fmt.Errorf("invalid tenant ID")
	}
	return id, nil
}

func listPlatformTenantOperators(c echo.Context) error {
	tenantID, err := platformTenantID(c)
	if err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_ID", err.Error(), nil)
	}
	var tenant domain.Tenant
	if err := GetDB(c).First(&tenant, tenantID).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		return fail(c, http.StatusNotFound, "TENANT_NOT_FOUND", "Tenant not found", nil)
	} else if err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to load tenant", err)
	}
	platformDB := GetDB(c).Session(&gorm.Session{NewDB: true}).WithContext(context.Background())
	var operators []domain.SysOpr
	if err := platformDB.Where("tenant_id = ?", tenantID).Order("username ASC").Find(&operators).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to list tenant operators", err)
	}
	views := make([]tenantOperatorView, 0, len(operators))
	for _, operator := range operators {
		var membership domain.TenantMembership
		if err := platformDB.Where("tenant_id = ? AND operator_id = ?", tenantID, operator.ID).First(&membership).Error; err != nil {
			return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to load tenant membership", err)
		}
		views = append(views, tenantOperatorView{
			ID: operator.ID, Username: operator.Username, Realname: operator.Realname,
			Email: operator.Email, Mobile: operator.Mobile, Level: membership.Level,
			Status: membership.Status, PlatformAdmin: operator.PlatformAdmin, CreatedAt: membership.CreatedAt,
		})
	}
	return ok(c, views)
}

func createPlatformTenantOperator(c echo.Context) error {
	tenantID, err := platformTenantID(c)
	if err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_ID", err.Error(), nil)
	}
	var tenant domain.Tenant
	if err := GetDB(c).Where("id = ? AND status = ?", tenantID, "active").First(&tenant).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		return fail(c, http.StatusNotFound, "TENANT_NOT_ACTIVE", "Active tenant not found", nil)
	} else if err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to load tenant", err)
	}
	var payload createTenantOperatorPayload
	if err := c.Bind(&payload); err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Unable to parse tenant operator", nil)
	}
	payload.Username = strings.TrimSpace(payload.Username)
	payload.Level = strings.ToLower(strings.TrimSpace(payload.Level))
	if len(payload.Username) < 3 || len(payload.Username) > 30 || len(payload.Password) < 12 {
		return fail(c, http.StatusBadRequest, "INVALID_TENANT_OPERATOR", "Username must be 3–30 characters and password at least 12 characters", nil)
	}
	if payload.Level == "" {
		payload.Level = "operator"
	}
	if payload.Level != LevelAdmin && payload.Level != LevelOperator {
		return fail(c, http.StatusBadRequest, "INVALID_TENANT_OPERATOR_LEVEL", "Tenant operator role must be admin or operator", nil)
	}
	if payload.Email != "" && !validutil.IsEmail(payload.Email) {
		return fail(c, http.StatusBadRequest, "INVALID_EMAIL", "Invalid email address", nil)
	}
	if payload.Mobile != "" && !validutil.IsE164PhoneNumber(payload.Mobile) && !validutil.IsCnMobile(payload.Mobile) {
		return fail(c, http.StatusBadRequest, "INVALID_MOBILE", "Invalid mobile number format", nil)
	}
	if !validutil.CheckPassword(payload.Password) {
		return fail(c, http.StatusBadRequest, "WEAK_PASSWORD", "Password must contain letters and numbers", nil)
	}
	hashed, err := common.HashPassword(payload.Password)
	if err != nil {
		return fail(c, http.StatusInternalServerError, "PASSWORD_ERROR", "Unable to prepare tenant operator", err)
	}
	operator := domain.SysOpr{
		ID: common.UUIDint64(), TenantID: tenantID, Username: payload.Username, Password: hashed,
		Realname: strings.TrimSpace(payload.Realname), Email: strings.TrimSpace(payload.Email),
		Mobile: strings.TrimSpace(payload.Mobile), Level: payload.Level, Status: common.ENABLED,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	platformDB := GetDB(c).Session(&gorm.Session{NewDB: true}).WithContext(tenancy.WithTenantID(context.Background(), tenantID))
	if err := platformDB.Create(&operator).Error; err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") || strings.Contains(strings.ToLower(err.Error()), "duplicate") {
			return fail(c, http.StatusConflict, "USERNAME_EXISTS", "Username already exists in this organization", nil)
		}
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to create tenant operator", err)
	}
	operator.Password = ""
	return c.JSON(http.StatusCreated, Response{Data: operator})
}

func revokePlatformTenantOperator(c echo.Context) error {
	tenantID, err := platformTenantID(c)
	if err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_ID", err.Error(), nil)
	}
	operatorID, err := parseIDParam(c, "operator_id")
	if err != nil || operatorID <= 0 {
		return fail(c, http.StatusBadRequest, "INVALID_OPERATOR_ID", "Invalid operator ID", nil)
	}
	actor, err := resolveOperatorFromContext(c)
	if err != nil {
		return fail(c, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required", nil)
	}
	if actor.ID == operatorID && actor.TenantID == tenantID {
		return fail(c, http.StatusForbidden, "CANNOT_REVOKE_SELF", "You cannot revoke your own active membership", nil)
	}
	platformDB := GetDB(c).Session(&gorm.Session{NewDB: true}).WithContext(context.Background())
	var operator domain.SysOpr
	if err := platformDB.Where("tenant_id = ? AND id = ?", tenantID, operatorID).First(&operator).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		return fail(c, http.StatusNotFound, "MEMBERSHIP_NOT_FOUND", "Tenant membership not found", nil)
	} else if err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to load tenant operator", err)
	}
	if operator.PlatformAdmin {
		return fail(c, http.StatusForbidden, "PLATFORM_ADMIN_PROTECTED", "Platform administrator membership cannot be revoked here", nil)
	}
	result := platformDB.Model(&domain.TenantMembership{}).
		Where("tenant_id = ? AND operator_id = ?", tenantID, operatorID).
		Updates(map[string]any{"status": common.DISABLED, "token_version": gorm.Expr("token_version + 1"), "updated_at": time.Now()})
	if result.Error != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to revoke tenant membership", result.Error)
	}
	if result.RowsAffected == 0 {
		return fail(c, http.StatusNotFound, "MEMBERSHIP_NOT_FOUND", "Tenant membership not found", nil)
	}
	if err := platformDB.Model(&domain.SysOpr{}).Where("tenant_id = ? AND id = ?", tenantID, operatorID).Update("status", common.DISABLED).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to disable tenant operator", err)
	}
	return ok(c, map[string]any{"operator_id": operatorID, "status": common.DISABLED})
}

func activatePlatformTenantOperator(c echo.Context) error {
	tenantID, err := platformTenantID(c)
	if err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_ID", err.Error(), nil)
	}
	operatorID, err := parseIDParam(c, "operator_id")
	if err != nil || operatorID <= 0 {
		return fail(c, http.StatusBadRequest, "INVALID_OPERATOR_ID", "Invalid operator ID", nil)
	}
	platformDB := GetDB(c).Session(&gorm.Session{NewDB: true}).WithContext(context.Background())
	var tenant domain.Tenant
	if err := platformDB.Where("id = ? AND status = ?", tenantID, "active").First(&tenant).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		return fail(c, http.StatusNotFound, "TENANT_NOT_ACTIVE", "Active tenant not found", nil)
	} else if err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to load tenant", err)
	}
	var operator domain.SysOpr
	if err := platformDB.Where("tenant_id = ? AND id = ?", tenantID, operatorID).First(&operator).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		return fail(c, http.StatusNotFound, "MEMBERSHIP_NOT_FOUND", "Tenant membership not found", nil)
	} else if err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to load tenant operator", err)
	}
	result := platformDB.Model(&domain.TenantMembership{}).
		Where("tenant_id = ? AND operator_id = ?", tenantID, operatorID).
		Updates(map[string]any{"status": common.ENABLED, "token_version": gorm.Expr("token_version + 1"), "updated_at": time.Now()})
	if result.Error != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to activate tenant membership", result.Error)
	}
	if result.RowsAffected == 0 {
		return fail(c, http.StatusNotFound, "MEMBERSHIP_NOT_FOUND", "Tenant membership not found", nil)
	}
	if err := platformDB.Model(&domain.SysOpr{}).Where("tenant_id = ? AND id = ?", tenantID, operatorID).Update("status", common.ENABLED).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to activate tenant operator", err)
	}
	return ok(c, map[string]any{"operator_id": operatorID, "status": common.ENABLED})
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
