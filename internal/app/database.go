package app

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/bjo163/mwx-isp/config"
	"github.com/bjo163/mwx-isp/internal/tenancy"
	"github.com/bjo163/mwx-isp/pkg/common"
	"github.com/glebarez/sqlite"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

// getDatabase returns a database connection based on the configuration type
func getDatabase(dbConfig config.DBConfig, workdir string) *gorm.DB {
	dbType := strings.ToLower(dbConfig.Type)
	switch dbType {
	case "sqlite":
		return getSqliteDatabase(dbConfig, workdir)
	case "postgres", "postgresql":
		pool, err := getPgDatabase(dbConfig)
		if err != nil {
			zap.S().Warnf("⚠️  PostgreSQL connection failed (%v). Falling back to standalone embedded SQLite...", err)
			sqliteConfig := dbConfig
			sqliteConfig.Type = "sqlite"
			sqliteConfig.Name = "mwx-isp.db"
			return getSqliteDatabase(sqliteConfig, workdir)
		}
		return pool
	default:
		zap.S().Fatalf("Unsupported database type: %s, supported types: postgres, sqlite", dbConfig.Type)
		return nil
	}
}

// getSqliteDatabase returns a SQLite database connection
func getSqliteDatabase(config config.DBConfig, workdir string) *gorm.DB {
	// e.g., if the name is not an absolute path and not an in-memory DB, store it under workdir/data
	dbPath := config.Name
	if dbPath == "" {
		dbPath = "mwx-isp.db"
	}
	if dbPath != ":memory:" {
		if !filepath.IsAbs(dbPath) {
			// If user specified just filename or relative path, prefix with workdir/data
			// unless it already starts with data or workdir
			cleaned := filepath.Clean(dbPath)
			if strings.HasPrefix(cleaned, "data"+string(filepath.Separator)) || cleaned == "data" {
				dbPath = filepath.Join(workdir, cleaned)
			} else {
				dbPath = filepath.Join(workdir, "data", cleaned)
			}
		}
		if err := os.MkdirAll(filepath.Dir(dbPath), 0700); err != nil {
			zap.S().Warnf("failed to create directory for SQLite DB: %v", err)
		}
	}

	zap.S().Infof("SQLite database path: %s", dbPath)

	pool, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
		SkipDefaultTransaction:                   true,
		PrepareStmt:                              true,
		NamingStrategy: schema.NamingStrategy{
			SingularTable: true,
		},
		Logger: logger.New(
			zap.NewStdLog(zap.L()),
			logger.Config{
				SlowThreshold:             time.Millisecond * 200,
				LogLevel:                  common.If(config.Debug, logger.Info, logger.Silent).(logger.LogLevel), //nolint:errcheck // type assertion is safe
				IgnoreRecordNotFoundError: true,
				Colorful:                  false,
			},
		),
	})
	common.Must(err)
	common.Must(tenancy.RegisterCallbacks(pool))

	sqlDB, err := pool.DB()
	common.Must(err)

	// SQLite connection pool settings
	sqlDB.SetMaxIdleConns(1)
	sqlDB.SetMaxOpenConns(1)

	return pool
}

// getPgDatabase returns a PostgreSQL database connection or error if connection fails
func getPgDatabase(config config.DBConfig) (*gorm.DB, error) {
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%d sslmode=disable TimeZone=Asia/Jakarta",
		config.Host,
		config.User,
		config.Passwd,
		config.Name,
		config.Port)
	pool, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
		SkipDefaultTransaction:                   true,
		PrepareStmt:                              true,
		NamingStrategy: schema.NamingStrategy{
			SingularTable: true, // use singular table name, table for `User` would be `user` with this option enabled
		},
		Logger: logger.New(
			zap.NewStdLog(zap.L()), // io writer
			logger.Config{
				SlowThreshold:             time.Millisecond * 200,                                                // Slow SQL threshold
				LogLevel:                  common.If(config.Debug, logger.Info, logger.Silent).(logger.LogLevel), //nolint:errcheck // type assertion is safe
				IgnoreRecordNotFoundError: true,                                                                  // Ignore ErrRecordNotFound error for logger
				Colorful:                  false,                                                                 // Disable color
			},
		),
	})
	common.Must(err)
	common.Must(tenancy.RegisterCallbacks(pool))
	sqlDB, err := pool.DB()
	if err != nil {
		return nil, err
	}
	// Test the actual ping to ensure credentials and connectivity are valid
	if err := sqlDB.Ping(); err != nil {
		_ = sqlDB.Close()
		return nil, err
	}
	// SetMaxIdleConns sets the maximum number of idle connections in the pool
	sqlDB.SetMaxIdleConns(config.IdleConn)
	// SetMaxOpenConns sets the maximum number of open database connections
	sqlDB.SetMaxOpenConns(config.MaxConn)
	// SetConnMaxLifetime sets the maximum lifetime a connection can be reused
	// sqlDB.SetConnMaxLifetime(time.Hour * 8)
	return pool, nil
}
