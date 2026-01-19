package qos

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/talkincode/toughradius/v9/internal/domain"
	"github.com/talkincode/toughradius/v9/internal/radiusd/qos/clients"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// NasQoSService handles QoS synchronization with NAS devices
type NasQoSService struct {
	db          *gorm.DB
	qosRepo     NasQoSRepository
	logRepo     NasQoSLogRepository
	nasRepo     NasRepository
	userRepo    UserRepository
	clientPool  map[string]clients.QoSClient // Cache of active client connections
	syncTicker  *time.Ticker
	stopChan    chan struct{}
}

// NewNasQoSService creates a new QoS sync service
func NewNasQoSService(
	db *gorm.DB,
	qosRepo NasQoSRepository,
	logRepo NasQoSLogRepository,
	nasRepo NasRepository,
	userRepo UserRepository,
) *NasQoSService {
	return &NasQoSService{
		db:         db,
		qosRepo:    qosRepo,
		logRepo:    logRepo,
		nasRepo:    nasRepo,
		userRepo:   userRepo,
		clientPool: make(map[string]clients.QoSClient),
		stopChan:   make(chan struct{}),
	}
}

// Start begins the QoS sync service with periodic synchronization
// interval: how often to check and sync pending QoS records
func (s *NasQoSService) Start(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = 1 * time.Minute // Default to 1 minute
	}

	s.syncTicker = time.NewTicker(interval)
	go s.syncLoop(ctx)

	zap.L().Info("QoS sync service started",
		zap.Duration("sync_interval", interval),
	)
}

// Stop gracefully stops the QoS sync service
func (s *NasQoSService) Stop() {
	if s.syncTicker != nil {
		s.syncTicker.Stop()
	}

	// Close all cached client connections
	for addr, client := range s.clientPool {
		if err := client.Close(); err != nil {
			zap.L().Warn("error closing client connection",
				zap.String("nas_addr", addr),
				zap.Error(err),
			)
		}
	}

	s.clientPool = make(map[string]clients.QoSClient)
	close(s.stopChan)

	zap.L().Info("QoS sync service stopped")
}

// syncLoop periodically syncs pending QoS records
func (s *NasQoSService) syncLoop(ctx context.Context) {
	for {
		select {
		case <-s.syncTicker.C:
			s.syncPendingQueues(ctx)
		case <-s.stopChan:
			return
		}
	}
}

// syncPendingQueues processes all pending QoS records
func (s *NasQoSService) syncPendingQueues(ctx context.Context) {
	pending, err := s.qosRepo.GetPending(ctx, 100) // Process max 100 at a time
	if err != nil {
		zap.L().Error("failed to get pending queues", zap.Error(err))
		return
	}

	if len(pending) == 0 {
		return
	}

	zap.L().Debug("processing pending queues", zap.Int("count", len(pending)))

	for _, qos := range pending {
		s.syncQueue(ctx, qos)
	}

	// Also process failed queues (with retry logic)
	failed, err := s.qosRepo.GetFailed(ctx, 50)
	if err == nil && len(failed) > 0 {
		zap.L().Debug("retrying failed queues", zap.Int("count", len(failed)))
		for _, qos := range failed {
			s.syncQueue(ctx, qos)
		}
	}
}

// syncQueue syncs a single QoS record to its NAS device
func (s *NasQoSService) syncQueue(ctx context.Context, qos *domain.NasQoS) {
	// Get NAS device info
	nas := &domain.NetNas{}
	if err := s.db.First(nas, qos.NasID).Error; err != nil {
		s.updateQoSError(ctx, qos, fmt.Sprintf("NAS not found: %v", err))
		return
	}

	// Skip if QoS not enabled on this NAS
	if !nas.QoSEnabled {
		zap.L().Warn("QoS not enabled for NAS",
			zap.Int64("nas_id", nas.ID),
			zap.String("nas_addr", nas.Ipaddr),
		)
		s.updateQoSError(ctx, qos, "QoS disabled on NAS")
		return
	}

	// Get or create client for this NAS
	client, err := s.getOrCreateClient(nas)
	if err != nil {
		s.updateQoSError(ctx, qos, fmt.Sprintf("failed to create client: %v", err))
		return
	}

	// Build QoS config
	config := &clients.QoSConfig{
		Name:     qos.QoSName,
		UpRate:   qos.UpRate,
		DownRate: qos.DownRate,
		Extra:    make(map[string]interface{}),
	}

	// Parse remote_config JSON if present
	if qos.RemoteConfig != "" {
		json.Unmarshal([]byte(qos.RemoteConfig), &config.Extra)
	}

	// Create queue on NAS if not already synced
	if qos.RemoteID == "" {
		remoteID, err := client.CreateQueue(ctx, config)
		if err != nil {
			s.updateQoSError(ctx, qos, fmt.Sprintf("create failed: %v", err))
			s.incrementRetry(ctx, qos)
			return
		}

		qos.RemoteID = remoteID
	}

	// Update status to synced
	qos.Status = "synced"
	now := time.Now()
	qos.SyncedAt = &now
	qos.ErrorMsg = ""
	qos.RetryCount = 0

	if err := s.qosRepo.Update(ctx, qos); err != nil {
		zap.L().Error("failed to update QoS status",
			zap.Int64("qos_id", qos.ID),
			zap.Error(err),
		)
		return
	}

	// Log the sync
	s.logSync(ctx, qos, "synced", "success", "", nil, nil)

	zap.L().Info("queue synced successfully",
		zap.String("queue_id", qos.RemoteID),
		zap.String("user", fmt.Sprintf("user_%d", qos.UserID)),
		zap.String("nas", nas.Ipaddr),
	)
}

