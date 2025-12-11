package adminapi

import (
    "net/http"
    "strconv"
    "strings"
    "time"

    "github.com/labstack/echo/v4"
    "github.com/talkincode/toughradius/v9/internal/domain"
    "github.com/talkincode/toughradius/v9/internal/webserver"
)

type productPayload struct {
    Name  string  `json:"name" validate:"required,min=1,max=200"`
    Price float64 `json:"price"`
    Image string  `json:"image"`
    Type  string  `json:"type"`
    Qty   *int    `json:"qty"`
}

// registerProductRoutes registers simple product CRUD endpoints
func registerProductRoutes() {
    // Register only under /crm/products (CRM grouping). Legacy /system/products removed.
    webserver.ApiGET("/crm/products", listProducts)
    webserver.ApiGET("/crm/products/:id", getProduct)
    webserver.ApiPOST("/crm/products", createProduct)
    webserver.ApiPUT("/crm/products/:id", updateProduct)
    webserver.ApiDELETE("/crm/products/:id", deleteProduct)
}

func listProducts(c echo.Context) error {
    // Pagination: accept both perPage (from front-end) and pageSize for backwards compatibility
    pageStr := c.QueryParam("page")
    page := 1
    if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
        page = p
    }
    perPageStr := c.QueryParam("perPage")
    pageSize := 20
    if perPageStr != "" {
        if ps, err := strconv.Atoi(perPageStr); err == nil && ps > 0 && ps <= 500 {
            pageSize = ps
        }
    } else {
        // fallback to legacy pageSize param
        if _, ps := parsePagination(c); ps > 0 {
            _, pageSize = parsePagination(c)
        }
    }

    // Filters: q or name
    q := strings.TrimSpace(c.QueryParam("q"))
    nameFilter := strings.TrimSpace(c.QueryParam("name"))

    // Sorting: field and order
    sortField := strings.TrimSpace(c.QueryParam("sort"))
    order := strings.ToUpper(strings.TrimSpace(c.QueryParam("order")))
    if order != "ASC" && order != "DESC" {
        order = "DESC"
    }

    // whitelist allowed sort columns to avoid SQL injection
    allowed := map[string]string{
        "id":         "id",
        "name":       "name",
        "price":      "price",
        "created_at": "created_at",
        "updated_at": "updated_at",
    }
    sortCol, ok := allowed[sortField]
    if !ok || sortCol == "" {
        sortCol = "id"
    }

    db := GetDB(c).Model(&domain.Product{})
    if q != "" {
        if strings.EqualFold(db.Name(), "postgres") { //nolint:staticcheck
            db = db.Where("name ILIKE ?", "%"+q+"%")
        } else {
            db = db.Where("LOWER(name) LIKE ?", "%"+strings.ToLower(q)+"%")
        }
    }
    if nameFilter != "" {
        db = db.Where("name = ?", nameFilter)
    }

    var total int64
    if err := db.Count(&total).Error; err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to query products", err.Error())
    }

    var rows []domain.Product
    if err := db.Order(sortCol + " " + order).Offset((page-1)*pageSize).Limit(pageSize).Find(&rows).Error; err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to query products", err.Error())
    }

    return paged(c, rows, total, page, pageSize)
}

func getProduct(c echo.Context) error {
    id, err := strconv.ParseInt(c.Param("id"), 10, 64)
    if err != nil {
        return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid product ID", nil)
    }
    var p domain.Product
    if err := GetDB(c).Where("id = ?", id).First(&p).Error; err != nil {
        return fail(c, http.StatusNotFound, "NOT_FOUND", "Product not found", nil)
    }
    return ok(c, p)
}

func createProduct(c echo.Context) error {
    var payload productPayload
    if err := c.Bind(&payload); err != nil {
        return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Unable to parse product", err.Error())
    }
    // Basic validation
    payload.Name = strings.TrimSpace(payload.Name)
    if payload.Name == "" {
        return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Name is required", nil)
    }
    // Type must be 'service' or 'consumable'
    if payload.Type != "service" && payload.Type != "consumable" {
        return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Type must be 'service' or 'consumable'", nil)
    }
    if payload.Type == "consumable" {
        if payload.Qty == nil || *payload.Qty < 0 {
            return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Qty is required for consumable and must be >= 0", nil)
        }
    } else {
        // service: ignore qty
        payload.Qty = nil
    }

    now := time.Now()
    p := domain.Product{
        Name:      strings.TrimSpace(payload.Name),
        Price:     payload.Price,
        Image:     strings.TrimSpace(payload.Image),
        Type:      payload.Type,
        Qty:       payload.Qty,
        CreatedAt: now,
        UpdatedAt: now,
    }
    if err := GetDB(c).Create(&p).Error; err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to create product", err.Error())
    }
    return ok(c, p)
}

func updateProduct(c echo.Context) error {
    id, err := strconv.ParseInt(c.Param("id"), 10, 64)
    if err != nil {
        return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid product ID", nil)
    }
    var p domain.Product
    if err := GetDB(c).Where("id = ?", id).First(&p).Error; err != nil {
        return fail(c, http.StatusNotFound, "NOT_FOUND", "Product not found", nil)
    }

    var payload productPayload
    if err := c.Bind(&payload); err != nil {
        return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Unable to parse product", err.Error())
    }
    // validation
    payload.Name = strings.TrimSpace(payload.Name)
    if payload.Name == "" {
        return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Name is required", nil)
    }
    if payload.Type != "service" && payload.Type != "consumable" {
        return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Type must be 'service' or 'consumable'", nil)
    }
    if payload.Type == "consumable" {
        if payload.Qty == nil || *payload.Qty < 0 {
            return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Qty is required for consumable and must be >= 0", nil)
        }
    } else {
        payload.Qty = nil
    }

    p.Name = strings.TrimSpace(payload.Name)
    p.Price = payload.Price
    p.Image = strings.TrimSpace(payload.Image)
    p.Type = payload.Type
    p.Qty = payload.Qty
    p.UpdatedAt = time.Now()

    if err := GetDB(c).Save(&p).Error; err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to update product", err.Error())
    }
    return ok(c, p)
}

func deleteProduct(c echo.Context) error {
    id, err := strconv.ParseInt(c.Param("id"), 10, 64)
    if err != nil {
        return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid product ID", nil)
    }
    if err := GetDB(c).Where("id = ?", id).Delete(&domain.Product{}).Error; err != nil {
        return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to delete product", err.Error())
    }
    return ok(c, map[string]interface{}{"id": id})
}
