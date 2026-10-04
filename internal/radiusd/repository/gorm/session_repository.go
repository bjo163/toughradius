package gorm

import (
	"context"
	"fmt"
	"time"

	"github.com/bjo163/mwx-isp/internal/domain"
	cachepkg "github.com/bjo163/mwx-isp/internal/radiusd/cache"
	"github.com/bjo163/mwx-isp/internal/radiusd/repository"
	"github.com/bjo163/mwx-isp/internal/tenancy"
	"github.com/bjo163/mwx-isp/pkg/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// GormSessionRepository is the GORM implementation of the session repository
type GormSessionRepository struct {
	db         *gorm.DB
	countCache *cachepkg.TTLCache[int]
}

// NewGormSessionRepository creates a session repository instance
func NewGormSessionRepository(db *gorm.DB) repository.SessionRepository {
	return &GormSessionRepository{
		db:         db,
		countCache: cachepkg.NewTTLCache[int](2*time.Second, 4096),
	}
}

// Create inserts the online session idempotently. The insert relies on the
// unique index on acct_session_id together with an ON CONFLICT DO NOTHING
// clause, so a retransmitted Accounting-Start can never produce a duplicate
// online row. It returns created=false when the row already existed.
func (r *GormSessionRepository) Create(ctx context.Context, session *domain.RadiusOnline) (bool, error) {
	if session.ID == 0 {
		session.ID = common.UUIDint64()
	}
	result := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "tenant_id"}, {Name: "acct_session_id"}},
			DoNothing: true,
		}).
		Create(session)
	if result.Error != nil {
		return false, result.Error
	}
	created := result.RowsAffected > 0
	if created {
		r.invalidate(ctx, session.Username)
	}
	return created, nil
}

func (r *GormSessionRepository) Update(ctx context.Context, session *domain.RadiusOnline) error {
	now := time.Now()
	// Fetch previous session snapshot to calculate delta rate
	var existing domain.RadiusOnline
	if err := r.db.WithContext(ctx).Select("tenant_id, username, nas_addr, acct_input_total, acct_output_total, last_update").
		Where("acct_session_id = ?", session.AcctSessionId).First(&existing).Error; err == nil {
		deltaSec := now.Sub(existing.LastUpdate).Seconds()
		if deltaSec > 0 {
			var inRate, outRate int64
			inDiff := session.AcctInputTotal - existing.AcctInputTotal
			outDiff := session.AcctOutputTotal - existing.AcctOutputTotal
			if inDiff > 0 {
				inRate = int64(float64(inDiff*8) / deltaSec)
			}
			if outDiff > 0 {
				outRate = int64(float64(outDiff*8) / deltaSec)
			}
			_ = r.db.WithContext(ctx).Create(&domain.RadiusTrafficSample{
				TenantID:      existing.TenantID,
				Username:      existing.Username,
				AcctSessionID: session.AcctSessionId,
				NasAddr:       existing.NasAddr,
				InOctets:      session.AcctInputTotal,
				OutOctets:     session.AcctOutputTotal,
				InRateBps:     inRate,
				OutRateBps:    outRate,
				RecordedAt:    now,
			})
		}
	}

	param := map[string]interface{}{
		"acct_input_total":    session.AcctInputTotal,
		"acct_output_total":   session.AcctOutputTotal,
		"acct_input_packets":  session.AcctInputPackets,
		"acct_output_packets": session.AcctOutputPackets,
		"acct_session_time":   session.AcctSessionTime,
		"last_update":         now,
	}
	return r.db.WithContext(ctx).
		Model(&domain.RadiusOnline{}).
		Where("acct_session_id = ?", session.AcctSessionId).
		Updates(param).Error
}

func (r *GormSessionRepository) Delete(ctx context.Context, sessionId string) error {
	username := r.lookupUsernameBySession(ctx, sessionId)
	err := r.db.WithContext(ctx).
		Where("acct_session_id = ?", sessionId).
		Delete(&domain.RadiusOnline{}).Error
	if err == nil {
		r.invalidate(ctx, username)
	}
	return err
}

func (r *GormSessionRepository) GetBySessionId(ctx context.Context, sessionId string) (*domain.RadiusOnline, error) {
	var session domain.RadiusOnline
	err := r.db.WithContext(ctx).
		Where("acct_session_id = ?", sessionId).
		First(&session).Error
	if err != nil {
		return nil, err
	}
	return &session, nil
}

func (r *GormSessionRepository) CountByUsername(ctx context.Context, username string) (int, error) {
	cacheKey := sessionCountCacheKey(ctx, username)
	if username != "" {
		if cached, ok := r.countCache.Get(cacheKey); ok {
			return cached, nil
		}
	}
	var count int64
	err := r.db.WithContext(ctx).
		Model(&domain.RadiusOnline{}).
		Where("username = ?", username).
		Count(&count).Error
	if err == nil && username != "" {
		r.countCache.Set(cacheKey, int(count))
	}
	return int(count), err
}

func (r *GormSessionRepository) Exists(ctx context.Context, sessionId string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&domain.RadiusOnline{}).
		Where("acct_session_id = ?", sessionId).
		Count(&count).Error
	return count > 0, err
}

func (r *GormSessionRepository) BatchDelete(ctx context.Context, ids []string) error {
	err := r.db.WithContext(ctx).
		Where("id IN (?)", ids).
		Delete(&domain.RadiusOnline{}).Error
	if err == nil {
		r.countCache.Clear()
	}
	return err
}

func (r *GormSessionRepository) BatchDeleteByNas(ctx context.Context, nasAddr, nasId string) error {
	if nasAddr != "" {
		if err := r.db.WithContext(ctx).Where("nas_addr = ?", nasAddr).Delete(&domain.RadiusOnline{}).Error; err != nil {
			return err
		}
	}
	if nasId != "" {
		if err := r.db.WithContext(ctx).Where("nas_id = ?", nasId).Delete(&domain.RadiusOnline{}).Error; err != nil {
			return err
		}
	}
	r.countCache.Clear()
	return nil
}

func (r *GormSessionRepository) invalidate(ctx context.Context, username string) {
	if username == "" {
		return
	}
	r.countCache.Delete(sessionCountCacheKey(ctx, username))
}

func sessionCountCacheKey(ctx context.Context, username string) string {
	if tenantID, ok := tenancy.TenantID(ctx); ok {
		return fmt.Sprintf("%d|%s", tenantID, username)
	}
	return username
}

func (r *GormSessionRepository) lookupUsernameBySession(ctx context.Context, sessionId string) string {
	if sessionId == "" {
		return ""
	}
	var result struct {
		Username string
	}
	if err := r.db.WithContext(ctx).
		Model(&domain.RadiusOnline{}).
		Select("username").
		Where("acct_session_id = ?", sessionId).
		Limit(1).
		Take(&result).Error; err != nil {
		return ""
	}
	return result.Username
}
