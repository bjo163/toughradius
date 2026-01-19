package qos

import (
	"context"

	"github.com/talkincode/toughradius/v9/internal/domain"
	"gorm.io/gorm"
)

// NasRepository interface for NAS device data access
type NasRepository interface {
	GetByID(ctx context.Context, id int64) (*domain.NetNas, error)
}

// UserRepository interface for user data access
type UserRepository interface {
	GetByID(ctx context.Context, id int64) (*domain.RadiusUser, error)
}

// NasQoSRepository handles database operations for NAS QoS records
type NasQoSRepository interface {
	// Create inserts a new QoS record
	Create(ctx context.Context, qos *domain.NasQoS) error

	// Update updates an existing QoS record
	Update(ctx context.Context, qos *domain.NasQoS) error

	// GetByID retrieves a QoS record by ID
	GetByID(ctx context.Context, id int64) (*domain.NasQoS, error)

	// GetByRemoteID retrieves a QoS record by remote device ID
	GetByRemoteID(ctx context.Context, remoteID string) (*domain.NasQoS, error)

	// GetPending retrieves all pending QoS records (status = 'pending')
	GetPending(ctx context.Context, limit int) ([]*domain.NasQoS, error)

	// GetFailed retrieves all failed QoS records (status = 'failed')
	GetFailed(ctx context.Context, limit int) ([]*domain.NasQoS, error)

	// GetByUserAndNas retrieves QoS record for a specific user on a specific NAS
	GetByUserAndNas(ctx context.Context, userID, nasID int64) (*domain.NasQoS, error)

	// Delete removes a QoS record
	Delete(ctx context.Context, id int64) error

	// DeleteByRemoteID removes a QoS record by remote ID
	DeleteByRemoteID(ctx context.Context, remoteID string) error

	// UpdateStatus updates the status and error message of a QoS record
	UpdateStatus(ctx context.Context, id int64, status, errorMsg string) error

	// IncrementRetry increments the retry counter
	IncrementRetry(ctx context.Context, id int64) error

	// List retrieves multiple QoS records with pagination
	List(ctx context.Context, filter map[string]interface{}, page, pageSize int) ([]*domain.NasQoS, int64, error)
}

// NasQoSLogRepository handles database operations for QoS audit logs
type NasQoSLogRepository interface {
	// Create inserts a new audit log entry
	Create(ctx context.Context, log *domain.NasQoSLog) error

	// GetByQoSID retrieves all logs for a specific QoS record
	GetByQoSID(ctx context.Context, qosID int64) ([]*domain.NasQoSLog, error)

	// Delete removes old logs (older than N days)
	DeleteOlderThan(ctx context.Context, days int) error
}

// GormNasQoSRepository is the GORM implementation of NasQoSRepository
type GormNasQoSRepository struct {
	db *gorm.DB
}

// NewGormNasQoSRepository creates a new GORM-based repository
func NewGormNasQoSRepository(db *gorm.DB) *GormNasQoSRepository {
	return &GormNasQoSRepository{db: db}
}

func (r *GormNasQoSRepository) Create(ctx context.Context, qos *domain.NasQoS) error {
	return r.db.WithContext(ctx).Create(qos).Error
}

func (r *GormNasQoSRepository) Update(ctx context.Context, qos *domain.NasQoS) error {
	return r.db.WithContext(ctx).Save(qos).Error
}

func (r *GormNasQoSRepository) GetByID(ctx context.Context, id int64) (*domain.NasQoS, error) {
	var qos domain.NasQoS
	err := r.db.WithContext(ctx).First(&qos, id).Error
	return &qos, err
}

func (r *GormNasQoSRepository) GetByRemoteID(ctx context.Context, remoteID string) (*domain.NasQoS, error) {
	var qos domain.NasQoS
	err := r.db.WithContext(ctx).Where("remote_id = ?", remoteID).First(&qos).Error
	return &qos, err
}

