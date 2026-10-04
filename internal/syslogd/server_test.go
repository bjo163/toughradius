package syslogd

import (
	"context"
	"net"
	"testing"
	"time"

	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestParseSyslogPacket(t *testing.T) {
	tests := []struct {
		name         string
		raw          string
		remoteIP     string
		expectedSev  int
		expectedName string
		expectedTag  string
		expectedMsg  string
	}{
		{
			name:         "MikroTik PPPoE connect log",
			raw:          "<134>Oct 04 11:15:00 router1 pppoe,info: <pppoe-user01>: connected",
			remoteIP:     "192.168.88.1",
			expectedSev:  6,
			expectedName: "info",
			expectedTag:  "pppoe,info",
			expectedMsg:  "<pppoe-user01>: connected",
		},
		{
			name:         "MikroTik Error log",
			raw:          "<131>Oct 04 11:16:00 router1 system,error: link down on ether1",
			remoteIP:     "192.168.88.1",
			expectedSev:  3,
			expectedName: "error",
			expectedTag:  "system,error",
			expectedMsg:  "link down on ether1",
		},
		{
			name:         "Generic simple syslog",
			raw:          "<14>radiusd: access accepted for user test",
			remoteIP:     "127.0.0.1",
			expectedSev:  6,
			expectedName: "info",
			expectedTag:  "radiusd",
			expectedMsg:  "access accepted for user test",
		},
		{
			name:         "Raw message without priority",
			raw:          "system: authentication failure",
			remoteIP:     "10.0.0.1",
			expectedSev:  6,
			expectedName: "info",
			expectedTag:  "system",
			expectedMsg:  "authentication failure",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ev := ParseSyslogPacket(tt.raw, tt.remoteIP)
			assert.Equal(t, tt.remoteIP, ev.NasIP)
			assert.Equal(t, tt.expectedSev, ev.Severity)
			assert.Equal(t, tt.expectedName, ev.SeverityName)
			assert.Equal(t, tt.expectedTag, ev.Tag)
			assert.Equal(t, tt.expectedMsg, ev.Message)
		})
	}
}

func TestServer_StartAndReceiveUDP(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&domain.SyslogEvent{}, &domain.NetNas{}))
	require.NoError(t, db.Create(&domain.NetNas{TenantID: 1, Ipaddr: "127.0.0.1", Name: "test"}).Error)

	srv := NewServer(db, "127.0.0.1:0") // port 0 for random free port
	require.NoError(t, srv.Start())
	defer srv.Stop()

	// Get the bound port
	localAddr := srv.conn.LocalAddr().String()

	conn, err := net.Dial("udp", localAddr)
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, conn.Close()) })

	msg := "<134>Oct 04 11:20:00 router pppoe: test message 123"
	_, err = conn.Write([]byte(msg))
	require.NoError(t, err)

	// Wait for worker to flush
	time.Sleep(700 * time.Millisecond)

	var count int64
	require.NoError(t, db.Model(&domain.SyslogEvent{}).Count(&count).Error)
	assert.GreaterOrEqual(t, count, int64(1))

	var event domain.SyslogEvent
	require.NoError(t, db.First(&event).Error)
	assert.Equal(t, "pppoe", event.Tag)
	assert.Equal(t, "test message 123", event.Message)
}

func TestServer_IngestManual(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&domain.SyslogEvent{}))

	srv := NewServer(db, "")
	ctx := context.Background()

	ev := &domain.SyslogEvent{
		NasIP:        "192.168.1.1",
		Facility:     1,
		Severity:     3,
		SeverityName: "error",
		Tag:          "ospf",
		Message:      "neighbor down",
		CreatedAt:    time.Now(),
	}
	err = srv.IngestManual(ctx, ev)
	require.NoError(t, err)

	var count int64
	require.NoError(t, db.Model(&domain.SyslogEvent{}).Count(&count).Error)
	assert.Equal(t, int64(1), count)
}
