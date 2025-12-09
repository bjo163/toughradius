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

// schedulerPayload represents the scheduler request structure
type schedulerPayload struct {
	Name     string `json:"name" validate:"required,min=1,max=100"`
	TaskType string `json:"task_type" validate:"required,max=50"`
	Interval int    `json:"interval" validate:"required,min=10"`
	Status   string `json:"status" validate:"omitempty,oneof=enabled disabled"`
	Config   string `json:"config" validate:"omitempty,max=2000"`
	Remark   string `json:"remark" validate:"omitempty,max=500"`
}

// schedulerUpdatePayload relaxes validation rules for partial updates
type schedulerUpdatePayload struct {
	Name     string `json:"name" validate:"omitempty,min=1,max=100"`
	TaskType string `json:"task_type" validate:"omitempty,max=50"`
	Interval int    `json:"interval" validate:"omitempty,min=10"`
	Status   string `json:"status" validate:"omitempty,oneof=enabled disabled"`
	Config   string `json:"config" validate:"omitempty,max=2000"`
	Remark   string `json:"remark" validate:"omitempty,max=500"`
}

// registerSchedulerRoutes registers scheduler API routes
func registerSchedulerRoutes() {
	webserver.ApiGET("/network/schedulers", ListSchedulers)
	webserver.ApiGET("/network/schedulers/:id", GetScheduler)
	webserver.ApiPOST("/network/schedulers", CreateScheduler)
	webserver.ApiPUT("/network/schedulers/:id", UpdateScheduler)
	webserver.ApiDELETE("/network/schedulers/:id", DeleteScheduler)
	webserver.ApiPOST("/network/schedulers/:id/run", TriggerScheduler)
}

// TriggerScheduler triggers the scheduler immediately
func TriggerScheduler(c echo.Context) error {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid scheduler ID", nil)
	}

	appCtx := GetAppContext(c)
	if err := appCtx.RunSchedulerNow(id); err != nil {
		return fail(c, http.StatusInternalServerError, "RUN_FAILED", "Failed to run scheduler", err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}

// ListSchedulers retrieves the scheduler list
// @Summary get the scheduler list
// @Tags Schedulers
// @Param page query int false "Page number"
// @Param perPage query int false "Items per page"
// @Param sort query string false "Sort field"
// @Param order query string false "Sort direction"
// @Param name query string false "Scheduler name"
// @Param status query string false "Scheduler status"
// @Param task_type query string false "Task type"
// @Success 200 {object} ListResponse
// @Router /api/v1/network/schedulers [get]
func ListSchedulers(c echo.Context) error {
	db := GetDB(c)

	page, _ := strconv.Atoi(c.QueryParam("page"))
	perPage, _ := strconv.Atoi(c.QueryParam("perPage"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 10
	}

	sortField := c.QueryParam("sort")
	order := c.QueryParam("order")
	if sortField == "" {
		sortField = "id"
	}
	if order != "ASC" && order != "DESC" {
		order = "DESC"
	}

	var total int64
	var schedulers []domain.NetScheduler

	query := db.Model(&domain.NetScheduler{})

	// Filter by name (case-insensitive)
	if name := strings.TrimSpace(c.QueryParam("name")); name != "" {
		if strings.EqualFold(db.Name(), "postgres") {
			query = query.Where("name ILIKE ?", "%"+name+"%")
		} else {
			query = query.Where("LOWER(name) LIKE ?", "%"+strings.ToLower(name)+"%")
		}
	}

	// Filter by status
	if status := strings.TrimSpace(c.QueryParam("status")); status != "" {
		query = query.Where("status = ?", status)
	}

	// Filter by task type
	if taskType := strings.TrimSpace(c.QueryParam("task_type")); taskType != "" {
		query = query.Where("task_type = ?", taskType)
	}

	query.Count(&total)

	offset := (page - 1) * perPage
	query.Order(sortField + " " + order).Limit(perPage).Offset(offset).Find(&schedulers)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"data":  schedulers,
		"total": total,
	})
}

// GetScheduler fetches a single scheduler
// @Summary get scheduler detail
// @Tags Schedulers
// @Param id path int true "Scheduler ID"
// @Success 200 {object} domain.NetScheduler
// @Router /api/v1/network/schedulers/{id} [get]
func GetScheduler(c echo.Context) error {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid scheduler ID", nil)
	}

	var scheduler domain.NetScheduler
	if err := GetDB(c).First(&scheduler, id).Error; err != nil {
		return fail(c, http.StatusNotFound, "NOT_FOUND", "Scheduler not found", nil)
	}

	return ok(c, scheduler)
}

