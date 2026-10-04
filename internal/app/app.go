package app

import (
	"context"
	"errors"
	"fmt"
	"os"
	"runtime/debug"
	"strings"
	"sync"
	"time"
	_ "time/tzdata"

	"github.com/bjo163/mwx-isp/config"
	"github.com/bjo163/mwx-isp/internal/demoseed"
	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/internal/networkmonitor"
	"github.com/bjo163/mwx-isp/internal/notify"
	"github.com/bjo163/mwx-isp/pkg/metrics"
	"github.com/robfig/cron/v3"
	"github.com/spf13/cast"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"gopkg.in/natefinch/lumberjack.v2"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	AutoRegisterPopNodeId int64 = 999999999
)

type Application struct {
	appConfig          *config.AppConfig
	gormDB             *gorm.DB
	sched              *cron.Cron
	configManager      *ConfigManager
	profileCache       *ProfileCache
	disconnectMu       sync.RWMutex
	disconnectSession  func(context.Context, domain.RadiusOnline) error
	networkMonitor     *networkmonitor.Monitor
	notificationOutbox *notify.Dispatcher
	whatsAppMu         sync.Mutex
	whatsAppManager    *notify.WhatsAppManager
	whatsAppInitErr    error
}

// Ensure Application implements all interfaces
var (
	_ DBProvider             = (*Application)(nil)
	_ ConfigProvider         = (*Application)(nil)
	_ SettingsProvider       = (*Application)(nil)
	_ SchedulerProvider      = (*Application)(nil)
	_ ConfigManagerProvider  = (*Application)(nil)
	_ AppContext             = (*Application)(nil)
	_ NetworkMonitorProvider = (*Application)(nil)
	_ NotificationProvider   = (*Application)(nil)
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

// SetSessionDisconnectHandler installs the RADIUS session disconnect callback
// used by billing enforcement. The callback is invoked for each matching online
// session after billing suspension. Replacing or reading the callback is safe
// while the scheduler is running. The application package accepts this function
// instead of importing the protocol service, which would create an import cycle.
func (a *Application) SetSessionDisconnectHandler(handler func(context.Context, domain.RadiusOnline) error) {
	a.disconnectMu.Lock()
	a.disconnectSession = handler
	a.disconnectMu.Unlock()
}

func (a *Application) sessionDisconnectHandler() func(context.Context, domain.RadiusOnline) error {
	a.disconnectMu.RLock()
	defer a.disconnectMu.RUnlock()
	return a.disconnectSession
}

// OverrideDB replaces the application's database handle (used in tests).
func (a *Application) OverrideDB(db *gorm.DB) {
	a.gormDB = db
	if a.appConfig != nil {
		a.initializeOperationalServices(a.appConfig)
	}
}

// initializeOperationalServices wires the optional network monitor and
// persistent notification outbox to the current application database.
func (a *Application) initializeOperationalServices(cfg *config.AppConfig) {
	a.networkMonitor = networkmonitor.New(a.gormDB, cfg.Web.Secret, nil)
	a.notificationOutbox = notify.NewDispatcher(a.gormDB, notify.SenderFunc(func(ctx context.Context, recipient, body string) error {
		manager, err := a.WhatsAppManager()
		if err != nil {
			return err
		}
		return manager.Send(ctx, recipient, body)
	}))
	a.networkMonitor.SetTransitionHandler(func(target domain.NetMonitorTarget, _, to string, at time.Time) {
		eventType := "network.down"
		message := fmt.Sprintf("MWX-ISP: network target %s (%s) is not responding.", target.Name, target.Address)
		if to == "up" {
			eventType = "network.recovered"
			message = fmt.Sprintf("MWX-ISP: network target %s (%s) has recovered.", target.Name, target.Address)
		}
		key := fmt.Sprintf("network:%d:%s:%d", target.ID, to, at.Unix())
		if err := a.notificationOutbox.Enqueue(eventType, key, message); err != nil {
			zap.L().Warn("enqueue network alert failed", zap.Error(err))
		}
	})
}

// NetworkMonitor returns the registered-target health monitor.
func (a *Application) NetworkMonitor() *networkmonitor.Monitor { return a.networkMonitor }

// NotificationDispatcher returns the persistent notification outbox service.
func (a *Application) NotificationDispatcher() *notify.Dispatcher { return a.notificationOutbox }

// WhatsAppManager lazily opens the persistent linked-device store. Delaying
// initialization keeps WhatsApp optional until an administrator opens settings.
func (a *Application) WhatsAppManager() (*notify.WhatsAppManager, error) {
	a.whatsAppMu.Lock()
	defer a.whatsAppMu.Unlock()
	if a.whatsAppManager != nil || a.whatsAppInitErr != nil {
		return a.whatsAppManager, a.whatsAppInitErr
	}
	a.whatsAppManager, a.whatsAppInitErr = notify.NewWhatsAppManager(a.gormDB)
	return a.whatsAppManager, a.whatsAppInitErr
}

// NotifyBillingEvents queues recent billing lifecycle events to the configured
// operator allowlist. Disabled integrations produce no outbox rows.
func (a *Application) NotifyBillingEvents(ctx context.Context, since time.Time) error {
	if a.notificationOutbox == nil {
		return nil
	}
	return a.notificationOutbox.EnqueueBillingEvents(ctx, since)
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

	warnInsecureRuntimeDefaults(cfg)

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
	} else {
		a.seedSamplesOnFreshInstall()
	}

	// Create or rotate the bootstrap super-admin before the admin API listens
	// so a well-known password is never reachable on a fresh or upgraded node.
	a.checkSuper()

	// wait for database initialization to complete
	go func() {
		time.Sleep(3 * time.Second)
		a.checkSettings()
		a.checkDefaultPNode()
	}()

	// Initialize the configuration manager and optional operational services.
	a.configManager = NewConfigManager(a)
	a.initializeOperationalServices(cfg)

	// Initialize profile cache for dynamic profile linking
	a.profileCache = NewProfileCache(a.gormDB, DefaultProfileCacheTTL)

	a.initJob()
}

