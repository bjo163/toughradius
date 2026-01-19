package app

import (
	"context"
	"os"
	"time"

	"github.com/robfig/cron/v3"
	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/process"
	"github.com/talkincode/toughradius/v9/internal/domain"
	"github.com/talkincode/toughradius/v9/internal/radiusd/qos"
	"github.com/talkincode/toughradius/v9/pkg/metrics"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// Simple adapter for NAS repository to implement QoS NasRepository interface
type GormNasRepository struct {
	db *gorm.DB
}

func NewGormNasRepository(db *gorm.DB) *GormNasRepository {
	return &GormNasRepository{db: db}
}

func (r *GormNasRepository) GetByID(ctx context.Context, id int64) (*domain.NetNas, error) {
	var nas domain.NetNas
	err := r.db.WithContext(ctx).First(&nas, id).Error
	if err != nil {
		return nil, err
	}
	return &nas, nil
}

// Simple adapter for User repository to implement QoS UserRepository interface
type GormUserRepository struct {
	db *gorm.DB
}

func NewGormUserRepository(db *gorm.DB) *GormUserRepository {
	return &GormUserRepository{db: db}
}

func (r *GormUserRepository) GetByID(ctx context.Context, id int64) (*domain.RadiusUser, error) {
	var user domain.RadiusUser
	err := r.db.WithContext(ctx).First(&user, id).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

var cronParser = cron.NewParser(
	cron.SecondOptional | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor,
)

func (a *Application) initJob() {
	loc, _ := time.LoadLocation(a.appConfig.System.Location)
	a.sched = cron.New(cron.WithLocation(loc), cron.WithParser(cronParser))

	// Initialize QoS sync service
	a.initQoSService()

	var err error
	_, err = a.sched.AddFunc("@every 30s", func() {
		go a.SchedSystemMonitorTask()
		go a.SchedProcessMonitorTask()
	})
	if err != nil {
		zap.S().Errorf("init job error %s", err.Error())
	}

	_, err = a.sched.AddFunc("@daily", func() {
		a.gormDB.
			Where("opt_time < ? ", time.Now().
				Add(-time.Hour*24*365)).Delete(domain.SysOprLog{})
	})

	if err != nil {
		zap.S().Errorf("init job error %s", err.Error())
	}

	a.sched.Start()
}

// SchedSystemMonitorTask system monitor
func (a *Application) SchedSystemMonitorTask() {
	defer func() {
		if err := recover(); err != nil {
			zap.S().Error(err)
		}
	}()

	// Collect CPU usage
	_cpuuse, err := cpu.Percent(0, false)
	if err == nil && len(_cpuuse) > 0 {
		metrics.SetGauge("system_cpuuse", int64(_cpuuse[0]*100)) // Store as percentage * 100
	}

	// Collect memory usage
	_meminfo, err := mem.VirtualMemory()
	if err == nil {
		metrics.SetGauge("system_memuse", int64(_meminfo.Used/1024/1024)) //nolint:gosec // G115: memory MB value fits in int64
	}
}

// SchedProcessMonitorTask app process monitor
func (a *Application) SchedProcessMonitorTask() {
	defer func() {
		if err := recover(); err != nil {
			zap.S().Error(err)
		}
	}()

	p, err := process.NewProcess(int32(os.Getpid())) //nolint:gosec // G115: PID is always within int32 range
	if err != nil {
		return
	}

	// Collect process CPU usage
	cpuuse, err := p.CPUPercent()
	if err == nil {
		metrics.SetGauge("toughradius_cpuuse", int64(cpuuse*100)) // Store as percentage * 100
	}

	// Collect process memory usage
	meminfo, err := p.MemoryInfo()
	if err == nil {
		metrics.SetGauge("toughradius_memuse", int64(meminfo.RSS/1024/1024)) //nolint:gosec // G115: memory MB value fits in int64
	}
}

func (a *Application) SchedClearExpireData() {
	defer func() {
		if err := recover(); err != nil {
			zap.S().Error(err)
		}
	}()
	// Clean expire online
	a.gormDB.Where("last_update <= ?",
		time.Now().Add(time.Second*300*-1)).
		Delete(&domain.RadiusOnline{})

	// Clean up accounting logs
	idays := a.ConfigMgr().GetInt("radius", "AccountingHistoryDays")
	if idays == 0 {
		idays = 90
	}
	a.gormDB.
		Where("acct_stop_time < ? ", time.Now().
			Add(-time.Hour*24*time.Duration(idays))).Delete(domain.RadiusAccounting{})
}

// initQoSService initializes the QoS sync service for bandwidth management
func (a *Application) initQoSService() {
	defer func() {
		if err := recover(); err != nil {
			zap.S().Error("QoS service initialization panic:", err)
		}
	}()

	// Create repository implementations
	qosRepo := &qos.GormNasQoSRepository{DB: a.gormDB}
	logRepo := &qos.GormNasQoSLogRepository{DB: a.gormDB}
	nasRepo := NewGormNasRepository(a.gormDB)
	userRepo := NewGormUserRepository(a.gormDB)

	// Create and initialize service
	qosService := qos.NewNasQoSService(a.gormDB, qosRepo, logRepo, nasRepo, userRepo)

	// Start sync background process
	// Default sync interval: 1 minute
	qosService.Start(context.Background(), 1*time.Minute)

	// Store reference for graceful shutdown
	a.qosService = qosService

	zap.L().Info("QoS sync service initialized", zap.String("namespace", "qos"))
}