// getOrCreateClient gets or creates a QoS client for a NAS device
func (s *NasQoSService) getOrCreateClient(nas *domain.NetNas) (clients.QoSClient, error) {
	// Check if client already cached
	if client, ok := s.clientPool[nas.Ipaddr]; ok {
		return client, nil
	}

	// Create new client based on vendor and method
	var client clients.QoSClient
	var err error

	switch nas.VendorCode {
	case "14988": // Mikrotik
		client, err = clients.NewMikrotikClient(
			nas.APIHost,
			nas.APIUsername,
			nas.APIPassword,
			nas.APIPort,
		)
	default:
		return nil, fmt.Errorf("unsupported vendor: %s", nas.VendorCode)
	}

	if err != nil {
		return nil, err
	}

	// Cache the client
	s.clientPool[nas.Ipaddr] = client

	return client, nil
}

// CreateUserQueue creates a QoS queue for a user on a specific NAS
func (s *NasQoSService) CreateUserQueue(ctx context.Context, userID, nasID int64) error {
	// Get user
	user := &domain.RadiusUser{}
	if err := s.db.First(user, userID).Error; err != nil {
		return fmt.Errorf("user not found: %w", err)
	}

	// Get NAS
	nas := &domain.NetNas{}
	if err := s.db.First(nas, nasID).Error; err != nil {
		return fmt.Errorf("NAS not found: %w", err)
	}

	if !nas.QoSEnabled {
		return fmt.Errorf("QoS not enabled on this NAS")
	}

	// Create QoS record
	qos := &domain.NasQoS{
		UserID:    userID,
		NasID:     nasID,
		NasAddr:   nas.Ipaddr,
		VendorCode: nas.VendorCode,
		QoSName:   fmt.Sprintf("user_%d", userID),
		QoSType:   "simple_queue", // Default for Mikrotik
		UpRate:    user.UpRate,
		DownRate:  user.DownRate,
		Method:    nas.QoSMethod,
		Status:    "pending",
	}

	return s.qosRepo.Create(ctx, qos)
}

// DeleteUserQueue deletes a QoS queue for a user
func (s *NasQoSService) DeleteUserQueue(ctx context.Context, userID, nasID int64) error {
	qos, err := s.qosRepo.GetByUserAndNas(ctx, userID, nasID)
	if err != nil {
		return err
	}

	if qos == nil {
		return fmt.Errorf("queue not found for user %d on NAS %d", userID, nasID)
	}

	// Delete from remote device
	if qos.RemoteID != "" {
		nas := &domain.NetNas{}
		if err := s.db.First(nas, nasID).Error; err != nil {
			return err
		}

		client, err := s.getOrCreateClient(nas)
		if err != nil {
			return err
		}

		if err := client.DeleteQueue(ctx, qos.RemoteID); err != nil {
			zap.L().Warn("failed to delete queue from device",
				zap.String("queue_id", qos.RemoteID),
				zap.Error(err),
			)
			// Continue with local deletion even if remote fails
		}
	}

	// Delete from database
	return s.qosRepo.Delete(ctx, qos.ID)
}

// Helper methods

func (s *NasQoSService) updateQoSError(ctx context.Context, qos *domain.NasQoS, errMsg string) {
	if err := s.qosRepo.UpdateStatus(ctx, qos.ID, "failed", errMsg); err != nil {
		zap.L().Error("failed to update error status", zap.Error(err))
	}
}

func (s *NasQoSService) incrementRetry(ctx context.Context, qos *domain.NasQoS) {
	if err := s.qosRepo.IncrementRetry(ctx, qos.ID); err != nil {
		zap.L().Error("failed to increment retry", zap.Error(err))
	}
}

func (s *NasQoSService) logSync(ctx context.Context, qos *domain.NasQoS, action, status, errMsg string, reqPayload, respPayload map[string]interface{}) {
	log := &domain.NasQoSLog{
		QoSID:  qos.ID,
		UserID: qos.UserID,
		NasID:  qos.NasID,
		Action: action,
		Status: status,
		ErrorMsg: errMsg,
		ExecutedAt: time.Now(),
	}

	if reqPayload != nil {
		if b, err := json.Marshal(reqPayload); err == nil {
			log.RequestPayload = string(b)
		}
	}

	if respPayload != nil {
		if b, err := json.Marshal(respPayload); err == nil {
			log.ResponsePayload = string(b)
		}
	}

	if err := s.logRepo.Create(ctx, log); err != nil {
		zap.L().Warn("failed to create QoS log", zap.Error(err))
	}
}