// seedSamplesOnFreshInstall fills a completely empty installation once so the
// first login has useful examples. Any existing operator, network, RADIUS, or
// ISP data suppresses seeding, which keeps upgrades and used databases intact.
func (a *Application) seedSamplesOnFreshInstall() {
	if a == nil || a.gormDB == nil {
		return
	}
	var initialized int64
	if err := a.gormDB.Model(&domain.SysConfig{}).Where("type = ? AND name = ?", "internal", "sample_data_initialized").Count(&initialized).Error; err != nil {
		zap.L().Error("unable to check sample initialization marker", zap.Error(err))
		return
	}
	if initialized > 0 {
		return
	}
	models := []interface{}{
		&domain.NetNas{}, &domain.RadiusProfile{}, &domain.RadiusUser{}, &domain.RadiusOnline{}, &domain.RadiusAccounting{},
		&domain.Customer{}, &domain.InternetPackage{}, &domain.Subscription{}, &domain.Invoice{},
		&domain.Payment{}, &domain.NetMonitorTarget{}, &domain.NetMonitorSample{}, &domain.NetMonitorIncident{}, &domain.SysCert{},
	}
	for _, model := range models {
		var count int64
		if err := a.gormDB.Model(model).Count(&count).Error; err != nil {
			zap.L().Error("unable to check for existing data before sample initialization", zap.Error(err))
			return
		}
		if count > 0 {
			return
		}
	}
	var configuredNodes int64
	if err := a.gormDB.Model(&domain.NetNode{}).Where("id <> ?", AutoRegisterPopNodeId).Count(&configuredNodes).Error; err != nil {
		zap.L().Error("unable to check configured network nodes before sample initialization", zap.Error(err))
		return
	}
	if configuredNodes > 0 {
		a.markSampleInitialization("skipped-existing-data")
		return
	}
	counts, err := demoseed.Seed(a.gormDB, time.Now(), 7)
	if err != nil {
		zap.L().Error("failed to initialize first-install sample data", zap.Error(err))
		return
	}
	a.markSampleInitialization("seeded")
	zap.L().Info("initialized sample data for a fresh installation",
		zap.Int("customers", counts.Customers), zap.Int("subscriptions", counts.Subscriptions),
		zap.Int("invoices", counts.Invoices), zap.Int("payments", counts.Payments))
}

func (a *Application) markSampleInitialization(value string) {
	row := domain.SysConfig{Type: "internal", Name: "sample_data_initialized", Value: value, Remark: "Managed by first-install sample bootstrap"}
	if err := a.gormDB.Where("type = ? AND name = ?", row.Type, row.Name).FirstOrCreate(&row).Error; err != nil {
		zap.L().Error("failed to save sample initialization marker", zap.Error(err))
	}
}

func warnInsecureRuntimeDefaults(cfg *config.AppConfig) {
	if cfg == nil {
		return
	}

	secret := strings.TrimSpace(cfg.Web.Secret)
	fields := []zap.Field{
		zap.String("config", "web.secret"),
		zap.String("env", "TOUGHRADIUS_WEB_SECRET"),
		zap.String("action", "set a long random secret before exposing the admin API"),
	}
	switch secret {
	case "":
		logInsecureRuntimeDefault(cfg, "web jwt signing secret is empty", fields...)
	case config.DefaultWebSecret:
		logInsecureRuntimeDefault(cfg, "web jwt signing secret uses the built-in development placeholder", fields...)
	}
}

