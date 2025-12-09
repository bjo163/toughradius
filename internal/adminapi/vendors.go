package adminapi

import (
    "errors"
    "net/http"
    "strings"
    "time"

    "github.com/labstack/echo/v4"
    "gorm.io/gorm"

    "github.com/talkincode/toughradius/v9/internal/domain"
    "github.com/talkincode/toughradius/v9/internal/webserver"
)

type vendorPayload struct {
    Code   string `json:"code" validate:"required,min=1,max=50"`
    Name   string `json:"name" validate:"required,min=1,max=200"`
    Remark string `json:"remark" validate:"omitempty,max=500"`
}

type vendorUpdatePayload struct {
    Code   *string `json:"code" validate:"omitempty,min=1,max=50"`
    Name   *string `json:"name" validate:"omitempty,min=1,max=200"`
    Remark *string `json:"remark" validate:"omitempty,max=500"`
}

// registerVendorRoutes registers vendor CRUD routes
func registerVendorRoutes() {
    webserver.ApiGET("/network/vendors", listVendors)
    webserver.ApiGET("/network/vendors/:id", getVendor)
    webserver.ApiPOST("/network/vendors", createVendor)
    webserver.ApiPUT("/network/vendors/:id", updateVendor)
    webserver.ApiDELETE("/network/vendors/:id", deleteVendor)
}

func listVendors(c echo.Context) error {
    page, pageSize := parsePagination(c)

    db := GetDB(c).Model(&domain.NetVendor{})
    if q := strings.TrimSpace(c.QueryParam("q")); q != "" {
        if strings.EqualFold(db.Name(), "postgres") { //nolint:staticcheck
            db = db.Where("code ILIKE ? OR name ILIKE ?", "%"+q+"%", "%"+q+"%")
        } else {
            db = db.Where("LOWER(code) LIKE ? OR LOWER(name) LIKE ?", "%"+strings.ToLower(q)+"%", "%"+strings.ToLower(q)+"%")
        }
    }

    var total int64
    if err := db.Count(&total).Error; err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to query vendors", err.Error())
    }

    var vendors []domain.NetVendor
    if err := db.Order("id DESC").Offset((page-1)*pageSize).Limit(pageSize).Find(&vendors).Error; err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to query vendors", err.Error())
    }

    return paged(c, vendors, total, page, pageSize)
}

func getVendor(c echo.Context) error {
    id, err := parseIDParam(c, "id")
    if err != nil {
        return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid vendor ID", nil)
    }

    var v domain.NetVendor
    if err := GetDB(c).Where("id = ?", id).First(&v).Error; errors.Is(err, gorm.ErrRecordNotFound) {
        return fail(c, http.StatusNotFound, "VENDOR_NOT_FOUND", "Vendor not found", nil)
    } else if err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to query vendor", err.Error())
    }

    return ok(c, v)
}

func createVendor(c echo.Context) error {
    var payload vendorPayload
    if err := c.Bind(&payload); err != nil {
        return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Unable to parse vendor parameters", nil)
    }
    if err := c.Validate(&payload); err != nil {
        return handleValidationError(c, err)
    }

    payload.Code = strings.TrimSpace(payload.Code)
    payload.Name = strings.TrimSpace(payload.Name)

    var exists int64
    GetDB(c).Model(&domain.NetVendor{}).Where("code = ?", payload.Code).Count(&exists)
    if exists > 0 {
        return fail(c, http.StatusConflict, "VENDOR_EXISTS", "Vendor code already exists", nil)
    }

    vendor := domain.NetVendor{
        Code:      payload.Code,
        Name:      payload.Name,
        Remark:    payload.Remark,
        CreatedAt: time.Now(),
        UpdatedAt: time.Now(),
    }

    if err := GetDB(c).Create(&vendor).Error; err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to create vendor", err.Error())
    }

    return ok(c, vendor)
}

func updateVendor(c echo.Context) error {
    id, err := parseIDParam(c, "id")
    if err != nil {
        return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid vendor ID", nil)
    }

    var payload vendorUpdatePayload
    if err := c.Bind(&payload); err != nil {
        return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Unable to parse vendor parameters", nil)
    }
    if err := c.Validate(&payload); err != nil {
        return handleValidationError(c, err)
    }

    var v domain.NetVendor
    if err := GetDB(c).Where("id = ?", id).First(&v).Error; errors.Is(err, gorm.ErrRecordNotFound) {
        return fail(c, http.StatusNotFound, "VENDOR_NOT_FOUND", "Vendor not found", nil)
    } else if err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to query vendor", err.Error())
    }

    if payload.Code != nil {
        code := strings.TrimSpace(*payload.Code)
        if code != v.Code {
            var exists int64
            GetDB(c).Model(&domain.NetVendor{}).Where("code = ? AND id != ?", code, id).Count(&exists)
            if exists > 0 {
                return fail(c, http.StatusConflict, "VENDOR_EXISTS", "Vendor code already exists", nil)
            }
            v.Code = code
        }
    }
    if payload.Name != nil {
        v.Name = strings.TrimSpace(*payload.Name)
    }
    if payload.Remark != nil {
        v.Remark = *payload.Remark
    }
    v.UpdatedAt = time.Now()

    if err := GetDB(c).Save(&v).Error; err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to update vendor", err.Error())
    }

    return ok(c, v)
}

func deleteVendor(c echo.Context) error {
    id, err := parseIDParam(c, "id")
    if err != nil {
        return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid vendor ID", nil)
    }

    var v domain.NetVendor
    if err := GetDB(c).Where("id = ?", id).First(&v).Error; errors.Is(err, gorm.ErrRecordNotFound) {
        return fail(c, http.StatusNotFound, "VENDOR_NOT_FOUND", "Vendor not found", nil)
    } else if err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to query vendor", err.Error())
    }

    // Prevent deletion if any NAS references this vendor code
    var nasCount int64
    GetDB(c).Model(&domain.NetNas{}).Where("vendor_code = ?", v.Code).Count(&nasCount)
    if nasCount > 0 {
        return fail(c, http.StatusConflict, "VENDOR_IN_USE", "Vendor is in use by NAS devices and cannot be deleted", map[string]interface{}{"nas_count": nasCount})
    }

    if err := GetDB(c).Where("id = ?", id).Delete(&domain.NetVendor{}).Error; err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to delete vendor", err.Error())
    }

    return ok(c, map[string]interface{}{"id": id})
}
