package app

import (
	"context"
	"fmt"
	"net"
	"sync"
	"time"
	"github.com/talkincode/toughradius/v9/internal/domain"
	"go.uber.org/zap"
	pinglib "github.com/go-ping/ping"
	gosnmp "github.com/gosnmp/gosnmp"
)

// SchedulerService runs enabled schedulers periodically
func (a *Application) StartSchedulerService(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				a.runSchedulers()
			}
		}
	}()
}

// runSchedulers executes enabled schedulers
func (a *Application) runSchedulers() {
	var schedulers []domain.NetScheduler
	a.gormDB.Where("status = ?", "enabled").Find(&schedulers)
	now := time.Now()
	for _, sched := range schedulers {
		// Only run if now >= next_run_at
		if sched.NextRunAt.IsZero() || now.After(sched.NextRunAt) || now.Equal(sched.NextRunAt) {
			switch sched.TaskType {
			case "latency_check":
				a.runLatencyCheckScheduler(&sched)
			case "snmp_model":
				a.runSnmpModelScheduler(&sched)
			case "api_probe":
				a.runApiProbeScheduler(&sched)
			// Add more task types here
			}
			// Update next_run_at
			a.gormDB.Model(&domain.NetScheduler{}).Where("id = ?", sched.ID).Update("next_run_at", now.Add(time.Duration(sched.Interval)*time.Second))
		}
	}
}

// runLatencyCheckScheduler pings all enabled NAS and updates latency
func (a *Application) runLatencyCheckScheduler(sched *domain.NetScheduler) {
	var nases []domain.NetNas
	a.gormDB.Where("status = ?", "enabled").Find(&nases)

	// Parallelize pings with a semaphore to limit concurrent goroutines
	const defaultMaxWorkers = 50
	maxWorkers64 := a.GetSettingsInt64Value("scheduler", "max_workers")
	maxWorkers := int(maxWorkers64)
	if maxWorkers <= 0 {
		maxWorkers = defaultMaxWorkers
	}
	sem := make(chan struct{}, maxWorkers)
	var wg sync.WaitGroup

	for _, nas := range nases {
		wg.Add(1)
		sem <- struct{}{}
		go func(n domain.NetNas) {
			defer wg.Done()
			defer func() { <-sem }()

			latency := pingNAS(n)

			// Update latency field in DB
			if err := a.gormDB.Model(&domain.NetNas{}).Where("id = ?", n.ID).Update("latency", latency).Error; err != nil {
				zap.L().Error("failed to update NAS latency", zap.String("ip", n.Ipaddr), zap.Error(err))
				return
			}
			zap.L().Info("NAS latency updated", zap.String("ip", n.Ipaddr), zap.Int("latency", latency))
		}(nas)
	}
	wg.Wait()
	// Update scheduler last run
	a.gormDB.Model(&domain.NetScheduler{}).Where("id = ?", sched.ID).Updates(map[string]interface{}{
		"last_run_at": time.Now(),
		"last_result": "success",
		"last_message": "NAS latency updated",
	})
}

// pingNAS returns latency in ms (dummy implementation)
func pingNAS(nas domain.NetNas) int {
	ip := nas.Ipaddr
	// Use github.com/go-ping/ping to perform a real ICMP/UDP ping.
	// Note: On some platforms raw ICMP requires elevated privileges. We call
	// SetPrivileged(false) to allow unprivileged mode (UDP) fallback when possible.
	pinger, err := pinglib.NewPinger(ip)
	if err != nil {
		zap.L().Warn("pingNAS: NewPinger failed", zap.String("ip", ip), zap.Error(err))
		return -1
	}

	pinger.Count = 3
	pinger.Timeout = 3 * time.Second
	// Use unprivileged mode so program can run without root/admin when supported
	pinger.SetPrivileged(false)

	err = pinger.Run() // blocks until finished
	if err != nil {
		// ICMP/UDP ping failed on this platform; downgrade to Debug to avoid noisy WARN
		zap.L().Debug("pingNAS: icmp/udp run failed, will try TCP fallback", zap.String("ip", ip), zap.Error(err))
		// try TCP fallback
	} else {
		stats := pinger.Statistics()
		if stats.PacketsRecv > 0 {
			avg := stats.AvgRtt
			return int(avg.Milliseconds())
		}
	}

	// TCP fallback: try configured API/SNMP ports first, then common ports
	ports := []int{}
	if nas.ApiPort > 0 && nas.ApiState == "enabled" {
		ports = append(ports, nas.ApiPort)
	}
	if nas.SnmpPort > 0 && nas.SnmpState == "enabled" {
		ports = append(ports, nas.SnmpPort)
	}
	// common ports
	ports = append(ports, 1812, 80, 443, 22)

	for _, p := range ports {
		addr := fmt.Sprintf("%s:%d", ip, p)
		start := time.Now()
		conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
		if err == nil {
			conn.Close()
			dur := time.Since(start)
			return int(dur.Milliseconds())
		}
	}

	return -1
}

