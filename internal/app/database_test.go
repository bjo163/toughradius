package app

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/bjo163/mwx-isp/config"
)

func TestSQLiteDatabaseRespectsPlatformAbsolutePath(t *testing.T) {
	path := filepath.Join(t.TempDir(), "absolute-test.db")
	db := getDatabase(config.DBConfig{Type: "sqlite", Name: path}, t.TempDir())
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, sqlDB.Close()) })
	require.NoError(t, db.Exec("CREATE TABLE probe (id INTEGER PRIMARY KEY)").Error)
	_, err = os.Stat(path)
	require.NoError(t, err)
}

func TestPostgresFallbackToSQLite(t *testing.T) {
	tempDir := t.TempDir()
	// An unreachable PostgreSQL host/port should automatically fall back to SQLite
	db := getDatabase(config.DBConfig{
		Type:  "postgres",
		Host:  "127.0.0.1",
		Port:  59999, // Unused port
		Name:  "unreachable",
		User:  "unreachable",
		Debug: false,
	}, tempDir)

	require.NotNil(t, db)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })

	// Verify we can execute SQL on the fallback SQLite database
	require.NoError(t, db.Exec("CREATE TABLE fallback_test (id INTEGER PRIMARY KEY, name TEXT)").Error)
	require.NoError(t, db.Exec("INSERT INTO fallback_test (id, name) VALUES (1, 'fallback_ok')").Error)
}