func logInsecureRuntimeDefault(cfg *config.AppConfig, msg string, fields ...zap.Field) {
	if isProductionRuntime(cfg) {
		zap.L().Fatal(msg, fields...)
		return
	}
	zap.L().Warn(msg, fields...)
}

func isProductionRuntime(cfg *config.AppConfig) bool {
	if cfg == nil {
		return false
	}
	return !cfg.System.Debug || strings.EqualFold(cfg.Logger.Mode, "production")
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
	// Provision a stable default organization before adding tenant ownership to
	// legacy rows. Existing records receive tenant_id=1 from the additive schema
	// default and are explicitly backfilled again after migration.
	if err := a.ensureDefaultTenant(); err != nil {
		return err
	}
	// Remove duplicate online rows and drop the legacy non-unique index before
	// AutoMigrate creates the unique index on radius_online.acct_session_id
	// (idempotency backstop, including the upgrade path).
	a.dedupOnlineSessions()
	a.dropLegacyOnlineSessionIndex()
	var migrateErr error
	if track {
		migrateErr = a.gormDB.Debug().Migrator().AutoMigrate(domain.Tables...)
	} else {
		migrateErr = a.gormDB.Migrator().AutoMigrate(domain.Tables...)
	}
	if migrateErr != nil {
		zap.S().Error(migrateErr)
		return migrateErr
	}
	if err := a.backfillDefaultTenantRows(); err != nil {
		return err
	}
	if err := a.dropLegacyTenantUniqueIndices(); err != nil {
		return err
	}
	return nil
}

func (a *Application) ensureDefaultTenant() error {
	if a == nil || a.gormDB == nil {
		return fmt.Errorf("database is required to initialize default tenant")
	}
	if err := a.gormDB.AutoMigrate(&domain.Tenant{}); err != nil {
		return fmt.Errorf("create tenant catalog: %w", err)
	}
	tenant := domain.Tenant{
		ID: domain.DefaultTenantID, Name: "Default ISP", Slug: "default", Kind: "isp", Status: "active",
	}
	if err := a.gormDB.Clauses(clause.OnConflict{DoNothing: true}).Create(&tenant).Error; err != nil {
		return fmt.Errorf("initialize default tenant: %w", err)
	}
	return nil
}

func (a *Application) backfillDefaultTenantRows() error {
	for _, model := range tenantOwnedModels {
		if !a.gormDB.Migrator().HasTable(model) || !a.gormDB.Migrator().HasColumn(model, "TenantID") {
			continue
		}
		if err := a.gormDB.Model(model).
			Where("tenant_id IS NULL OR tenant_id = 0").
			Update("tenant_id", domain.DefaultTenantID).Error; err != nil {
			return fmt.Errorf("backfill default tenant for %T: %w", model, err)
		}
	}
	return nil
}

var tenantOwnedModels = []interface{}{
	&domain.SysOpr{}, &domain.SysOprLog{}, &domain.NetNode{}, &domain.NetNas{},
	&domain.NetMonitorTarget{}, &domain.NetMonitorSample{}, &domain.NetMonitorIncident{},
	&domain.NotificationSettings{}, &domain.NotificationOutbox{}, &domain.RadiusAccounting{},
	&domain.RadiusOnline{}, &domain.RadiusSessionActionAudit{}, &domain.RadiusProfile{}, &domain.RadiusUser{},
	&domain.Customer{}, &domain.InternetPackage{}, &domain.Subscription{}, &domain.Invoice{},
	&domain.InvoiceItem{}, &domain.Payment{}, &domain.BillingEvent{}, &domain.DocumentSequence{},
}

func (a *Application) dropLegacyTenantUniqueIndices() error {
	legacy := []struct {
		model interface{}
		name  string
	}{
		{&domain.RadiusUser{}, "idx_radius_user_username"},
		{&domain.RadiusOnline{}, "udx_radius_online_acct_session_id"},
		{&domain.Customer{}, "idx_isp_customer_customer_no"},
		{&domain.InternetPackage{}, "idx_isp_package_code"},
		{&domain.Subscription{}, "idx_isp_subscription_subscription_no"},
		{&domain.Invoice{}, "idx_isp_invoice_invoice_no"},
		{&domain.Invoice{}, "udx_isp_invoice_period"},
		{&domain.Payment{}, "idx_isp_payment_payment_no"},
		{&domain.DocumentSequence{}, "udx_isp_document_sequence"},
		{&domain.NetMonitorTarget{}, "idx_net_monitor_target_name"},
		{&domain.NotificationOutbox{}, "idx_notification_outbox_dedupe_key"},
	}
	for _, index := range legacy {
		if !a.gormDB.Migrator().HasIndex(index.model, index.name) {
			continue
		}
		if err := a.gormDB.Migrator().DropIndex(index.model, index.name); err != nil {
			return fmt.Errorf("drop legacy global unique index %s: %w", index.name, err)
		}
	}
	return nil
}

