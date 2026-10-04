// Package networkmonitor polls explicitly registered ISP network targets using
// bounded, read-only ICMP, TCP, and SNMP checks.
package networkmonitor

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gosnmp/gosnmp"
	probing "github.com/prometheus-community/pro-bing"
	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/internal/securestore"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

const (
	defaultTimeout = 1500 * time.Millisecond
	maxConcurrent  = 8
	maxSamplesAge  = 30 * 24 * time.Hour
	maxInterfaces  = 128

	ifNameOID        = "1.3.6.1.2.1.31.1.1.1.1"
	ifOperStatusOID  = "1.3.6.1.2.1.2.2.1.8"
	ifHCInOctetsOID  = "1.3.6.1.2.1.31.1.1.1.6"
	ifHCOutOctetsOID = "1.3.6.1.2.1.31.1.1.1.10"
)

// InterfaceMetric is one read-only SNMP interface sample.
type InterfaceMetric struct {
	Index       int    `json:"index"`
	Name        string `json:"name"`
	Operational string `json:"operational"`
	InOctets    string `json:"in_octets,omitempty"`
	OutOctets   string `json:"out_octets,omitempty"`
}

// ProbeResult is the protocol-independent output of a single target check.
type ProbeResult struct {
	Reachable           bool
	LatencyMilliseconds int64
	PacketLossPercent   float64
	Interfaces          []InterfaceMetric
	Error               string
}

// Probe executes one target check. Implementations must honor the supplied
// deadline and must never perform network writes or configuration changes.
type Probe interface {
	Check(context.Context, domain.NetMonitorTarget, string) ProbeResult
}

// TransitionHandler receives a status change after it has been persisted.
type TransitionHandler func(domain.NetMonitorTarget, string, string, time.Time)

// Monitor manages due target polls and persists sample/incident history. PollDue
// and CheckTarget are serialized per Monitor; both honor context cancellation.
// SetTransitionHandler must be called before polling begins.
type Monitor struct {
	db           *gorm.DB
	keyMaterial  string
	probe        Probe
	mu           sync.Mutex
	onTransition TransitionHandler
}

// New creates a network monitor using keyMaterial as the stable key for
// authenticated encryption of stored SNMP credentials. A nil probe selects the
// system ICMP/TCP/SNMP probe. The returned monitor uses db for all history.
func New(db *gorm.DB, keyMaterial string, probe Probe) *Monitor {
	if probe == nil {
		probe = systemProbe{}
	}
	return &Monitor{db: db, keyMaterial: keyMaterial, probe: probe}
}

// SetTransitionHandler installs a callback invoked after a target's persisted
// status changes to down or recovers to up. Set it before starting polls.
func (m *Monitor) SetTransitionHandler(handler TransitionHandler) {
	m.onTransition = handler
}

// PollDue checks enabled targets whose configured interval has elapsed, storing
// samples and status incidents in db. It returns database/context errors and
// bounds concurrent probes to eight. A busy monitor skips the overlapping call.
func (m *Monitor) PollDue(ctx context.Context, now time.Time) error {
	if !m.mu.TryLock() {
		return nil
	}
	defer m.mu.Unlock()
	var targets []domain.NetMonitorTarget
	if err := m.db.WithContext(ctx).Where("enabled = ?", true).Find(&targets).Error; err != nil {
		return fmt.Errorf("load network monitor targets: %w", err)
	}
	sem := make(chan struct{}, maxConcurrent)
	var wg sync.WaitGroup
	for _, target := range targets {
		if target.LastCheckedAt != nil && now.Sub(*target.LastCheckedAt) < time.Duration(target.IntervalSeconds)*time.Second {
			continue
		}
		select {
		case sem <- struct{}{}:
		case <-ctx.Done():
			wg.Wait()
			return ctx.Err()
		}
		wg.Add(1)
		go func(target domain.NetMonitorTarget) {
			defer wg.Done()
			defer func() { <-sem }()
			if err := m.checkTarget(ctx, target, now); err != nil {
				zap.L().Warn("network target poll failed", zap.Int64("target_id", target.ID), zap.Error(err))
			}
		}(target)
	}
	wg.Wait()
	if err := m.db.WithContext(ctx).Where("checked_at < ?", now.Add(-maxSamplesAge)).Delete(&domain.NetMonitorSample{}).Error; err != nil {
		return fmt.Errorf("prune network monitor history: %w", err)
	}
	return nil
}

