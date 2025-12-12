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
    "github.com/talkincode/toughradius/v9/pkg/common"
)

func registerPartnersRoutes() {
    webserver.ApiGET("/system/partners", listPartners)
    webserver.ApiGET("/system/partners/:id", getPartner)
    webserver.ApiPOST("/system/partners", createPartner)
    webserver.ApiPUT("/system/partners/:id", updatePartner)
    webserver.ApiDELETE("/system/partners/:id", deletePartner)
}

func listPartners(c echo.Context) error {
    page, pageSize := parsePagination(c)

    base := GetDB(c).Model(&domain.SysPartner{})

    var total int64
    if err := base.Count(&total).Error; err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to query partners", err.Error())
    }

    var partners []domain.SysPartner
    if err := base.Order("id DESC").Offset((page-1)*pageSize).Limit(pageSize).Find(&partners).Error; err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to query partners", err.Error())
    }
    return paged(c, partners, total, page, pageSize)
}

func getPartner(c echo.Context) error {
    id, err := parseIDParam(c, "id")
    if err != nil {
        return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid partner ID", nil)
    }
    var p domain.SysPartner
    if err := GetDB(c).Where("id = ?", id).First(&p).Error; errors.Is(err, gorm.ErrRecordNotFound) {
        return fail(c, http.StatusNotFound, "PARTNER_NOT_FOUND", "Partner not found", nil)
    } else if err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to query partner", err.Error())
    }
    return ok(c, p)
}

type partnerPayload struct {
    Name    string `json:"name"`
    Company string `json:"company"`
    Email   string `json:"email"`
    Mobile  string `json:"mobile"`
    Phone   string `json:"phone"`
    Address string `json:"address"`
    City    string `json:"city"`
    Country string `json:"country"`
    Remark  string `json:"remark"`
}

func createPartner(c echo.Context) error {
    var payload partnerPayload
    if err := c.Bind(&payload); err != nil {
        return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Unable to parse partner parameters", nil)
    }
    if strings.TrimSpace(payload.Name) == "" {
        return fail(c, http.StatusBadRequest, "MISSING_NAME", "Partner name is required", nil)
    }
    // ensure mobile/phone uniqueness
    if payload.Mobile != "" {
        var dup domain.SysPartner
        if err := GetDB(c).Where("mobile = ? OR phone = ?", payload.Mobile, payload.Mobile).First(&dup).Error; err == nil {
            return fail(c, http.StatusConflict, "DUPLICATE_PARTNER", "Partner with this phone/mobile already exists", nil)
        }
    }

    p := domain.SysPartner{
        ID:        common.UUIDint64(),
        Name:      strings.TrimSpace(payload.Name),
        Company:   payload.Company,
        Email:     payload.Email,
        Mobile:    payload.Mobile,
        Phone:     payload.Phone,
        Address:   payload.Address,
        City:      payload.City,
        Country:   payload.Country,
        Remark:    payload.Remark,
        CreatedAt: time.Now(),
        UpdatedAt: time.Now(),
    }
    if err := GetDB(c).Create(&p).Error; err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to create partner", err.Error())
    }
    return ok(c, p)
}

func updatePartner(c echo.Context) error {
    id, err := parseIDParam(c, "id")
    if err != nil {
        return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid partner ID", nil)
    }
    var payload partnerPayload
    if err := c.Bind(&payload); err != nil {
        return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Unable to parse partner parameters", nil)
    }
    var p domain.SysPartner
    if err := GetDB(c).Where("id = ?", id).First(&p).Error; errors.Is(err, gorm.ErrRecordNotFound) {
        return fail(c, http.StatusNotFound, "PARTNER_NOT_FOUND", "Partner not found", nil)
    } else if err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to query partner", err.Error())
    }
    updates := map[string]interface{}{}
    if payload.Name != "" {
        updates["name"] = strings.TrimSpace(payload.Name)
    }
    if payload.Company != "" {
        updates["company"] = payload.Company
    }
    if payload.Email != "" {
        updates["email"] = payload.Email
    }
    if payload.Mobile != "" {
        // ensure new mobile value is not used by another partner
        var dup domain.SysPartner
        if err := GetDB(c).Where("(mobile = ? OR phone = ?) AND id != ?", payload.Mobile, payload.Mobile, id).First(&dup).Error; err == nil {
            return fail(c, http.StatusConflict, "DUPLICATE_PARTNER", "Another partner with this phone/mobile already exists", nil)
        }
        updates["mobile"] = payload.Mobile
    }
    if payload.Phone != "" {
        var dup domain.SysPartner
        if err := GetDB(c).Where("(mobile = ? OR phone = ?) AND id != ?", payload.Phone, payload.Phone, id).First(&dup).Error; err == nil {
            return fail(c, http.StatusConflict, "DUPLICATE_PARTNER", "Another partner with this phone/mobile already exists", nil)
        }
        updates["phone"] = payload.Phone
    }
    if payload.Address != "" {
        updates["address"] = payload.Address
    }
    if payload.City != "" {
        updates["city"] = payload.City
    }
    if payload.Country != "" {
        updates["country"] = payload.Country
    }
    if payload.Remark != "" {
        updates["remark"] = payload.Remark
    }
    updates["updated_at"] = time.Now()
    if err := GetDB(c).Model(&p).Updates(updates).Error; err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to update partner", err.Error())
    }
    GetDB(c).Where("id = ?", id).First(&p)
    return ok(c, p)
}

func deletePartner(c echo.Context) error {
    id, err := parseIDParam(c, "id")
    if err != nil {
        return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid partner ID", nil)
    }
    if err := GetDB(c).Where("id = ?", id).Delete(&domain.SysPartner{}).Error; err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to delete partner", err.Error())
    }
    return ok(c, map[string]interface{}{"id": id})
}
