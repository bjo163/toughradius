package tenancy

import (
	"context"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type scopedRecord struct {
	ID       int64 `gorm:"primaryKey"`
	TenantID int64 `gorm:"not null;index"`
	Name     string
}

func TestCallbacksScopeTenantReadsAndWrites(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:tenant-scope-test?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, RegisterCallbacks(db))
	require.NoError(t, db.AutoMigrate(&scopedRecord{}))
	require.NoError(t, db.Create(&scopedRecord{ID: 1, TenantID: 10, Name: "A"}).Error)
	require.NoError(t, db.Create(&scopedRecord{ID: 2, TenantID: 20, Name: "B"}).Error)

	tenantA := db.WithContext(WithTenantID(context.Background(), 10))
	var rows []scopedRecord
	require.NoError(t, tenantA.Find(&rows).Error)
	require.Len(t, rows, 1)
	require.Equal(t, int64(10), rows[0].TenantID)

	newRecord := scopedRecord{ID: 3, Name: "created by A"}
	require.NoError(t, tenantA.Create(&newRecord).Error)
	require.Equal(t, int64(10), newRecord.TenantID)

	forged := scopedRecord{ID: 4, TenantID: 20, Name: "forged"}
	require.Error(t, tenantA.Create(&forged).Error)

	result := tenantA.Model(&scopedRecord{}).Where("id = ?", 2).Update("name", "changed")
	require.NoError(t, result.Error)
	require.Zero(t, result.RowsAffected)

	result = tenantA.Delete(&scopedRecord{}, 2)
	require.NoError(t, result.Error)
	require.Zero(t, result.RowsAffected)
	var tenantB scopedRecord
	require.NoError(t, db.First(&tenantB, 2).Error)
	require.Equal(t, "B", tenantB.Name)

	// GORM Save falls back to an upsert when its scoped update affects zero
	// rows. The ON CONFLICT branch must retain the same tenant boundary.
	require.NoError(t, tenantA.Save(&scopedRecord{ID: 2, Name: "Save must not cross tenant"}).Error)
	require.NoError(t, db.First(&tenantB, 2).Error)
	require.Equal(t, "B", tenantB.Name)
}