// CheckTarget performs an immediate check for an enabled registered target,
// independent of its regular interval. It returns an error if the monitor is
// busy, the target is missing/disabled, or persistence fails.
func (m *Monitor) CheckTarget(ctx context.Context, id int64, now time.Time) error {
	if !m.mu.TryLock() {
		return errors.New("network monitor is busy")
	}
	defer m.mu.Unlock()
	var target domain.NetMonitorTarget
	if err := m.db.WithContext(ctx).First(&target, id).Error; err != nil {
		return err
	}
	return m.checkTarget(ctx, target, now)
}

func (m *Monitor) checkTarget(ctx context.Context, target domain.NetMonitorTarget, now time.Time) error {
	if !target.Enabled {
		return errors.New("target is disabled")
	}
	probeCtx, cancel := context.WithTimeout(ctx, time.Duration(target.TimeoutMilliseconds+3000)*time.Millisecond)
	defer cancel()
	result := m.probe.Check(probeCtx, target, m.keyMaterial)
	metricsJSON, err := json.Marshal(result.Interfaces)
	if err != nil {
		return fmt.Errorf("encode network interface metrics: %w", err)
	}

	var transitionFrom, transitionTo string
	err = m.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var current domain.NetMonitorTarget
		if err := tx.First(&current, target.ID).Error; err != nil {
			return err
		}
		previous := current.LastStatus
		if result.Reachable {
			current.ConsecutiveFailures = 0
			current.LastStatus = "up"
			current.LastError = ""
		} else {
			current.ConsecutiveFailures++
			if current.FailureThreshold < 1 {
				current.FailureThreshold = 2
			}
			if current.ConsecutiveFailures >= current.FailureThreshold {
				current.LastStatus = "down"
				current.LastError = safeError(result.Error)
			}
		}
		current.LastCheckedAt = &now
		current.LastLatencyMilliseconds = result.LatencyMilliseconds
		current.LastPacketLossPercent = result.PacketLossPercent
		current.UpdatedAt = now
		if err := tx.Save(&current).Error; err != nil {
			return err
		}
		sample := domain.NetMonitorSample{
			TargetID: target.ID, CheckedAt: now, Reachable: result.Reachable,
			LatencyMilliseconds:  result.LatencyMilliseconds,
			PacketLossPercent:    result.PacketLossPercent,
			InterfaceMetricsJSON: string(metricsJSON), Error: safeError(result.Error),
		}
		if err := tx.Create(&sample).Error; err != nil {
			return err
		}
		if current.LastStatus != previous && current.LastStatus == "down" {
			transitionFrom, transitionTo = previous, "down"
			if err := tx.Create(&domain.NetMonitorIncident{
				TargetID: current.ID, State: "down", Summary: current.Name + " is not responding",
				StartedAt: now,
			}).Error; err != nil {
				return err
			}
		} else if previous == "down" && current.LastStatus == "up" {
			transitionFrom, transitionTo = "down", "up"
			if err := tx.Model(&domain.NetMonitorIncident{}).
				Where("target_id = ? AND state = ? AND resolved_at IS NULL", current.ID, "down").
				Update("resolved_at", now).Error; err != nil {
				return err
			}
		}
		target = current
		return nil
	})
	if err != nil {
		return fmt.Errorf("persist network target result: %w", err)
	}
	if transitionTo != "" && m.onTransition != nil {
		m.onTransition(target, transitionFrom, transitionTo, now)
	}
	return nil
}

func safeError(value string) string {
	value = strings.TrimSpace(value)
	if len(value) > 240 {
		value = value[:240]
	}
	return value
}

type systemProbe struct{}

