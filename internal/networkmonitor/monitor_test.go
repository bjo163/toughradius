package networkmonitor

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"github.com/bjo163/mwx-isp/internal/domain"
	"gorm.io/gorm"
)

type fakeProbe struct {
	mu      sync.Mutex
	results []ProbeResult
	calls   int
}

func (f *fakeProbe) Check(context.Context, domain.NetMonitorTarget, string) ProbeResult {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	index := min(f.calls-1, len(f.results)-1)
	return f.results[index]
}

func (f *fakeProbe) Calls() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

func monitorTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&domain.NetMonitorTarget{}, &domain.NetMonitorSample{}, &domain.NetMonitorIncident{}))
	return db
}

func TestMonitorThresholdCreatesAndResolvesIncident(t *testing.T) {
	db := monitorTestDB(t)
	now := time.Now().Truncate(time.Second)
	target := domain.NetMonitorTarget{
		Name: "edge-router", Kind: "router", Address: "192.0.2.10", ProbeType: "icmp",
		IntervalSeconds: 60, TimeoutMilliseconds: 1000, FailureThreshold: 2, Enabled: true, LastStatus: "unknown",
	}
	require.NoError(t, db.Create(&target).Error)
	probe := &fakeProbe{results: []ProbeResult{
		{Reachable: false, PacketLossPercent: 100, Error: "No ICMP response"},
		{Reachable: false, PacketLossPercent: 100, Error: "No ICMP response"},
		{Reachable: true, LatencyMilliseconds: 4},
	}}
	monitor := New(db, "application-secret", probe)
	var transitions []string
	monitor.SetTransitionHandler(func(_ domain.NetMonitorTarget, from, to string, _ time.Time) {
		transitions = append(transitions, from+"->"+to)
	})

	require.NoError(t, monitor.CheckTarget(context.Background(), target.ID, now))
	require.NoError(t, db.First(&target, target.ID).Error)
	require.Equal(t, "unknown", target.LastStatus, "one failure is below threshold")

	require.NoError(t, monitor.CheckTarget(context.Background(), target.ID, now.Add(time.Minute)))
	require.NoError(t, db.First(&target, target.ID).Error)
	require.Equal(t, "down", target.LastStatus)

	require.NoError(t, monitor.CheckTarget(context.Background(), target.ID, now.Add(2*time.Minute)))
	require.NoError(t, db.First(&target, target.ID).Error)
	require.Equal(t, "up", target.LastStatus)
	require.Equal(t, []string{"unknown->down", "down->up"}, transitions)

	var incidents []domain.NetMonitorIncident
	require.NoError(t, db.Order("id ASC").Find(&incidents).Error)
	require.Len(t, incidents, 1)
	require.Equal(t, "down", incidents[0].State)
	require.NotNil(t, incidents[0].ResolvedAt)

	var samples []domain.NetMonitorSample
	require.NoError(t, db.Order("id ASC").Find(&samples).Error)
	require.Len(t, samples, 3)
	require.False(t, samples[0].Reachable)
	require.True(t, samples[2].Reachable)
}

func TestMonitorPollDueHonorsIntervalAndStoresInterfaceMetrics(t *testing.T) {
	db := monitorTestDB(t)
	now := time.Now().Truncate(time.Second)
	last := now.Add(-20 * time.Second)
	metrics, err := json.Marshal([]InterfaceMetric{{Index: 2, Name: "wan0", Operational: "up", InOctets: "1024"}})
	require.NoError(t, err)
	target := domain.NetMonitorTarget{
		Name: "edge", Kind: "router", Address: "192.0.2.11", ProbeType: "snmp",
		IntervalSeconds: 60, TimeoutMilliseconds: 1000, FailureThreshold: 1, Enabled: true,
		LastStatus: "unknown", LastCheckedAt: &last,
	}
	require.NoError(t, db.Create(&target).Error)
	probe := &fakeProbe{results: []ProbeResult{{Reachable: true, Interfaces: []InterfaceMetric{{Index: 2, Name: "wan0", Operational: "up", InOctets: "1024"}}}}}
	monitor := New(db, "application-secret", probe)

	require.NoError(t, monitor.PollDue(context.Background(), now))
	require.Zero(t, probe.Calls(), "target should not be polled before its interval")
	require.NoError(t, monitor.PollDue(context.Background(), now.Add(45*time.Second)))
	require.Equal(t, 1, probe.Calls())

	var sample domain.NetMonitorSample
	require.NoError(t, db.First(&sample, "target_id = ?", target.ID).Error)
	var got []InterfaceMetric
	require.NoError(t, json.Unmarshal([]byte(sample.InterfaceMetricsJSON), &got))
	require.Equal(t, metrics, []byte(sample.InterfaceMetricsJSON))
	require.Equal(t, "wan0", got[0].Name)
}
