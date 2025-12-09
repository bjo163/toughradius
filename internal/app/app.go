package app

import (
	"context"
	"fmt"
	"os"
	"runtime/debug"
	"time"
	_ "time/tzdata"

	"github.com/go-routeros/routeros"
	"github.com/robfig/cron/v3"
	"github.com/talkincode/toughradius/v9/config"
	"github.com/talkincode/toughradius/v9/internal/domain"
	"github.com/talkincode/toughradius/v9/pkg/metrics"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"gopkg.in/natefinch/lumberjack.v2"
	"gorm.io/gorm"
)

const (
	AutoRegisterPopNodeId int64 = 999999999
)

type Application struct {
	appConfig     *config.AppConfig
	gormDB        *gorm.DB
	sched         *cron.Cron
	configManager *ConfigManager
	profileCache  *ProfileCache
}

// Ensure Application implements all interfaces
var (
	_ DBProvider            = (*Application)(nil)
	_ ConfigProvider        = (*Application)(nil)
	_ SettingsProvider      = (*Application)(nil)
	_ SchedulerProvider     = (*Application)(nil)
	_ ConfigManagerProvider = (*Application)(nil)
	_ AppContext            = (*Application)(nil)
)

func NewApplication(appConfig *config.AppConfig) *Application {
	return &Application{appConfig: appConfig}
}

func (a *Application) Config() *config.AppConfig {
	return a.appConfig
}

func (a *Application) DB() *gorm.DB {
	return a.gormDB
}

// OverrideDB replaces the application's database handle (used in tests).
func (a *Application) OverrideDB(db *gorm.DB) {
	a.gormDB = db
}

func (a *Application) Init(cfg *config.AppConfig) {
	loc, err := time.LoadLocation(cfg.System.Location)
	if err != nil {
		zap.S().Error("timezone config error")
	} else {
		time.Local = loc
	}

	// Initialize zap logger
	var zapConfig zap.Config
	if cfg.Logger.Mode == "production" {
		zapConfig = zap.NewProductionConfig()
	} else {
		zapConfig = zap.NewDevelopmentConfig()
	}

	// Configure output paths
	zapConfig.OutputPaths = []string{"stdout"}
	if cfg.Logger.FileEnable {
		zapConfig.OutputPaths = append(zapConfig.OutputPaths, cfg.Logger.Filename)
	}

	// Build logger with file rotation if enabled
	var logger *zap.Logger
	if cfg.Logger.FileEnable {
		lumberJackLogger := &lumberjack.Logger{
			Filename:   cfg.Logger.Filename,
			MaxSize:    64,
			MaxBackups: 7,
			MaxAge:     7,
			Compress:   false,
		}

		core := zapcore.NewTee(
			zapcore.NewCore(
				zapcore.NewJSONEncoder(zap.NewProductionEncoderConfig()),
				zapcore.AddSync(lumberJackLogger),
				zapConfig.Level,
			),
			zapcore.NewCore(
				zapcore.NewConsoleEncoder(zap.NewDevelopmentEncoderConfig()),
				zapcore.AddSync(os.Stdout),
				zapConfig.Level,
			),
		)
		logger = zap.New(core, zap.AddCaller(), zap.AddCallerSkip(1))
	} else {
		logger, err = zapConfig.Build(zap.AddCaller(), zap.AddCallerSkip(1))
		if err != nil {
			panic(err)
		}
	}

	zap.ReplaceGlobals(logger)

	// Initialize metrics with workdir convention
	err = metrics.InitMetrics(cfg.System.Workdir)
	if err != nil {
		zap.S().Warn("Failed to initialize metrics:", err)
	}

	// Initialize database connection
	if cfg.Database.Type == "" {
		cfg.Database.Type = "postgres"
	}
	a.gormDB = getDatabase(cfg.Database, cfg.System.Workdir)
	zap.S().Infof("Database connection successful, type: %s", cfg.Database.Type)

	// Ensure database schema is migrated before loading configs
	if err := a.MigrateDB(false); err != nil {
		zap.S().Errorf("database migration failed: %v", err)
	}

	// wait for database initialization to complete
	go func() {
		time.Sleep(3 * time.Second)
		a.checkSuper()
		a.checkSettings()
		a.checkDefaultPNode()
		a.checkSchedulers()
		a.checkVendors()
	}()

	// Initialize the configuration manager
	a.configManager = NewConfigManager(a)

	// Initialize profile cache for dynamic profile linking
	a.profileCache = NewProfileCache(a.gormDB, DefaultProfileCacheTTL)

	a.initJob()
}

