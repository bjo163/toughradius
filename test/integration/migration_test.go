//go:build integration

package integration

import (
	"strconv"
	"testing"

	"github.com/bjo163/mwx-isp/pkg/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/bjo163/mwx-isp/internal/domain"
)

// TestPostgresMigration asserts that the production schema migrates cleanly on a
// real PostgreSQL server. It calls AutoMigrate directly (rather than the app's
// MigrateDB, which swallows the error) so a migration regression fails loudly,
// then verifies every declared table physically exists.
func TestPostgresMigration(t *testing.T) {
	db := h.appCtx.DB()

	err := db.Migrator().AutoMigrate(domain.Tables...)
	require.NoError(t, err, "AutoMigrate against PostgreSQL must succeed")

	for _, model := range domain.Tables {
		assert.Truef(t, db.Migrator().HasTable(model), "expected table for %T to exist", model)
	}

	// Spot-check a representative table's columns to catch silent column drift.
	for _, col := range []string{"id", "username", "password", "profile_id", "status"} {
		assert.Truef(t, db.Migrator().HasColumn(&domain.RadiusUser{}, col),
			"radius_user.%s column should exist", col)
	}
}

func TestPostgresTenantSequenceAdvancesAfterDefaultTenantMigration(t *testing.T) {
	db := h.appCtx.DB()
	var defaultTenant domain.Tenant
	require.NoError(t, db.Where("slug = ?", "default").First(&defaultTenant).Error)
	require.Equal(t, domain.DefaultTenantID, defaultTenant.ID)

	tenant := domain.Tenant{
		Name: "Sequence Regression",
		Slug: "it-sequence-" + strconv.FormatInt(common.UUIDint64(), 10),
		Kind: "isp", Status: "active",
	}
	require.NoError(t, db.Create(&tenant).Error)
	assert.Greater(t, tenant.ID, defaultTenant.ID, "PostgreSQL must not reuse the explicitly inserted default ID")
	require.NoError(t, db.Delete(&tenant).Error)
}