func (systemProbe) Check(ctx context.Context, target domain.NetMonitorTarget, key string) ProbeResult {
	timeout := time.Duration(target.TimeoutMilliseconds) * time.Millisecond
	if timeout <= 0 {
		timeout = defaultTimeout
	}
	switch target.ProbeType {
	case "icmp":
		pinger, err := probing.NewPinger(target.Address)
		if err != nil {
			return ProbeResult{Error: err.Error(), PacketLossPercent: 100}
		}
		pinger.Count = 3
		pinger.Interval = 100 * time.Millisecond
		pinger.Timeout = timeout
		pinger.RecordRtts = true
		if runtime.GOOS == "windows" {
			// pro-bing requires ICMP raw mode on Windows; the library documents
			// that this mode works without elevation on supported Windows versions.
			pinger.SetPrivileged(true)
		}
		if err := pinger.RunWithContext(ctx); err != nil {
			return ProbeResult{Error: err.Error(), PacketLossPercent: 100}
		}
		stats := pinger.Statistics()
		return ProbeResult{
			Reachable:           stats.PacketsRecv > 0,
			LatencyMilliseconds: stats.AvgRtt.Milliseconds(),
			PacketLossPercent:   stats.PacketLoss,
			Error: func() string {
				if stats.PacketsRecv == 0 {
					return "No ICMP response"
				}
				return ""
			}(),
		}
	case "tcp":
		if target.Port < 1 || target.Port > 65535 {
			return ProbeResult{Error: "Invalid TCP port", PacketLossPercent: 100}
		}
		started := time.Now()
		conn, err := (&net.Dialer{Timeout: timeout}).DialContext(ctx, "tcp", net.JoinHostPort(target.Address, strconv.Itoa(target.Port)))
		if err != nil {
			return ProbeResult{Error: "TCP connection failed", PacketLossPercent: 100}
		}
		_ = conn.Close()
		return ProbeResult{Reachable: true, LatencyMilliseconds: time.Since(started).Milliseconds()}
	case "http":
		port := target.Port
		if port == 0 {
			port = 80
		}
		scheme := "http"
		if port == 443 {
			scheme = "https"
		}
		targetURL := fmt.Sprintf("%s://%s", scheme, net.JoinHostPort(target.Address, strconv.Itoa(port)))
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
		if err != nil {
			return ProbeResult{Error: "Invalid HTTP request", PacketLossPercent: 100}
		}
		req.Header.Set("User-Agent", "MWX-ISP-Monitor/1.0")
		started := time.Now()
		client := &http.Client{
			Timeout: timeout,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 5 {
					return errors.New("stopped after 5 redirects")
				}
				return nil
			},
		}
		resp, err := client.Do(req)
		if err != nil {
			return ProbeResult{Error: "HTTP connection failed", PacketLossPercent: 100}
		}
		_ = resp.Body.Close()
		latency := time.Since(started).Milliseconds()
		if resp.StatusCode >= 200 && resp.StatusCode < 400 {
			return ProbeResult{Reachable: true, LatencyMilliseconds: latency}
		}
		return ProbeResult{
			Reachable:           false,
			LatencyMilliseconds: latency,
			PacketLossPercent:   100,
			Error:               fmt.Sprintf("HTTP status %d", resp.StatusCode),
		}
	case "snmp":
		return checkSNMP(ctx, target, key, timeout)
	default:
		return ProbeResult{Error: "Unsupported probe type", PacketLossPercent: 100}
	}
}

func checkSNMP(ctx context.Context, target domain.NetMonitorTarget, key string, timeout time.Duration) ProbeResult {
	if target.Port < 0 || target.Port > 65535 {
		return ProbeResult{Error: "Invalid SNMP port", PacketLossPercent: 100}
	}
	params := &gosnmp.GoSNMP{
		Target: target.Address, Port: uint16(target.Port), Transport: "udp", //nolint:gosec // G115: checked above.
		Timeout: timeout, Retries: 0, Context: ctx, MaxRepetitions: 20,
	}
	if params.Port == 0 {
		params.Port = 161
	}
	if target.SNMPVersion == "v3" {
		authSecret, err := securestore.Open(key, target.SNMPAuthEncrypted)
		if err != nil {
			return ProbeResult{Error: "SNMP credentials unavailable", PacketLossPercent: 100}
		}
		privSecret, err := securestore.Open(key, target.SNMPPrivacyEncrypted)
		if err != nil {
			return ProbeResult{Error: "SNMP credentials unavailable", PacketLossPercent: 100}
		}
		params.Version = gosnmp.Version3
		params.SecurityModel = gosnmp.UserSecurityModel
		params.MsgFlags = gosnmp.AuthPriv
		params.SecurityParameters = &gosnmp.UsmSecurityParameters{
			UserName:                 target.SNMPUsername,
			AuthenticationProtocol:   snmpAuthProtocol(target.SNMPAuthProtocol),
			PrivacyProtocol:          snmpPrivProtocol(target.SNMPPrivacyProtocol),
			AuthenticationPassphrase: string(authSecret),
			PrivacyPassphrase:        string(privSecret),
		}
	} else {
		community, err := securestore.Open(key, target.SNMPCommunityEncrypted)
		if err != nil {
			return ProbeResult{Error: "SNMP credentials unavailable", PacketLossPercent: 100}
		}
		params.Version = gosnmp.Version2c
		params.Community = string(community)
	}
	started := time.Now()
	if err := params.Connect(); err != nil {
		return ProbeResult{Error: "SNMP connection failed", PacketLossPercent: 100}
	}
	defer func() { _ = params.Close() }()
	metrics, err := pollInterfaces(params)
	if err != nil {
		return ProbeResult{Error: "SNMP query failed", PacketLossPercent: 100}
	}
	return ProbeResult{Reachable: true, LatencyMilliseconds: time.Since(started).Milliseconds(), Interfaces: metrics}
}