func (a *Application) MigrateDB(track bool) (err error) {
	defer func() {
		if err1 := recover(); err1 != nil {
			if os.Getenv("GO_DEGUB_TRACE") != "" {
				debug.PrintStack()
			}
			err2, ok := err1.(error)
			if ok {
				err = err2
				zap.S().Error(err2.Error())
			}
		}
	}()
	if track {
		if err := a.gormDB.Debug().Migrator().AutoMigrate(domain.Tables...); err != nil {
			zap.S().Error(err)
		}
	} else {
		if err := a.gormDB.Migrator().AutoMigrate(domain.Tables...); err != nil {
			zap.S().Error(err)
		}
	}
	return nil
}

func (a *Application) DropAll() {
	_ = a.gormDB.Migrator().DropTable(domain.Tables...)
}

func (a *Application) InitDb() {
	_ = a.gormDB.Migrator().DropTable(domain.Tables...)
	err := a.gormDB.Migrator().AutoMigrate(domain.Tables...)
	if err != nil {
		zap.S().Error(err)
	}
}

// ConfigMgr returns the configuration manager
func (a *Application) ConfigMgr() *ConfigManager {
	return a.configManager
}

// Scheduler returns the cron scheduler
func (a *Application) Scheduler() *cron.Cron {
	return a.sched
}

// GetSettingsStringValue retrieves a string configuration value
func (a *Application) GetSettingsStringValue(category, key string) string {
	return a.configManager.GetString(category, key)
}

// GetSettingsInt64Value retrieves an int64 configuration value
func (a *Application) GetSettingsInt64Value(category, key string) int64 {
	return a.configManager.GetInt64(category, key)
}

// GetSettingsBoolValue retrieves a boolean configuration value
func (a *Application) GetSettingsBoolValue(category, key string) bool {
	return a.configManager.GetBool(category, key)
}

// SaveSettings saves configuration settings
func (a *Application) SaveSettings(settings map[string]interface{}) error {
	// TODO: Implement proper settings save logic
	// This is a placeholder to satisfy the interface
	return nil
}

// ProfileCache returns the profile cache instance
func (a *Application) ProfileCache() *ProfileCache {
	return a.profileCache
}

// Start scheduler job runner
func (a *Application) StartBackgroundJobs(ctx context.Context) {
	a.StartSchedulerService(ctx)
}

// checkDefaultPNode check default node
func (a *Application) checkDefaultPNode() {
	var pnode domain.NetNode
	err := a.gormDB.Where("id=?", AutoRegisterPopNodeId).First(&pnode).Error
	if err != nil {
		a.gormDB.Create(&domain.NetNode{
			ID:     AutoRegisterPopNodeId,
			Name:   "default",
			Tags:   "system",
			Remark: "Device auto-registration node",
		})
	}
}

// Release releases application resources
func (a *Application) Release() {
	if a.sched != nil {
		a.sched.Stop()
	}

	if a.profileCache != nil {
		a.profileCache.Stop()
	}

	_ = metrics.Close()
	_ = zap.L().Sync()
}

// RunSchedulerNow triggers a scheduler execution immediately by ID
func (a *Application) RunSchedulerNow(id int64) error {
	var sched domain.NetScheduler
	if err := a.gormDB.First(&sched, id).Error; err != nil {
		return err
	}

	switch sched.TaskType {
	case "latency_check":
		a.runLatencyCheckScheduler(&sched)
	case "snmp_model":
		a.runSnmpModelScheduler(&sched)
case "api_probe":
    a.runApiProbeScheduler(&sched)
	default:
		// unsupported task type
	}

	// update last and next run
	now := time.Now()
	a.gormDB.Model(&domain.NetScheduler{}).Where("id = ?", sched.ID).Updates(map[string]interface{}{
		"last_run_at": now,
		"next_run_at": now.Add(time.Duration(sched.Interval) * time.Second),
	})
	return nil
}

