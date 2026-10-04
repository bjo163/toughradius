package app

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/pkg/common"
	"gorm.io/gorm"
)

// bootstrapPlatformAdminFromEnvironment provisions the deployment control-plane
// operator only when explicit credentials are configured. Existing accounts
// are never silently given a new password or platform privileges.
func (a *Application) bootstrapPlatformAdminFromEnvironment() error {
	username := strings.TrimSpace(os.Getenv("MWX_PLATFORM_ADMIN_USERNAME"))
	password := os.Getenv("MWX_PLATFORM_ADMIN_PASSWORD")
	if username == "" && password == "" {
		if a == nil || a.gormDB == nil {
			return nil
		}
		return a.gormDB.Model(&domain.SysOpr{}).Where("platform_admin = ?", true).Update("platform_admin", false).Error
	}
	if username == "" || len(password) < 12 {
		return fmt.Errorf("MWX_PLATFORM_ADMIN_USERNAME and a password of at least 12 characters are required")
	}
	if a == nil || a.gormDB == nil {
		return fmt.Errorf("database is required to bootstrap platform administrator")
	}
	var operator domain.SysOpr
	err := a.gormDB.Where("tenant_id = ? AND username = ?", domain.DefaultTenantID, username).First(&operator).Error
	if err == nil {
		if !common.VerifyPassword(password, operator.Password) {
			return fmt.Errorf("configured platform administrator username already exists with a different password")
		}
		return a.gormDB.Transaction(func(tx *gorm.DB) error {
			if err := tx.Model(&domain.SysOpr{}).Where("platform_admin = ?", true).Update("platform_admin", false).Error; err != nil {
				return err
			}
			return tx.Model(&operator).Update("platform_admin", true).Error
		})
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return fmt.Errorf("look up platform administrator: %w", err)
	}
	hashed, err := common.HashPassword(password)
	if err != nil {
		return fmt.Errorf("hash platform administrator password: %w", err)
	}
	operator = domain.SysOpr{
		ID: common.UUIDint64(), TenantID: domain.DefaultTenantID, PlatformAdmin: true,
		Username: username, Realname: "Platform Administrator", Password: hashed,
		Level: "super", Status: common.ENABLED,
	}
	return a.gormDB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&domain.SysOpr{}).Where("platform_admin = ?", true).Update("platform_admin", false).Error; err != nil {
			return err
		}
		if err := tx.Create(&operator).Error; err != nil {
			return fmt.Errorf("create platform administrator: %w", err)
		}
		return nil
	})
}
