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