// RunSnmpProbe performs an immediate SNMP probe for a single NAS device by ID
func (a *Application) RunSnmpProbe(nasID int64) error {
	var n domain.NetNas
	if err := a.gormDB.First(&n, nasID).Error; err != nil {
		return err
	}

	zap.L().Info("RunSnmpProbe called", zap.Int64("nas_id", nasID), zap.String("ip", n.Ipaddr))

	now := time.Now()
	// ensure SNMP is enabled and community present
	if n.SnmpState != "enabled" || n.SnmpCommunity == "" {
		// mark failed with message
		_ = a.gormDB.Model(&domain.NetNas{}).Where("id = ?", n.ID).Updates(map[string]interface{}{
			"snmp_last_probe_at": now,
			"snmp_last_result":   "failed",
			"snmp_last_message":  "snmp disabled or community missing",
		}).Error
		return nil
	}

	model, msg := a.snmpProbeModel(n)
	if model == "" {
		// failed
		if err := a.gormDB.Model(&domain.NetNas{}).Where("id = ?", n.ID).Updates(map[string]interface{}{
			"snmp_last_probe_at": now,
			"snmp_last_result":   "failed",
			"snmp_last_message":  msg,
		}).Error; err != nil {
			zap.L().Error("failed to update NAS snmp probe result", zap.String("ip", n.Ipaddr), zap.Error(err))
			return err
		}
		return nil
	}

	// success
	if err := a.gormDB.Model(&domain.NetNas{}).Where("id = ?", n.ID).Updates(map[string]interface{}{
		"model":               model,
		"snmp_last_probe_at":  now,
		"snmp_last_result":    "ok",
		"snmp_last_message":   msg,
	}).Error; err != nil {
		zap.L().Error("failed to update NAS model/snmp result", zap.String("ip", n.Ipaddr), zap.Error(err))
		return err
	}
	zap.L().Info("RunSnmpProbe: NAS model updated", zap.String("ip", n.Ipaddr), zap.String("model", model))
	return nil
}

// RunApiProbe performs an immediate API probe for a single NAS device by ID
func (a *Application) RunApiProbe(nasID int64) error {
	var n domain.NetNas
	if err := a.gormDB.First(&n, nasID).Error; err != nil {
		return err
	}

	zap.L().Info("RunApiProbe called", zap.Int64("nas_id", nasID), zap.String("ip", n.Ipaddr))

	now := time.Now()
	// ensure API is enabled and credentials present
	if n.ApiState != "enabled" || n.Username == "" || n.Password == "" {
		_ = a.gormDB.Model(&domain.NetNas{}).Where("id = ?", n.ID).Updates(map[string]interface{}{
			"api_last_probe_at": now,
			"api_last_result":   "failed",
			"api_last_message":  "api disabled or credentials missing",
		}).Error
		return nil
	}

	// Only Mikrotik vendor currently supported
	if n.VendorCode != "14988" {
		_ = a.gormDB.Model(&domain.NetNas{}).Where("id = ?", n.ID).Updates(map[string]interface{}{
			"api_last_probe_at": now,
			"api_last_result":   "unsupported",
			"api_last_message":  "api probe only supported for Mikrotik (vendor code 14988)",
		}).Error
		return nil
	}

	port := n.ApiPort
	if port == 0 {
		port = 8728
	}

	addr := fmt.Sprintf("%s:%d", n.Ipaddr, port)

	// attempt to connect using RouterOS API
	client, err := routeros.Dial(addr, n.Username, n.Password)
	if err != nil {
		_ = a.gormDB.Model(&domain.NetNas{}).Where("id = ?", n.ID).Updates(map[string]interface{}{
			"api_last_probe_at": now,
			"api_last_result":   "failed",
			"api_last_message":  err.Error(),
		}).Error
		zap.L().Warn("RunApiProbe failed to dial", zap.String("addr", addr), zap.Error(err))
		return nil
	}
	defer client.Close()

	// try to get device identity
	reply, err := client.Run("/system/identity/print")
	msg := "connected"
	if err == nil && len(reply.Re) > 0 {
		if name, ok := reply.Re[0].Map["name"]; ok {
			msg = fmt.Sprintf("identity=%s", name)
		}
	}

	if err := a.gormDB.Model(&domain.NetNas{}).Where("id = ?", n.ID).Updates(map[string]interface{}{
		"api_last_probe_at": now,
		"api_last_result":   "ok",
		"api_last_message":  msg,
	}).Error; err != nil {
		zap.L().Error("failed to update NAS api probe result", zap.String("ip", n.Ipaddr), zap.Error(err))
		return err
	}

	zap.L().Info("RunApiProbe: NAS api probe ok", zap.String("ip", n.Ipaddr), zap.String("msg", msg))
	return nil
}
