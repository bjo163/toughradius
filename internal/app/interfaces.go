package app

import (
	"github.com/robfig/cron/v3"
	"github.com/talkincode/toughradius/v9/config"
	"gorm.io/gorm"
)

// DBProvider provides database access
type DBProvider interface {
	DB() *gorm.DB
}

// ConfigProvider provides application configuration
type ConfigProvider interface {
	Config() *config.AppConfig
}

// SettingsProvider provides system settings access
type SettingsProvider interface {
	GetSettingsStringValue(category, key string) string
	GetSettingsInt64Value(category, key string) int64
	GetSettingsBoolValue(category, key string) bool
	SaveSettings(settings map[string]interface{}) error
}

// SchedulerProvider provides task scheduling capability
type SchedulerProvider interface {
	Scheduler() *cron.Cron
}

// ConfigManagerProvider provides configuration manager access
type ConfigManagerProvider interface {
	ConfigMgr() *ConfigManager
}

// ProfileCacheProvider provides profile cache access
type ProfileCacheProvider interface {
	ProfileCache() *ProfileCache
}

// AppContext combines all provider interfaces for full application context
// Services should depend on specific providers or this combined interface
type AppContext interface {
	DBProvider
	ConfigProvider
	SettingsProvider
	SchedulerProvider
	ConfigManagerProvider
	ProfileCacheProvider

	// Application lifecycle methods
	MigrateDB(track bool) error
	InitDb()
	DropAll()
	// RunSchedulerNow triggers a scheduler execution immediately by ID
	RunSchedulerNow(id int64) error
	// RunSnmpProbe triggers an immediate SNMP probe for a single NAS by ID
	RunSnmpProbe(nasID int64) error
	// RunApiProbe triggers an immediate API probe (e.g., Mikrotik) for a single NAS by ID
	RunApiProbe(nasID int64) error
	// RunFetchServices discovers services (queues/etc) from a NAS and persists them.
	// Implementation should dispatch to vendor-specific fetchers (e.g., Mikrotik)
	RunFetchServices(nasID int64) error
}
