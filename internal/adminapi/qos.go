package adminapi

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/talkincode/toughradius/v9/internal/domain"
	"github.com/talkincode/toughradius/v9/internal/radiusd/qos"
	"github.com/talkincode/toughradius/v9/internal/webserver"
	"go.uber.org/zap"
)

// qosSyncRequest represents manual QoS sync request
type qosSyncRequest struct {
	NasID int64 `json:"nas_id,string" validate:"required"`
}

// qosSyncResponse represents sync result
type qosSyncResponse struct {
	NasID         int64     `json:"nas_id,string"`
	NasAddr       string    `json:"nas_addr"`
	VendorCode    string    `json:"vendor_code"`
	QoSEnabled    bool      `json:"qos_enabled"`
	TotalQueue    int64     `json:"total_queue"`
	PendingQueue  int64     `json:"pending_queue"`
	ProcessedCount int64    `json:"processed_count"`
	Message       string    `json:"message"`
	StartTime     time.Time `json:"start_time"`
	EndTime       time.Time `json:"end_time"`
	Duration      string    `json:"duration"`
}

// ManualTriggerQoSSync manually triggers QoS polling for a specific NAS device
// Useful for testing without waiting for automatic sync interval
//
// @Summary manually trigger QoS sync for a NAS device
// @Tags QoS
// @Param id path int true "NAS ID"
// @Success 200 {object} qosSyncResponse
// @Router /api/v1/network/nas/{id}/qos/sync [post]
func ManualTriggerQoSSync(c echo.Context) error {
	nasID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid NAS ID", nil)
	}

	db := GetDB(c)

	// Get NAS device
	var nas domain.NetNas
	if err := db.First(&nas, nasID).Error; err != nil {
		return fail(c, http.StatusNotFound, "NOT_FOUND", "NAS device not found", nil)
	}

	// Check if QoS is enabled
	if !nas.QoSEnabled {
		return fail(c, http.StatusBadRequest, "QOS_DISABLED", "QoS is not enabled for this NAS device", nil)
	}

	// Get QoS service from app context
	appCtx := GetAppContext(c)
	qosServiceIface := appCtx.GetQoSService()
	if qosServiceIface == nil {
		return fail(c, http.StatusInternalServerError, "SERVICE_ERROR", "QoS service not initialized", nil)
	}

	// Type cast to NasQoSService
	qosService, isValidType := qosServiceIface.(*qos.NasQoSService)
	if !isValidType {
		return fail(c, http.StatusInternalServerError, "SERVICE_ERROR", "Invalid QoS service type", nil)
	}

	startTime := time.Now()

	// Get total queue count
	var totalQueue, pendingQueue int64
	db.Model(&domain.NasQoS{}).Where("nas_id = ?", nasID).Count(&totalQueue)
	db.Model(&domain.NasQoS{}).Where("nas_id = ? AND status = ?", nasID, "pending").Count(&pendingQueue)

	ctx := context.Background()

	// Trigger manual sync
	// Get pending queues and sync them
	var pendingQueues []*domain.NasQoS
	if err := db.Where("nas_id = ? AND status = ?", nasID, "pending").
		Limit(100).
		Find(&pendingQueues).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "QUERY_ERROR", "Failed to get pending queues", err.Error())
	}

	processedCount := int64(len(pendingQueues))

	// Manually sync each pending queue
	for _, queueItem := range pendingQueues {
		qosService.SyncQueue(ctx, queueItem)
	}

	// Also get and sync failed queues
	var failedQueues []*domain.NasQoS
	if err := db.Where("nas_id = ? AND status = ?", nasID, "failed").
		Limit(50).
		Find(&failedQueues).Error; err == nil && len(failedQueues) > 0 {
		for _, queueItem := range failedQueues {
			qosService.SyncQueue(ctx, queueItem)
		}
		processedCount += int64(len(failedQueues))
	}

	endTime := time.Now()
	duration := endTime.Sub(startTime)

	zap.L().Info("Manual QoS sync triggered",
		zap.Int64("nas_id", nasID),
		zap.String("nas_addr", nas.Ipaddr),
		zap.Int64("processed_count", processedCount),
		zap.Duration("duration", duration),
	)

	response := qosSyncResponse{
		NasID:         nasID,
		NasAddr:       nas.Ipaddr,
		VendorCode:    nas.VendorCode,
		QoSEnabled:    nas.QoSEnabled,
		TotalQueue:    totalQueue,
		PendingQueue:  pendingQueue,
		ProcessedCount: processedCount,
		Message:       fmt.Sprintf("Manually synced %d QoS queues", processedCount),
		StartTime:     startTime,
		EndTime:       endTime,
		Duration:      duration.String(),
	}

	return ok(c, response)
}

