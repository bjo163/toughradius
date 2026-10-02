package app

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/talkincode/toughradius/v9/config"
)

func TestSQLiteDatabaseRespectsPlatformAbsolutePath(t *testing.T) {
	path := filepath.Join(t.TempDir(), "absolute-test.db")
	db := getDatabase(config.DBConfig{Type: "sqlite", Name: path}, t.TempDir())
	sqlDB, err := db.DB()
	require.NoError(t, err)
	defer sqlDB.Close()
	require.NoError(t, db.Exec("CREATE TABLE probe (id INTEGER PRIMARY KEY)").Error)
	_, err = os.Stat(path)
	require.NoError(t, err)
}
