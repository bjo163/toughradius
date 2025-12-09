package adminapi

import (
    "net/http"
    "strconv"
    "strings"

    "github.com/labstack/echo/v4"
    "github.com/talkincode/toughradius/v9/internal/domain"
    "github.com/talkincode/toughradius/v9/internal/webserver"
    "go.uber.org/zap"
)

// ListServices returns a paginated list of discovered services
func ListServices(c echo.Context) error {
    page, pageSize := parsePagination(c)
    db := GetDB(c).Model(&domain.NetService{})

    if q := strings.TrimSpace(c.QueryParam("q")); q != "" {
        if strings.EqualFold(db.Name(), "postgres") { //nolint:staticcheck
            db = db.Where("name ILIKE ? OR endpoint ILIKE ? OR service_type ILIKE ?", "%"+q+"%", "%"+q+"%", "%"+q+"%")
        } else {
            db = db.Where("LOWER(name) LIKE ? OR LOWER(endpoint) LIKE ? OR LOWER(service_type) LIKE ?", "%"+strings.ToLower(q)+"%", "%"+strings.ToLower(q)+"%", "%"+strings.ToLower(q)+"%")
        }
    }

    // optional filter by nas_id
    if nas := strings.TrimSpace(c.QueryParam("nas_id")); nas != "" {
        if id, err := strconv.ParseInt(nas, 10, 64); err == nil {
            db = db.Where("nas_id = ?", id)
        }
    }

    var total int64
    if err := db.Count(&total).Error; err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to query services", err.Error())
    }

    var services []domain.NetService
    if err := db.Order("id DESC").Offset((page-1)*pageSize).Limit(pageSize).Find(&services).Error; err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to query services", err.Error())
    }

    return paged(c, services, total, page, pageSize)
}

// GetService returns a single service by ID
func GetService(c echo.Context) error {
    id, err := strconv.ParseInt(c.Param("id"), 10, 64)
    if err != nil {
        return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid service ID", nil)
    }

    var s domain.NetService
    if err := GetDB(c).Where("id = ?", id).First(&s).Error; err != nil {
        return fail(c, http.StatusNotFound, "NOT_FOUND", "Service not found", nil)
    }
    return ok(c, s)
}

// DeleteService deletes a service by ID
func DeleteService(c echo.Context) error {
    id, err := strconv.ParseInt(c.Param("id"), 10, 64)
    if err != nil {
        return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid service ID", nil)
    }

    if err := GetDB(c).Where("id = ?", id).Delete(&domain.NetService{}).Error; err != nil {
        return fail(c, http.StatusInternalServerError, "DELETE_FAILED", "Failed to delete service", err.Error())
    }

    zap.L().Info("service deleted", zap.Int64("id", id))
    return ok(c, map[string]interface{}{"id": id})
}

// registerServiceRoutes registers service discovery endpoints
func registerServiceRoutes() {
    webserver.ApiGET("/network/services", ListServices)
    webserver.ApiGET("/network/services/summary", SummaryServices)
    webserver.ApiGET("/network/services/:id/inspect", InspectService)
    webserver.ApiGET("/network/services/:id", GetService)
    webserver.ApiDELETE("/network/services/:id", DeleteService)
}

// InspectService returns raw params + parsed numeric fields for a single service (debugging)
func InspectService(c echo.Context) error {
    id, err := strconv.ParseInt(c.Param("id"), 10, 64)
    if err != nil {
        return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid service ID", nil)
    }

    var s domain.NetService
    if err := GetDB(c).Where("id = ?", id).First(&s).Error; err != nil {
        return fail(c, http.StatusNotFound, "NOT_FOUND", "Service not found", nil)
    }

    // return selected debug fields
    res := map[string]interface{}{
        "id":                 s.ID,
        "nas_id":             s.NasId,
        "name":               s.Name,
        "vendor_service_id":  s.VendorServiceId,
        "service_type":       s.ServiceType,
        "endpoint":           s.Endpoint,
        "raw_rate":           s.Rate,
        "raw_max_limit":      s.MaxLimit,
        "parsed_rate_up_kbps":   s.RateUpKbps,
        "parsed_rate_down_kbps": s.RateDownKbps,
        "upload_kbps":           s.UploadKbps,
        "download_kbps":         s.DownloadKbps,
        "status":                s.Status,
        "params":                s.Params,
    }

    return ok(c, res)
}

// SummaryServices returns aggregated totals (sum of rate_up_kbps and rate_down_kbps)
func SummaryServices(c echo.Context) error {
    db := GetDB(c).Model(&domain.NetService{})

    // optional filter by nas_id
    if nas := strings.TrimSpace(c.QueryParam("nas_id")); nas != "" {
        if id, err := strconv.ParseInt(nas, 10, 64); err == nil {
            db = db.Where("nas_id = ?", id)
        }
    }

    var res struct {
        TotalRateUp   int64 `json:"total_rate_up"`
        TotalRateDown int64 `json:"total_rate_down"`
    }

    if err := db.Select("COALESCE(SUM(rate_up_kbps),0) as total_rate_up, COALESCE(SUM(rate_down_kbps),0) as total_rate_down").Scan(&res).Error; err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to query services summary", err.Error())
    }

    return ok(c, res)
}