// GetQoSStatus retrieves QoS status for a NAS device
//
// @Summary get QoS status for a NAS device
// @Tags QoS
// @Param id path int true "NAS ID"
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/network/nas/{id}/qos/status [get]
func GetQoSStatus(c echo.Context) error {
	nasID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid NAS ID", nil)
	}

	db := GetDB(c)

	// Get NAS device
	var nas domain.NetNas
	if err := db.First(&nas, nasID).Error; err != nil {
		return fail(c, http.StatusNotFound, "NOT_FOUND", "NAS device not found", nil)
	}

	// Get QoS statistics
	var totalQueue, pendingQueue, syncedQueue, failedQueue int64
	db.Model(&domain.NasQoS{}).Where("nas_id = ?", nasID).Count(&totalQueue)
	db.Model(&domain.NasQoS{}).Where("nas_id = ? AND status = ?", nasID, "pending").Count(&pendingQueue)
	db.Model(&domain.NasQoS{}).Where("nas_id = ? AND status = ?", nasID, "synced").Count(&syncedQueue)
	db.Model(&domain.NasQoS{}).Where("nas_id = ? AND status = ?", nasID, "failed").Count(&failedQueue)

	// Get last sync log
	var lastLog domain.NasQoSLog
	db.Where("nas_id = ?", nasID).Order("executed_at DESC").First(&lastLog)

	status := map[string]interface{}{
		"nas_id":        nasID,
		"nas_addr":      nas.Ipaddr,
		"vendor_code":   nas.VendorCode,
		"qos_enabled":   nas.QoSEnabled,
		"qos_method":    nas.QoSMethod,
		"api_host":      nas.APIHost,
		"api_port":      nas.APIPort,
		"queue_stats": map[string]interface{}{
			"total":   totalQueue,
			"pending": pendingQueue,
			"synced":  syncedQueue,
			"failed":  failedQueue,
		},
		"last_sync": map[string]interface{}{
			"action":       lastLog.Action,
			"status":       lastLog.Status,
			"error_msg":    lastLog.ErrorMsg,
			"executed_at":  lastLog.ExecutedAt,
		},
	}

	return ok(c, status)
}

// ListQoSQueues retrieves QoS queues for a NAS device
//
// @Summary list QoS queues for a NAS device
// @Tags QoS
// @Param id path int true "NAS ID"
// @Param status query string false "Filter by status (pending, synced, failed)"
// @Param page query int false "Page number"
// @Param perPage query int false "Items per page"
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/network/nas/{id}/qos/queues [get]
func ListQoSQueues(c echo.Context) error {
	nasID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid NAS ID", nil)
	}

	db := GetDB(c)

	// Get NAS device
	var nas domain.NetNas
	if err := db.First(&nas, nasID).Error; err != nil {
		return fail(c, http.StatusNotFound, "NOT_FOUND", "NAS device not found", nil)
	}

	page, _ := strconv.Atoi(c.QueryParam("page"))
	perPage, _ := strconv.Atoi(c.QueryParam("perPage"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 20
	}

	status := c.QueryParam("status")

	var total int64
	var queues []domain.NasQoS

	query := db.Where("nas_id = ?", nasID)
	if status != "" {
		query = query.Where("status = ?", status)
	}

	query.Count(&total)

	offset := (page - 1) * perPage
	query.Order("id DESC").Limit(perPage).Offset(offset).Find(&queues)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"data":  queues,
		"total": total,
		"page":  page,
		"perPage": perPage,
	})
}

// registerQoSRoutes registers QoS routes
func registerQoSRoutes() {
	webserver.ApiPOST("/network/nas/:id/qos/sync", ManualTriggerQoSSync)
	webserver.ApiGET("/network/nas/:id/qos/status", GetQoSStatus)
	webserver.ApiGET("/network/nas/:id/qos/queues", ListQoSQueues)
}
