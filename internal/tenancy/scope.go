// Package tenancy provides request-scoped database isolation for tenant-owned
// records. Platform and background operations deliberately omit a tenant ID.
package tenancy

import (
	"context"
	"fmt"
	"reflect"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type tenantContextKey struct{}

// WithTenantID returns ctx carrying an authenticated tenant ID.
func WithTenantID(ctx context.Context, id int64) context.Context {
	if id <= 0 {
		return ctx
	}
	return context.WithValue(ctx, tenantContextKey{}, id)
}

// TenantID returns the authenticated tenant ID carried by ctx.
func TenantID(ctx context.Context) (int64, bool) {
	id, ok := ctx.Value(tenantContextKey{}).(int64)
	return id, ok && id > 0
}

// RegisterCallbacks installs defense-in-depth tenant filters on model-aware
// GORM operations. Raw Table/Exec/SQL operations still require explicit scope.
func RegisterCallbacks(db *gorm.DB) error {
	if err := db.Callback().Query().Before("gorm:query").Register("mwx:tenant_query", scopeQuery); err != nil {
		return err
	}
	if err := db.Callback().Row().Before("gorm:row").Register("mwx:tenant_row", scopeQuery); err != nil {
		return err
	}
	if err := db.Callback().Create().Before("gorm:create").Register("mwx:tenant_create", scopeCreate); err != nil {
		return err
	}
	if err := db.Callback().Update().Before("gorm:update").Register("mwx:tenant_update", scopeUpdate); err != nil {
		return err
	}
	if err := db.Callback().Delete().Before("gorm:delete").Register("mwx:tenant_delete", scopeWrite); err != nil {
		return err
	}
	return nil
}

func tenantField(db *gorm.DB) (int64, bool) {
	if db.Statement == nil || db.Statement.Schema == nil || db.Statement.Schema.LookUpField("TenantID") == nil {
		return 0, false
	}
	return TenantID(db.Statement.Context)
}

func addTenantPredicate(db *gorm.DB, id int64) {
	db.Statement.AddClause(clause.Where{Exprs: []clause.Expression{
		clause.Eq{Column: clause.Column{Table: db.Statement.Schema.Table, Name: "tenant_id"}, Value: id},
	}})
}

func scopeQuery(db *gorm.DB) {
	if id, ok := tenantField(db); ok {
		addTenantPredicate(db, id)
	}
}

func scopeWrite(db *gorm.DB) {
	if id, ok := tenantField(db); ok {
		addTenantPredicate(db, id)
	}
}

func scopeCreate(db *gorm.DB) {
	id, ok := tenantField(db)
	if !ok || db.Error != nil {
		return
	}
	field := db.Statement.Schema.LookUpField("TenantID")
	value := reflect.ValueOf(db.Statement.Dest)
	for value.Kind() == reflect.Pointer || value.Kind() == reflect.Interface {
		if value.IsNil() {
			db.Error = db.AddError(fmt.Errorf("tenant record is nil"))
			return
		}
		value = value.Elem()
	}
	setTenant := func(record reflect.Value) bool {
		for record.Kind() == reflect.Pointer || record.Kind() == reflect.Interface {
			if record.IsNil() {
				return false
			}
			record = record.Elem()
		}
		if record.Kind() != reflect.Struct {
			return false
		}
		current, isZero := field.ValueOf(db.Statement.Context, record)
		if !isZero && current.(int64) != id {
			db.Error = db.AddError(fmt.Errorf("tenant_id does not match authenticated tenant"))
			return false
		}
		if err := field.Set(db.Statement.Context, record, id); err != nil {
			db.Error = db.AddError(err)
			return false
		}
		return true
	}
	if value.Kind() == reflect.Slice || value.Kind() == reflect.Array {
		for i := 0; i < value.Len(); i++ {
			if !setTenant(value.Index(i)) {
				return
			}
		}
	} else if !setTenant(value) {
		return
	}
	// Save and generic upserts use ON CONFLICT(id) DO UPDATE. Add a tenant
	// predicate to the update branch so a colliding foreign primary key cannot
	// overwrite a row owned by another tenant.
	if clauseValue, exists := db.Statement.Clauses["ON CONFLICT"]; exists {
		if conflict, ok := clauseValue.Expression.(clause.OnConflict); ok && (conflict.UpdateAll || len(conflict.DoUpdates) > 0) {
			conflict.Where.Exprs = append(conflict.Where.Exprs,
				clause.Eq{Column: clause.Column{Table: db.Statement.Schema.Table, Name: "tenant_id"}, Value: id})
			clauseValue.Expression = conflict
			db.Statement.Clauses["ON CONFLICT"] = clauseValue
		}
	}
}

func scopeUpdate(db *gorm.DB) {
	id, ok := tenantField(db)
	if !ok {
		return
	}
	if updatesTenantID(db.Statement.Dest, id) {
		db.Error = db.AddError(fmt.Errorf("tenant_id cannot be changed by a tenant-scoped request"))
		return
	}
	addTenantPredicate(db, id)
}

func updatesTenantID(dest any, id int64) bool {
	v := reflect.ValueOf(dest)
	for v.IsValid() && (v.Kind() == reflect.Pointer || v.Kind() == reflect.Interface) {
		if v.IsNil() {
			return false
		}
		v = v.Elem()
	}
	if !v.IsValid() {
		return false
	}
	if v.Kind() == reflect.Map {
		for _, key := range v.MapKeys() {
			if fmt.Sprint(key.Interface()) == "tenant_id" || fmt.Sprint(key.Interface()) == "TenantID" {
				return true
			}
		}
	}
	if v.Kind() == reflect.Struct {
		field := v.FieldByName("TenantID")
		return field.IsValid() && field.CanInt() && field.Int() != 0 && field.Int() != id
	}
	return false
}
