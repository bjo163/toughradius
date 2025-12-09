package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"runtime/debug"
	"strconv"
	"strings"
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

	zap.L().Info("RunSchedulerNow invoked", zap.Int64("scheduler_id", sched.ID), zap.String("task_type", sched.TaskType), zap.String("name", sched.Name))
	switch sched.TaskType {
	case "latency_check":
		a.runLatencyCheckScheduler(&sched)
	case "snmp_model":
		a.runSnmpModelScheduler(&sched)
	case "api_probe":
		a.runApiProbeScheduler(&sched)
	case "fetch_services":
		a.runFetchServicesScheduler(&sched)
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
		"model":              model,
		"snmp_last_probe_at": now,
		"snmp_last_result":   "ok",
		"snmp_last_message":  msg,
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

// RunFetchServices discovers services/queues on the NAS and persists them as NetService.
// Currently supports Mikrotik (/queue/simple) when VendorCode == "14988".
func (a *Application) RunFetchServices(nasID int64) error {
	var n domain.NetNas
	if err := a.gormDB.First(&n, nasID).Error; err != nil {
		return err
	}

	zap.L().Info("RunFetchServices called", zap.Int64("nas_id", nasID), zap.String("ip", n.Ipaddr))

	// Only Mikrotik supported for now
	if n.VendorCode != "14988" {
		zap.L().Warn("RunFetchServices unsupported vendor", zap.String("vendor_code", n.VendorCode))
		return nil
	}

	port := n.ApiPort
	if port == 0 {
		port = 8728
	}
	addr := fmt.Sprintf("%s:%d", n.Ipaddr, port)

	client, err := routeros.Dial(addr, n.Username, n.Password)
	if err != nil {
		zap.L().Warn("RunFetchServices failed to dial", zap.String("addr", addr), zap.Error(err))
		return err
	}
	defer client.Close()

	// Fetch simple queues
	reply, err := client.Run("/queue/simple/print")
	if err != nil {
		zap.L().Warn("RunFetchServices failed to run command", zap.String("addr", addr), zap.Error(err))
		return err
	}

	now := time.Now()

	// helper to parse sizes like "1M", "512k", "5000000" into Kbps integer
	// preferBps: when true, raw numbers without suffix will be treated as bps (bits per second)
	parseToKbps := func(s string, preferBps bool) int64 {
		if s == "" {
			return 0
		}
		ss := strings.TrimSpace(strings.ToLower(s))
		// remove trailing bps if present
		if strings.HasSuffix(ss, "bps") {
			ss = strings.TrimSuffix(ss, "bps")
			// now ss is a number in bps -> convert to Kbps later
		}

		// helper to parse a single token (no slash)
		parseSingle := func(token string, preferBpsLocal bool) int64 {
			t := strings.TrimSpace(token)
			if t == "" {
				return 0
			}
			// detect suffixes: kb, k, mb, m, gb, g
			mul := float64(1) // multiplier in Kbps
			if strings.HasSuffix(t, "kb") {
				t = strings.TrimSuffix(t, "kb")
				mul = 1
			} else if strings.HasSuffix(t, "k") {
				t = strings.TrimSuffix(t, "k")
				mul = 1
			} else if strings.HasSuffix(t, "mb") {
				t = strings.TrimSuffix(t, "mb")
				mul = 1000
			} else if strings.HasSuffix(t, "m") {
				t = strings.TrimSuffix(t, "m")
				mul = 1000
			} else if strings.HasSuffix(t, "gb") {
				t = strings.TrimSuffix(t, "gb")
				mul = 1000 * 1000
			} else if strings.HasSuffix(t, "g") {
				t = strings.TrimSuffix(t, "g")
				mul = 1000 * 1000
			}

			// parse numeric value
			f, err := strconv.ParseFloat(t, 64)
			if err != nil {
				return 0
			}

			// If no suffix and preferBpsLocal is set, or the number is huge (>= 1,000,000), assume it's in bps and convert to Kbps
			if mul == 1 && !strings.HasSuffix(strings.TrimSpace(token), "k") && !strings.HasSuffix(strings.TrimSpace(token), "kb") && !strings.HasSuffix(strings.TrimSpace(token), "m") && !strings.HasSuffix(strings.TrimSpace(token), "mb") {
				if preferBpsLocal || f >= 1000000 {
					// treat as bps
					return int64(f / 1000.0)
				}
			}

			return int64(f * mul)
		}

		return parseSingle(ss, preferBps)
	}

	for _, re := range reply.Re {
		m := re.Map
		name := m["name"]
		endpoint := m["target"]
		rate := m["rate"]
		// mikrotik max limit may be in "max-limit" or "max_limit"
		maxLimit := m["max-limit"]
		if maxLimit == "" {
			maxLimit = m["max_limit"]
		}
		// parse up/down numeric values (Kbps) from max-limit
		var maxUpKbps, maxDownKbps int64
		// detect whether maxLimit raw tokens appear to be in bps (large raw numbers)
		maxLimitPreferBps := false
		if maxLimit != "" {
			parts := strings.SplitN(maxLimit, "/", 2)
			// if any raw part looks like a large integer >= 1_000_000 and has no suffix, treat max-limit as bps
			for _, p := range parts {
				pt := strings.TrimSpace(p)
				// strip common suffixes for checking
				if pt != "" {
					lower := strings.ToLower(pt)
					if !strings.HasSuffix(lower, "k") && !strings.HasSuffix(lower, "kb") && !strings.HasSuffix(lower, "m") && !strings.HasSuffix(lower, "mb") {
						if f, err := strconv.ParseFloat(lower, 64); err == nil {
							if f >= 1000000 {
								maxLimitPreferBps = true
							}
						}
					}
				}
			}

			if len(parts) == 1 {
				kb := parseToKbps(parts[0], maxLimitPreferBps)
				maxUpKbps = kb
				maxDownKbps = kb
			} else {
				maxUpKbps = parseToKbps(parts[0], maxLimitPreferBps)
				maxDownKbps = parseToKbps(parts[1], maxLimitPreferBps)
			}
		}

		// parse rate (current rate) into up/down Kbps
		var rateUpKbps, rateDownKbps int64
		if rate != "" {
			parts := strings.SplitN(rate, "/", 2)
			// prefer interpreting bare rate tokens in the same unit family as maxLimit when maxLimit looked like bps
			preferBps := maxLimitPreferBps
			if len(parts) == 1 {
				token := parts[0]
				r := parseToKbps(token, preferBps)
				rateUpKbps = r
				rateDownKbps = r
				// if we parsed a value that is implausibly larger than max, try alternate interpretations
				if maxUpKbps > 0 && rateUpKbps > maxUpKbps*2 {
					// try interpret token as raw bytes/sec -> convert to Kbps (bytes*8/1000)
					if f, err := strconv.ParseFloat(strings.TrimSpace(token), 64); err == nil {
						// try bytes/sec interpretation
						bytsk := int64(f * 8.0 / 1000.0)
						if bytsk > 0 && bytsk <= maxUpKbps*12/10 {
							rateUpKbps = bytsk
						} else {
							// try bps interpretation (token is bps -> /1000)
							bpsk := int64(f / 1000.0)
							if bpsk > 0 && bpsk <= maxUpKbps*12/10 {
								rateUpKbps = bpsk
							}
						}
					}
				}
			} else {
				// parse up token
				upTok := parts[0]
				downTok := parts[1]
				rateUpKbps = parseToKbps(upTok, preferBps)
				rateDownKbps = parseToKbps(downTok, preferBps)
				// try alternate interpretations individually when parsed value exceeds max by wide margin
				if maxUpKbps > 0 && rateUpKbps > maxUpKbps*2 {
					if f, err := strconv.ParseFloat(strings.TrimSpace(upTok), 64); err == nil {
						bytsk := int64(f * 8.0 / 1000.0)
						if bytsk > 0 && bytsk <= maxUpKbps*12/10 {
							rateUpKbps = bytsk
						} else {
							bpsk := int64(f / 1000.0)
							if bpsk > 0 && bpsk <= maxUpKbps*12/10 {
								rateUpKbps = bpsk
							}
						}
					}
				}
				if maxDownKbps > 0 && rateDownKbps > maxDownKbps*2 {
					if f, err := strconv.ParseFloat(strings.TrimSpace(downTok), 64); err == nil {
						bytsk := int64(f * 8.0 / 1000.0)
						if bytsk > 0 && bytsk <= maxDownKbps*12/10 {
							rateDownKbps = bytsk
						} else {
							bpsk := int64(f / 1000.0)
							if bpsk > 0 && bpsk <= maxDownKbps*12/10 {
								rateDownKbps = bpsk
							}
						}
					}
				}
			}
		}

		// Sanity check: if parsed rate is wildly larger than max limit, clamp it to max limit
		// This protects against vendor quirks where 'rate' may be reported in unexpected units.
		if maxUpKbps > 0 && rateUpKbps > maxUpKbps*2 {
			// clamp to configured max limit as a safe display value
			rateUpKbps = maxUpKbps
		}
		if maxDownKbps > 0 && rateDownKbps > maxDownKbps*2 {
			rateDownKbps = maxDownKbps
		}

		// Debug logging: show raw and parsed values to help diagnose vendor outputs
		// vendor-specific id (Mikrotik uses ".id") - get it before logging
		vendorID := ""
		if v, ok := m[".id"]; ok {
			vendorID = v
		}

		zap.L().Debug("fetch_service: parsed service",
			zap.Int64("nas_id", n.ID),
			zap.String("name", name),
			zap.String("vendor_id", vendorID),
			zap.String("raw_rate", rate),
			zap.Int64("parsed_rate_up_kbps", rateUpKbps),
			zap.Int64("parsed_rate_down_kbps", rateDownKbps),
			zap.String("raw_max_limit", maxLimit),
			zap.Int64("parsed_max_up_kbps", maxUpKbps),
			zap.Int64("parsed_max_down_kbps", maxDownKbps),
		)

		// If we applied a clamp, log that fact so we can spot adjusted records
		if (maxUpKbps > 0 && rateUpKbps == maxUpKbps) || (maxDownKbps > 0 && rateDownKbps == maxDownKbps) {
			zap.L().Info("fetch_service: rate clamped to max_limit",
				zap.Int64("nas_id", n.ID), zap.String("name", name), zap.String("vendor_id", vendorID), zap.String("raw_rate", rate), zap.String("raw_max_limit", maxLimit),
			)
		}
		// determine disabled status if Mikrotik reports disabled
		status := "enabled"
		if d, ok := m["disabled"]; ok {
			ds := strings.ToLower(strings.TrimSpace(d))
			if ds == "true" || ds == "1" || ds == "yes" || ds == "y" {
				status = "disabled"
			}
		}

		// vendorID already obtained above
		// marshal params
		paramsBytes, _ := json.Marshal(m)

		var svc domain.NetService
		var err error
		if vendorID != "" {
			err = a.gormDB.Where("nas_id = ? AND vendor_service_id = ?", n.ID, vendorID).First(&svc).Error
		} else {
			// fallback to name-based upsert when vendor id not available
			err = a.gormDB.Where("nas_id = ? AND name = ?", n.ID, name).First(&svc).Error
		}

		if errors.Is(err, gorm.ErrRecordNotFound) {
			// create
			svc = domain.NetService{
				NasId:           n.ID,
				VendorServiceId: vendorID,
				Name:            name,
				ServiceType:     "mikrotik.queue.simple",
				Endpoint:        endpoint,
				Rate:            rate,
				MaxLimit:        maxLimit,
				UploadKbps:      maxUpKbps,
				DownloadKbps:    maxDownKbps,
				RateUpKbps:      rateUpKbps,
				RateDownKbps:    rateDownKbps,
				Status:          status,
				Params:          string(paramsBytes),
				VendorCode:      n.VendorCode,
				LastSeenAt:      &now,
			}
			if err := a.gormDB.Create(&svc).Error; err != nil {
				zap.L().Error("failed to create NetService", zap.Error(err), zap.Int64("nas_id", n.ID), zap.String("name", name))
				continue
			}
		} else if err == nil {
			// update
			svc.VendorServiceId = vendorID
			svc.ServiceType = "mikrotik.queue.simple"
			svc.Endpoint = endpoint
			svc.Rate = rate
			svc.MaxLimit = maxLimit
			svc.UploadKbps = maxUpKbps
			svc.DownloadKbps = maxDownKbps
			svc.RateUpKbps = rateUpKbps
			svc.RateDownKbps = rateDownKbps
			svc.Status = status
			svc.Params = string(paramsBytes)
			svc.VendorCode = n.VendorCode
			svc.LastSeenAt = &now
			if err := a.gormDB.Save(&svc).Error; err != nil {
				zap.L().Error("failed to update NetService", zap.Error(err), zap.Int64("nas_id", n.ID), zap.String("name", name))
				continue
			}
		} else {
			zap.L().Error("db error fetching NetService", zap.Error(err))
			continue
		}
	}

	zap.L().Info("RunFetchServices completed", zap.Int64("nas_id", n.ID), zap.Int("count", len(reply.Re)))
	return nil
}
