package app

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/talkincode/toughradius/v9/internal/domain"
	"github.com/talkincode/toughradius/v9/pkg/common"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

func (a *Application) checkSuper() {
	const superUsername = "admin"
	const defaultPassword = "toughradius"

	hashedPassword := common.Sha256HashWithSalt(defaultPassword, common.GetSecretSalt())

	var operator domain.SysOpr
	err := a.gormDB.Where("username = ?", superUsername).First(&operator).Error
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		if err := a.gormDB.Create(&domain.SysOpr{
			ID:        common.UUIDint64(),
			Realname:  "administrator",
			Mobile:    "0000",
			Email:     "N/A",
			Username:  superUsername,
			Password:  hashedPassword,
			Level:     "super",
			Status:    common.ENABLED,
			Remark:    "super",
			LastLogin: time.Now(),
		}).Error; err != nil {
			zap.L().Error("failed to create default super admin", zap.Error(err))
		} else {
			zap.L().Info("initialized default super admin account", zap.String("username", superUsername))
		}
		return
	case err != nil:
		zap.L().Error("failed to query super admin", zap.Error(err))
		return
	}

	resetPassword := strings.TrimSpace(operator.Password) == ""
	resetLevel := !strings.EqualFold(operator.Level, "super")
	resetStatus := !strings.EqualFold(operator.Status, common.ENABLED)

	if !resetPassword && !resetLevel && !resetStatus {
		return
	}

	updates := map[string]interface{}{
		"updated_at": time.Now(),
	}
	if resetPassword {
		updates["password"] = hashedPassword
	}
	if resetLevel {
		updates["level"] = "super"
	}
	if resetStatus {
		updates["status"] = common.ENABLED
	}

	if err := a.gormDB.Model(&domain.SysOpr{}).Where("id = ?", operator.ID).Updates(updates).Error; err != nil {
		zap.L().Error("failed to repair super admin account", zap.Error(err))
		return
	}

	zap.L().Warn("repaired default super admin account",
		zap.String("username", superUsername),
		zap.Bool("passwordReset", resetPassword),
		zap.Bool("levelReset", resetLevel),
		zap.Bool("statusEnabled", resetStatus))
}

func (a *Application) checkSettings() {
	// Load configuration definitions from the embedded JSON file
	var schemasData ConfigSchemasJSON
	if err := json.Unmarshal(configSchemasData, &schemasData); err != nil {
		zap.L().Error("failed to load config schemas from JSON", zap.Error(err))
		return
	}

	// Iterate over all configuration definitions, checking and initializing missing entries
	for sortid, schema := range schemasData.Schemas {
		// Parse key: "category.name" -> category, name
		parts := strings.SplitN(schema.Key, ".", 2)
		if len(parts) != 2 {
			zap.L().Warn("invalid config key format", zap.String("key", schema.Key))
			continue
		}

		category := parts[0]
		name := parts[1]

		// Check whether the configuration already exists
		var count int64
		a.gormDB.Model(&domain.SysConfig{}).
			Where("type = ? and name = ?", category, name).
			Count(&count)

		// e.g., if the configuration does not exist, create the default configuration
		if count == 0 {
			a.gormDB.Create(&domain.SysConfig{
				ID:     0,
				Sort:   sortid,
				Type:   category,
				Name:   name,
				Value:  schema.Default,
				Remark: schema.Description,
			})
			zap.L().Info("initialized config",
				zap.String("key", schema.Key),
				zap.String("default", schema.Default))
		}
	}
}