// CreateScheduler creates a scheduler
// @Summary create a scheduler
// @Tags Schedulers
// @Param scheduler body schedulerPayload true "Scheduler information"
// @Success 201 {object} domain.NetScheduler
// @Router /api/v1/network/schedulers [post]
func CreateScheduler(c echo.Context) error {
	var payload schedulerPayload
	if err := c.Bind(&payload); err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Unable to parse request parameters", err.Error())
	}

	// Validate the request payload
	if err := c.Validate(&payload); err != nil {
		return handleValidationError(c, err)
	}

	// Check whether the name already exists
	var count int64
	GetDB(c).Model(&domain.NetScheduler{}).Where("name = ?", payload.Name).Count(&count)
	if count > 0 {
		return fail(c, http.StatusConflict, "NAME_EXISTS", "Scheduler name already exists", nil)
	}

	// Set default values
	if payload.Status == "" {
		payload.Status = "enabled"
	}

	now := time.Now()
	scheduler := domain.NetScheduler{
		Name:      payload.Name,
		TaskType:  payload.TaskType,
		Interval:  payload.Interval,
		Status:    payload.Status,
		Config:    payload.Config,
		Remark:    payload.Remark,
		NextRunAt: now.Add(time.Duration(payload.Interval) * time.Second),
	}

	if err := GetDB(c).Create(&scheduler).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "CREATE_FAILED", "Failed to create scheduler", err.Error())
	}

	return ok(c, scheduler)
}

// UpdateScheduler updates a scheduler
// @Summary update a scheduler
// @Tags Schedulers
// @Param id path int true "Scheduler ID"
// @Param scheduler body schedulerUpdatePayload true "Scheduler information"
// @Success 200 {object} domain.NetScheduler
// @Router /api/v1/network/schedulers/{id} [put]
func UpdateScheduler(c echo.Context) error {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid scheduler ID", nil)
	}

	var scheduler domain.NetScheduler
	if err := GetDB(c).First(&scheduler, id).Error; err != nil {
		return fail(c, http.StatusNotFound, "NOT_FOUND", "Scheduler not found", nil)
	}

	var payload schedulerUpdatePayload
	if err := c.Bind(&payload); err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Unable to parse request parameters", err.Error())
	}

	if err := c.Validate(&payload); err != nil {
		return handleValidationError(c, err)
	}

	// Check name uniqueness if name is being changed
	if payload.Name != "" && payload.Name != scheduler.Name {
		var count int64
		GetDB(c).Model(&domain.NetScheduler{}).Where("name = ? AND id != ?", payload.Name, id).Count(&count)
		if count > 0 {
			return fail(c, http.StatusConflict, "NAME_EXISTS", "Scheduler name already exists", nil)
		}
	}

	// Build update map
	updates := make(map[string]interface{})
	if payload.Name != "" {
		updates["name"] = payload.Name
	}
	if payload.TaskType != "" {
		updates["task_type"] = payload.TaskType
	}
	if payload.Interval > 0 {
		updates["interval"] = payload.Interval
		// Recalculate next run time
		updates["next_run_at"] = time.Now().Add(time.Duration(payload.Interval) * time.Second)
	}
	if payload.Status != "" {
		updates["status"] = payload.Status
	}
	if payload.Config != "" {
		updates["config"] = payload.Config
	}
	if payload.Remark != "" {
		updates["remark"] = payload.Remark
	}

	if len(updates) > 0 {
		if err := GetDB(c).Model(&scheduler).Updates(updates).Error; err != nil {
			return fail(c, http.StatusInternalServerError, "UPDATE_FAILED", "Failed to update scheduler", err.Error())
		}
	}

	// Reload the scheduler
	GetDB(c).First(&scheduler, id)

	return ok(c, scheduler)
}

// DeleteScheduler deletes a scheduler
// @Summary delete a scheduler
// @Tags Schedulers
// @Param id path int true "Scheduler ID"
// @Success 204 "No Content"
// @Router /api/v1/network/schedulers/{id} [delete]
func DeleteScheduler(c echo.Context) error {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid scheduler ID", nil)
	}

	var scheduler domain.NetScheduler
	if err := GetDB(c).First(&scheduler, id).Error; err != nil {
		return fail(c, http.StatusNotFound, "NOT_FOUND", "Scheduler not found", nil)
	}

	if err := GetDB(c).Delete(&scheduler).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "DELETE_FAILED", "Failed to delete scheduler", err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}