// runSnmpModelScheduler probes NAS devices via SNMP to read sysDescr and update Model
func (a *Application) runSnmpModelScheduler(sched *domain.NetScheduler) {
	zap.L().Info("runSnmpModelScheduler invoked", zap.Int64("scheduler_id", sched.ID), zap.String("name", sched.Name))
	var nases []domain.NetNas
	a.gormDB.Where("status = ?", "enabled").Find(&nases)

	const defaultMaxWorkers = 25
	maxWorkers64 := a.GetSettingsInt64Value("scheduler", "max_workers")
	maxWorkers := int(maxWorkers64)
	if maxWorkers <= 0 {
		maxWorkers = defaultMaxWorkers
	}
	sem := make(chan struct{}, maxWorkers)
	var wg sync.WaitGroup

	for _, nas := range nases {
		// only probe SNMP-enabled devices and those with community configured
		if nas.SnmpState != "enabled" || nas.SnmpCommunity == "" {
			continue
		}

		wg.Add(1)
		sem <- struct{}{}
		go func(n domain.NetNas) {
			defer wg.Done()
			defer func() { <-sem }()

			model, msg := a.snmpProbeModel(n)
			now := time.Now()
			if model == "" {
				zap.L().Debug("snmp probe returned empty model", zap.String("ip", n.Ipaddr), zap.String("msg", msg))
				// mark probe failed and save message
				if err := a.gormDB.Model(&domain.NetNas{}).Where("id = ?", n.ID).Updates(map[string]interface{}{
					"snmp_last_probe_at": now,
					"snmp_last_result":   "failed",
					"snmp_last_message":  msg,
				}).Error; err != nil {
					zap.L().Error("failed to update NAS snmp probe result", zap.String("ip", n.Ipaddr), zap.Error(err))
				}
				return
			}

			// Update model and probe result in DB
			if err := a.gormDB.Model(&domain.NetNas{}).Where("id = ?", n.ID).Updates(map[string]interface{}{
				"model":               model,
				"snmp_last_probe_at":  now,
				"snmp_last_result":    "ok",
				"snmp_last_message":   msg,
			}).Error; err != nil {
				zap.L().Error("failed to update NAS model/snmp result", zap.String("ip", n.Ipaddr), zap.Error(err))
				return
			}
			zap.L().Info("NAS model updated", zap.String("ip", n.Ipaddr), zap.String("model", model))
		}(nas)
	}
	wg.Wait()

	// Update scheduler last run
	a.gormDB.Model(&domain.NetScheduler{}).Where("id = ?", sched.ID).Updates(map[string]interface{}{
		"last_run_at": time.Now(),
		"last_result": "success",
		"last_message": "SNMP model probe completed",
	})
}

// runApiProbeScheduler probes NAS devices' APIs (e.g., Mikrotik) and updates api_last_* fields
func (a *Application) runApiProbeScheduler(sched *domain.NetScheduler) {
	zap.L().Info("runApiProbeScheduler invoked", zap.Int64("scheduler_id", sched.ID), zap.String("name", sched.Name))
	var nases []domain.NetNas
	a.gormDB.Where("status = ?", "enabled").Find(&nases)

	const defaultMaxWorkers = 25
	maxWorkers64 := a.GetSettingsInt64Value("scheduler", "max_workers")
	maxWorkers := int(maxWorkers64)
	if maxWorkers <= 0 {
		maxWorkers = defaultMaxWorkers
	}
	sem := make(chan struct{}, maxWorkers)
	var wg sync.WaitGroup

	for _, nas := range nases {
		// only probe API-enabled devices with credentials
		if nas.ApiState != "enabled" || nas.Username == "" || nas.Password == "" {
			continue
		}

		wg.Add(1)
		sem <- struct{}{}
		go func(n domain.NetNas) {
			defer wg.Done()
			defer func() { <-sem }()

			if err := a.RunApiProbe(n.ID); err != nil {
				zap.L().Error("api probe failed for nas", zap.String("ip", n.Ipaddr), zap.Error(err))
			}
		}(nas)
	}
	wg.Wait()

	// Update scheduler last run
	a.gormDB.Model(&domain.NetScheduler{}).Where("id = ?", sched.ID).Updates(map[string]interface{}{
		"last_run_at": time.Now(),
		"last_result": "success",
		"last_message": "API probe completed",
	})
}

// snmpProbeModel attempts to read sysDescr.0 via SNMP and returns a short model string (trimmed)
// It also returns a human-readable message (error or extra info) suitable for storing in SnmpLastMessage.
func (a *Application) snmpProbeModel(n domain.NetNas) (string, string) {
	target := n.Ipaddr
	params := &gosnmp.GoSNMP{
		Target:    target,
		Port:      uint16(n.SnmpPort),
		Community: n.SnmpCommunity,
		Version:   gosnmp.Version2c,
		Timeout:   time.Duration(2) * time.Second,
		Retries:   1,
	}
	if params.Port == 0 {
		params.Port = 161
	}

	if err := params.Connect(); err != nil {
		msg := err.Error()
		zap.L().Debug("snmp connect failed, will skip", zap.String("ip", target), zap.Error(err))
		return "", msg
	}
	defer params.Conn.Close()

	// sysDescr.0 OID
	oid := ".1.3.6.1.2.1.1.1.0"
	result, err := params.Get([]string{oid})
	if err != nil || result == nil || len(result.Variables) == 0 {
		var msg string
		if err != nil {
			msg = err.Error()
		} else {
			msg = "empty SNMP result"
		}
		zap.L().Debug("snmp get failed", zap.String("ip", target), zap.String("msg", msg))
		return "", msg
	}

	v := result.Variables[0]
	var descr string
	switch v.Type {
	case gosnmp.OctetString:
		if b, ok := v.Value.([]byte); ok {
			descr = string(b)
		}
	default:
		descr = fmt.Sprintf("%v", v.Value)
	}

	// Basic normalization: take first line and limit length
	if descr == "" {
		return "", "empty sysDescr"
	}
	// trim to first line
	if idx := indexOfNewline(descr); idx >= 0 {
		descr = descr[:idx]
	}
	if len(descr) > 200 {
		descr = descr[:200]
	}
	return descr, descr
}

func indexOfNewline(s string) int {
	for i, r := range s {
		if r == '\n' || r == '\r' {
			return i
		}
	}
	return -1
}