// checkSchedulers initializes default scheduled tasks
func (a *Application) checkSchedulers() {
	// Default schedulers to initialize
	defaultSchedulers := []domain.NetScheduler{
		{
			Name:     "NAS Latency Check",
			TaskType: "latency_check",
			Interval: 300, // 5 minutes
			Status:   "enabled",
			Remark:   "Periodically checks latency to all NAS devices",
		},
		{
			Name:     "SNMP Model Probe",
			TaskType: "snmp_model",
			Interval: 3600, // 1 hour
			Status:   "enabled",
			Remark:   "Periodically probes NAS devices via SNMP to update device model",
		},
		{
			Name:     "API Probe (Mikrotik)",
			TaskType: "api_probe",
			Interval: 3600, // 1 hour
			Status:   "enabled",
			Remark:   "Periodically probes NAS devices API (Mikrotik devices)",
		},
			{
				Name:     "Fetch Services (Mikrotik)",
				TaskType: "fetch_services",
				Interval: 3600, // 1 hour
				Status:   "enabled",
				Remark:   "Periodically fetches Mikrotik simple-queue services",
			},
	}

	for _, sched := range defaultSchedulers {
		var count int64
		a.gormDB.Model(&domain.NetScheduler{}).
			Where("task_type = ?", sched.TaskType).
			Count(&count)

		if count == 0 {
			sched.NextRunAt = time.Now().Add(time.Duration(sched.Interval) * time.Second)
			if err := a.gormDB.Create(&sched).Error; err != nil {
				zap.L().Error("failed to create default scheduler",
					zap.String("name", sched.Name),
					zap.Error(err))
			} else {
				zap.L().Info("initialized default scheduler",
					zap.String("name", sched.Name),
					zap.String("task_type", sched.TaskType))
			}
		}
	}
}

// checkVendors initializes default vendor codes used by NAS entries
func (a *Application) checkVendors() {
	defaultVendors := []domain.NetVendor{
		{Code: "9", Name: "Cisco", Remark: "Cisco Systems"},
		{Code: "2011", Name: "Huawei", Remark: "Huawei"},
		{Code: "14988", Name: "Mikrotik", Remark: "Mikrotik"},
		{Code: "25506", Name: "H3C", Remark: "H3C"},
		{Code: "3902", Name: "ZTE", Remark: "ZTE"},
		{Code: "10055", Name: "Ikuai", Remark: "Ikuai"},
		{Code: "0", Name: "Standard", Remark: "Standard/Generic"},
	}

	for _, v := range defaultVendors {
		var count int64
		a.gormDB.Model(&domain.NetVendor{}).Where("code = ?", v.Code).Count(&count)
		if count == 0 {
			v.CreatedAt = time.Now()
			v.UpdatedAt = time.Now()
			if err := a.gormDB.Create(&v).Error; err != nil {
				zap.L().Error("failed to create default vendor", zap.String("code", v.Code), zap.Error(err))
			} else {
				zap.L().Info("initialized default vendor", zap.String("code", v.Code), zap.String("name", v.Name))
			}
		}
	}
}

// checkProducts initializes default CRM products
func (a *Application) checkProducts() {
	defaultProducts := []domain.Product{
		{Name: "demo-widget-basic", Price: 9.99, Image: "", Type: "consumable", Qty: func() *int { v := 100; return &v }()},
		{Name: "demo-widget-pro", Price: 24.5, Image: "", Type: "consumable", Qty: func() *int { v := 50; return &v }()},
		{Name: "demo-service-annual", Price: 199.0, Image: "", Type: "service", Qty: nil},
		{Name: "demo-addon-support", Price: 49.95, Image: "", Type: "consumable", Qty: func() *int { v := 200; return &v }()},
	}

	for _, p := range defaultProducts {
		var count int64
		a.gormDB.Model(&domain.Product{}).Where("name = ?", p.Name).Count(&count)
		if count == 0 {
			p.CreatedAt = time.Now()
			p.UpdatedAt = time.Now()
			if err := a.gormDB.Create(&p).Error; err != nil {
				zap.L().Error("failed to create default product", zap.String("name", p.Name), zap.Error(err))
			} else {
				zap.L().Info("initialized default product", zap.String("name", p.Name))
			}
		}
	}
}