func pollInterfaces(client *gosnmp.GoSNMP) ([]InterfaceMetric, error) {
	metrics := make(map[int]*InterfaceMetric)
	walks := []struct {
		oid   string
		apply func(*InterfaceMetric, gosnmp.SnmpPDU)
	}{
		{ifNameOID, func(metric *InterfaceMetric, pdu gosnmp.SnmpPDU) {
			if value, ok := pdu.Value.([]byte); ok {
				metric.Name = strings.TrimSpace(string(value))
			}
		}},
		{ifOperStatusOID, func(metric *InterfaceMetric, pdu gosnmp.SnmpPDU) {
			if state, ok := pdu.Value.(int); ok {
				metric.Operational = interfaceState(state)
			}
		}},
		{ifHCInOctetsOID, func(metric *InterfaceMetric, pdu gosnmp.SnmpPDU) { metric.InOctets = pduToUintString(pdu.Value) }},
		{ifHCOutOctetsOID, func(metric *InterfaceMetric, pdu gosnmp.SnmpPDU) { metric.OutOctets = pduToUintString(pdu.Value) }},
	}
	for _, walk := range walks {
		var pdus []gosnmp.SnmpPDU
		limitReached := errors.New("interface metric limit reached")
		err := client.BulkWalk(walk.oid, func(pdu gosnmp.SnmpPDU) error {
			if len(pdus) >= maxInterfaces {
				return limitReached
			}
			pdus = append(pdus, pdu)
			return nil
		})
		if errors.Is(err, limitReached) {
			err = nil
		}
		if err != nil {
			if walk.oid == ifNameOID || walk.oid == ifOperStatusOID {
				return nil, err
			}
			continue
		}
		for _, pdu := range pdus {
			index, err := strconv.Atoi(pdu.Name[strings.LastIndex(pdu.Name, ".")+1:])
			if err != nil || index < 1 {
				continue
			}
			metric := metrics[index]
			if metric == nil {
				metric = &InterfaceMetric{Index: index}
				metrics[index] = metric
			}
			walk.apply(metric, pdu)
		}
	}
	result := make([]InterfaceMetric, 0, len(metrics))
	for _, metric := range metrics {
		result = append(result, *metric)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Index < result[j].Index })
	return result, nil
}

func pduToUintString(value any) string {
	switch number := value.(type) {
	case uint:
		return strconv.FormatUint(uint64(number), 10)
	case uint32:
		return strconv.FormatUint(uint64(number), 10)
	case uint64:
		return strconv.FormatUint(number, 10)
	case int:
		if number >= 0 {
			return strconv.FormatUint(uint64(number), 10)
		}
	}
	return ""
}

func interfaceState(code int) string {
	switch code {
	case 1:
		return "up"
	case 2:
		return "down"
	case 3:
		return "testing"
	case 4:
		return "unknown"
	case 5:
		return "dormant"
	case 6:
		return "notPresent"
	case 7:
		return "lowerLayerDown"
	default:
		return "unknown"
	}
}

func snmpAuthProtocol(value string) gosnmp.SnmpV3AuthProtocol {
	switch strings.ToUpper(value) {
	case "SHA256":
		return gosnmp.SHA256
	case "SHA384":
		return gosnmp.SHA384
	case "SHA512":
		return gosnmp.SHA512
	case "MD5":
		return gosnmp.MD5
	default:
		return gosnmp.SHA
	}
}

func snmpPrivProtocol(value string) gosnmp.SnmpV3PrivProtocol {
	switch strings.ToUpper(value) {
	case "AES192":
		return gosnmp.AES192
	case "AES256":
		return gosnmp.AES256
	case "DES":
		return gosnmp.DES
	default:
		return gosnmp.AES
	}
}