// dropLegacyOnlineSessionIndex removes the pre-existing non-unique index on
// radius_online.acct_session_id created by older schema versions. The new
// tenant-aware unique index has a different name and is added by AutoMigrate.
// Best-effort: failures are logged.
func (a *Application) dropLegacyOnlineSessionIndex() {
	if a.gormDB == nil {
		return
	}
	m := a.gormDB.Migrator()
	if !m.HasTable(&domain.RadiusOnline{}) {
		return
	}
	const legacyIdx = "idx_radius_online_acct_session_id"
	if !m.HasIndex(&domain.RadiusOnline{}, legacyIdx) {
		return
	}
	if err := m.DropIndex(&domain.RadiusOnline{}, legacyIdx); err != nil {
		zap.L().Warn("drop legacy radius_online index failed",
			zap.String("namespace", "radius"), zap.Error(err))
	}
}

// dedupOnlineSessions removes duplicate radius_online rows that share the same
// Acct-Session-Id before AutoMigrate creates the unique index on that column.
// Existing deployments may already contain duplicate online rows produced by
// retransmitted Accounting-Start packets; without this cleanup the unique
// index creation would fail and the idempotency guarantee would silently not
// apply. It keeps the row with the smallest id per Acct-Session-Id and is
// best-effort: failures are logged but never abort startup.
func (a *Application) dedupOnlineSessions() {
	if a.gormDB == nil {
		return
	}
	if !a.gormDB.Migrator().HasTable(&domain.RadiusOnline{}) {
		return
	}
	table := domain.RadiusOnline{}.TableName()
	groupBy := "acct_session_id"
	if a.gormDB.Migrator().HasColumn(&domain.RadiusOnline{}, "TenantID") {
		groupBy = "tenant_id, acct_session_id"
	}
	sql := fmt.Sprintf("DELETE FROM %s WHERE id NOT IN (SELECT min_id FROM (SELECT MIN(id) AS min_id FROM %s GROUP BY %s) AS keep_ids)", table, table, groupBy)
	if err := a.gormDB.Exec(sql).Error; err != nil {
		zap.L().Warn("dedup radius_online before unique index failed",
			zap.String("namespace", "radius"), zap.Error(err))
	}
}

func (a *Application) DropAll() {
	_ = a.gormDB.Migrator().DropTable(domain.Tables...)
}

func (a *Application) InitDb() {
	_ = a.gormDB.Migrator().DropTable(domain.Tables...)
	err := a.MigrateDB(false)
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

// SaveSettings persists a batch of configuration settings.
//
// Each map key is a fully-qualified configuration key in "category.name" form
// (matching the keys registered in config_schemas.json) and the value is the
// new value, which is rendered to its string representation before being
// written. Every entry is validated and stored through the ConfigManager, which
// updates both the in-memory cache and the sys_config table atomically per key.
//
// If one or more keys fail (unknown key, validation error, or database error),
// the remaining keys are still attempted and a single joined error describing
// every failure is returned.
func (a *Application) SaveSettings(settings map[string]interface{}) error {
	if len(settings) == 0 {
		return nil
	}

	var errs []error
	for key, raw := range settings {
		category, name, ok := strings.Cut(key, ".")
		if !ok || category == "" || name == "" {
			errs = append(errs, fmt.Errorf("invalid settings key %q: expected \"category.name\"", key))
			continue
		}
		if err := a.configManager.Set(category, name, cast.ToString(raw)); err != nil {
			errs = append(errs, fmt.Errorf("save setting %q: %w", key, err))
		}
	}

	return errors.Join(errs...)
}

// ProfileCache returns the profile cache instance
func (a *Application) ProfileCache() *ProfileCache {
	return a.profileCache
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
	a.whatsAppMu.Lock()
	if a.whatsAppManager != nil {
		_ = a.whatsAppManager.Close()
		a.whatsAppManager = nil
	}
	a.whatsAppMu.Unlock()

	_ = metrics.Close()
	_ = zap.L().Sync()
}