func (r *GormNasQoSRepository) GetPending(ctx context.Context, limit int) ([]*domain.NasQoS, error) {
	var qos []*domain.NasQoS
	err := r.db.WithContext(ctx).
		Where("status = ?", "pending").
		Order("created_at ASC").
		Limit(limit).
		Find(&qos).Error
	return qos, err
}

func (r *GormNasQoSRepository) GetFailed(ctx context.Context, limit int) ([]*domain.NasQoS, error) {
	var qos []*domain.NasQoS
	err := r.db.WithContext(ctx).
		Where("status = ?", "failed").
		Where("retry_count < 3").
		Order("created_at ASC").
		Limit(limit).
		Find(&qos).Error
	return qos, err
}

func (r *GormNasQoSRepository) GetByUserAndNas(ctx context.Context, userID, nasID int64) (*domain.NasQoS, error) {
	var qos domain.NasQoS
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND nas_id = ?", userID, nasID).
		First(&qos).Error
	return &qos, err
}

func (r *GormNasQoSRepository) Delete(ctx context.Context, id int64) error {
	return r.db.WithContext(ctx).Delete(&domain.NasQoS{}, id).Error
}

func (r *GormNasQoSRepository) DeleteByRemoteID(ctx context.Context, remoteID string) error {
	return r.db.WithContext(ctx).Where("remote_id = ?", remoteID).Delete(&domain.NasQoS{}).Error
}

func (r *GormNasQoSRepository) UpdateStatus(ctx context.Context, id int64, status, errorMsg string) error {
	return r.db.WithContext(ctx).
		Model(&domain.NasQoS{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{
			"status":    status,
			"error_msg": errorMsg,
		}).Error
}

func (r *GormNasQoSRepository) IncrementRetry(ctx context.Context, id int64) error {
	return r.db.WithContext(ctx).
		Model(&domain.NasQoS{}).
		Where("id = ?", id).
		Update("retry_count", gorm.Expr("retry_count + 1")).Error
}

func (r *GormNasQoSRepository) List(ctx context.Context, filter map[string]interface{}, page, pageSize int) ([]*domain.NasQoS, int64, error) {
	var qos []*domain.NasQoS
	var total int64

	query := r.db.WithContext(ctx)

	// Apply filters
	for key, value := range filter {
		if value != nil && value != "" {
			query = query.Where(key+" = ?", value)
		}
	}

	// Count total
	if err := query.Model(&domain.NasQoS{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Paginate and fetch
	offset := (page - 1) * pageSize
	err := query.
		Order("created_at DESC").
		Offset(offset).
		Limit(pageSize).
		Find(&qos).Error

	return qos, total, err
}

// GormNasQoSLogRepository is the GORM implementation of NasQoSLogRepository
type GormNasQoSLogRepository struct {
	db *gorm.DB
}

// NewGormNasQoSLogRepository creates a new GORM-based log repository
func NewGormNasQoSLogRepository(db *gorm.DB) *GormNasQoSLogRepository {
	return &GormNasQoSLogRepository{db: db}
}

func (r *GormNasQoSLogRepository) Create(ctx context.Context, log *domain.NasQoSLog) error {
	return r.db.WithContext(ctx).Create(log).Error
}

func (r *GormNasQoSLogRepository) GetByQoSID(ctx context.Context, qosID int64) ([]*domain.NasQoSLog, error) {
	var logs []*domain.NasQoSLog
	err := r.db.WithContext(ctx).
		Where("qos_id = ?", qosID).
		Order("created_at DESC").
		Find(&logs).Error
	return logs, err
}

func (r *GormNasQoSLogRepository) DeleteOlderThan(ctx context.Context, days int) error {
	return r.db.WithContext(ctx).
		Where("created_at < DATE_SUB(NOW(), INTERVAL ? DAY)", days).
		Delete(&domain.NasQoSLog{}).Error
}
