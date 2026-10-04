package gorm

import (
	"context"

	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/internal/radiusd/repository"
	"gorm.io/gorm"
)

// GormNasRepository is the GORM implementation of the NAS repository
type GormNasRepository struct {
	db *gorm.DB
}

// NewGormNasRepository creates a NAS repository instance
func NewGormNasRepository(db *gorm.DB) repository.NasRepository {
	return &GormNasRepository{db: db}
}

func (r *GormNasRepository) GetByIP(ctx context.Context, ip string) (*domain.NetNas, error) {
	var matches []domain.NetNas
	err := r.db.WithContext(ctx).Where("ipaddr = ?", ip).Limit(2).Find(&matches).Error
	if err != nil {
		return nil, err
	}
	if len(matches) == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if len(matches) > 1 {
		return nil, repository.ErrAmbiguousNASIP
	}
	return &matches[0], nil
}

func (r *GormNasRepository) GetByIdentifier(ctx context.Context, identifier string) (*domain.NetNas, error) {
	var nas domain.NetNas
	err := r.db.WithContext(ctx).Where("identifier = ?", identifier).First(&nas).Error
	if err != nil {
		return nil, err
	}
	return &nas, nil
}

func (r *GormNasRepository) GetByIPOrIdentifier(ctx context.Context, ip, _ string) (*domain.NetNas, error) {
	// RFC 2865 section 2.4 and section 5.32 require the packet source IP to
	// select the shared secret; NAS-Identifier is informational only.
	return r.GetByIP(ctx, ip)
}
