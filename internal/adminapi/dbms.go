package adminapi

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/talkincode/toughradius/v9/internal/webserver"
)

// DBMSTableInfo represents table metadata
type DBMSTableInfo struct {
	Name       string `json:"name"`
	RowCount   int64  `json:"row_count"`
	PrimaryKey string `json:"primary_key,omitempty"`
}

// DBMSColumnInfo represents column metadata
type DBMSColumnInfo struct {
	Name         string `json:"name"`
	Type         string `json:"type"`
	Nullable     bool   `json:"nullable"`
	PrimaryKey   bool   `json:"primary_key"`
	DefaultValue string `json:"default_value,omitempty"`
}

// DBMSQueryRequest represents a SQL query request
type DBMSQueryRequest struct {
	SQL string `json:"sql" validate:"required"`
}

// DBMSQueryResult represents query execution result
type DBMSQueryResult struct {
	Columns      []string                 `json:"columns"`
	Rows         []map[string]interface{} `json:"rows"`
	RowsAffected int64                    `json:"rows_affected"`
	Error        string                   `json:"error,omitempty"`
}

// DBMSCreateTableRequest represents a request to create a new table
type DBMSCreateTableRequest struct {
	Name    string                   `json:"name" validate:"required"`
	Columns []DBMSCreateColumnConfig `json:"columns" validate:"required,min=1"`
}

// DBMSCreateColumnConfig represents a column configuration for creating a table
type DBMSCreateColumnConfig struct {
	Name         string `json:"name" validate:"required"`
	Type         string `json:"type" validate:"required"`
	PrimaryKey   bool   `json:"primary_key"`
	AutoIncrement bool  `json:"auto_increment"`
	Nullable     bool   `json:"nullable"`
	DefaultValue string `json:"default_value,omitempty"`
}

// DBMSDropTableRequest represents a request to drop a table
type DBMSDropTableRequest struct {
	Name string `json:"name" validate:"required"`
}

// DBMSAddColumnRequest represents a request to add a column to a table
type DBMSAddColumnRequest struct {
	Name         string `json:"name" validate:"required"`
	Type         string `json:"type" validate:"required"`
	Nullable     bool   `json:"nullable"`
	DefaultValue string `json:"default_value,omitempty"`
}

// DBMSDropColumnRequest represents a request to drop a column from a table
type DBMSDropColumnRequest struct {
	Name string `json:"name" validate:"required"`
}

// DBMSRenameColumnRequest represents a request to rename a column
type DBMSRenameColumnRequest struct {
	OldName string `json:"old_name" validate:"required"`
	NewName string `json:"new_name" validate:"required"`
}

// DBMSRenameTableRequest represents a request to rename a table
type DBMSRenameTableRequest struct {
	NewName string `json:"new_name" validate:"required"`
}

// DBMSModifyColumnRequest represents a request to modify a column's type/attributes
type DBMSModifyColumnRequest struct {
	Type         string `json:"type" validate:"required"`
	Nullable     bool   `json:"nullable"`
	DefaultValue string `json:"default_value,omitempty"`
}

// DBMSIndexInfo represents index metadata
type DBMSIndexInfo struct {
	Name      string   `json:"name"`
	Columns   []string `json:"columns"`
	Unique    bool     `json:"unique"`
	Primary   bool     `json:"primary"`
	Type      string   `json:"type,omitempty"` // BTREE, HASH, etc.
}

// DBMSForeignKeyInfo represents foreign key constraint metadata
type DBMSForeignKeyInfo struct {
	Name             string `json:"name"`
	Column           string `json:"column"`
	ReferencedTable  string `json:"referenced_table"`
	ReferencedColumn string `json:"referenced_column"`
	OnUpdate         string `json:"on_update,omitempty"`
	OnDelete         string `json:"on_delete,omitempty"`
}

// DBMSCheckConstraintInfo represents check constraint metadata
type DBMSCheckConstraintInfo struct {
	Name       string `json:"name"`
	Definition string `json:"definition"`
}

// DBMSTableDDL represents the CREATE TABLE DDL statement
type DBMSTableDDL struct {
	TableName string `json:"table_name"`
	DDL       string `json:"ddl"`
}

// DBMSServerInfo represents database server information
type DBMSServerInfo struct {
	DatabaseType    string `json:"database_type"`
	DatabaseVersion string `json:"database_version"`
	ServerTime      string `json:"server_time"`
	DatabaseName    string `json:"database_name"`
	DatabaseSize    string `json:"database_size"`
	TableCount      int    `json:"table_count"`
	Encoding        string `json:"encoding,omitempty"`
	Collation       string `json:"collation,omitempty"`
}

// registerDbmsRoutes registers all DBMS-related routes
func registerDbmsRoutes() {
	// Table operations
	webserver.ApiGET("/dbms/tables", dbmsListTables)
	webserver.ApiGET("/dbms/tables/:name", dbmsGetTableData)
	webserver.ApiGET("/dbms/tables/:name/schema", dbmsGetTableSchema)
	webserver.ApiPOST("/dbms/tables", dbmsCreateTable)
	webserver.ApiDELETE("/dbms/tables/:name", dbmsDropTable)
	webserver.ApiPUT("/dbms/tables/:name/rename", dbmsRenameTable)

	// Table metadata (indexes, foreign keys, DDL)
	webserver.ApiGET("/dbms/tables/:name/indexes", dbmsGetTableIndexes)
	webserver.ApiGET("/dbms/tables/:name/foreignkeys", dbmsGetTableForeignKeys)
	webserver.ApiGET("/dbms/tables/:name/ddl", dbmsGetTableDDL)

	// Column operations (Alter Table)
	webserver.ApiPOST("/dbms/tables/:name/columns", dbmsAddColumn)
	webserver.ApiDELETE("/dbms/tables/:name/columns/:column", dbmsDropColumn)
	webserver.ApiPUT("/dbms/tables/:name/columns/:column/rename", dbmsRenameColumn)
	webserver.ApiPUT("/dbms/tables/:name/columns/:column/modify", dbmsModifyColumn)

	// Row operations
	webserver.ApiPOST("/dbms/tables/:name/rows", dbmsCreateRow)
	webserver.ApiPUT("/dbms/tables/:name/rows/:id", dbmsUpdateRow)
	webserver.ApiDELETE("/dbms/tables/:name/rows/:id", dbmsDeleteRow)

	// Query execution
	webserver.ApiPOST("/dbms/query", dbmsExecuteQuery)

	// Database backup/export
	webserver.ApiGET("/dbms/backup", dbmsBackupDatabase)

	// Server info
	webserver.ApiGET("/dbms/serverinfo", dbmsGetServerInfo)
}

// dbmsListTables returns all tables in the database
func dbmsListTables(c echo.Context) error {
	db := GetDB(c)
	var tables []DBMSTableInfo

	// Get table names based on database type
	var tableNames []string
	dbType := db.Dialector.Name()

	switch dbType {
	case "postgres":
		db.Raw(`
			SELECT table_name 
			FROM information_schema.tables 
			WHERE table_schema = 'public' 
			ORDER BY table_name
		`).Scan(&tableNames)
	case "sqlite":
		db.Raw(`
			SELECT name 
			FROM sqlite_master 
			WHERE type='table' AND name NOT LIKE 'sqlite_%'
			ORDER BY name
		`).Scan(&tableNames)
	default:
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Unsupported database type: " + dbType,
		})
	}

	// Get row count for each table
	for _, name := range tableNames {
		var count int64
		db.Raw(fmt.Sprintf("SELECT COUNT(*) FROM %s", quoteIdentifier(name, dbType))).Scan(&count)
		tables = append(tables, DBMSTableInfo{
			Name:     name,
			RowCount: count,
		})
	}

	return c.JSON(http.StatusOK, tables)
}

// dbmsGetTableSchema returns the schema of a specific table
func dbmsGetTableSchema(c echo.Context) error {
	db := GetDB(c)
	tableName := c.Param("name")

	if !isValidTableName(tableName) {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid table name",
		})
	}

	var columns []DBMSColumnInfo
	dbType := db.Dialector.Name()

	switch dbType {
	case "postgres":
		rows, err := db.Raw(`
			SELECT 
				c.column_name,
				c.data_type,
				c.is_nullable = 'YES' as nullable,
				COALESCE(c.column_default, '') as default_value,
				COALESCE(
					(SELECT true FROM information_schema.table_constraints tc
					 JOIN information_schema.key_column_usage kcu 
					 ON tc.constraint_name = kcu.constraint_name
					 WHERE tc.table_name = c.table_name 
					 AND kcu.column_name = c.column_name 
					 AND tc.constraint_type = 'PRIMARY KEY'
					 LIMIT 1), false
				) as primary_key
			FROM information_schema.columns c
			WHERE c.table_name = ?
			ORDER BY c.ordinal_position
		`, tableName).Rows()
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		defer rows.Close()

		for rows.Next() {
			var col DBMSColumnInfo
			var nullable, primaryKey bool
			rows.Scan(&col.Name, &col.Type, &nullable, &col.DefaultValue, &primaryKey)
			col.Nullable = nullable
			col.PrimaryKey = primaryKey
			columns = append(columns, col)
		}

	case "sqlite":
		rows, err := db.Raw(fmt.Sprintf("PRAGMA table_info(%s)", quoteIdentifier(tableName, dbType))).Rows()
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		defer rows.Close()

		for rows.Next() {
			var cid int
			var name, colType string
			var notNull, pk int
			var dfltValue interface{}
			rows.Scan(&cid, &name, &colType, &notNull, &dfltValue, &pk)
			columns = append(columns, DBMSColumnInfo{
				Name:       name,
				Type:       colType,
				Nullable:   notNull == 0,
				PrimaryKey: pk == 1,
				DefaultValue: func() string {
					if dfltValue == nil {
						return ""
					}
					return fmt.Sprintf("%v", dfltValue)
				}(),
			})
		}
	}

	return c.JSON(http.StatusOK, columns)
}

// dbmsGetTableData returns paginated data from a table
func dbmsGetTableData(c echo.Context) error {
	db := GetDB(c)
	tableName := c.Param("name")

	if !isValidTableName(tableName) {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid table name",
		})
	}

	page, pageSize := parsePagination(c)
	offset := (page - 1) * pageSize

	// Get sort parameters
	sortField := c.QueryParam("_sort")
	sortOrder := c.QueryParam("_order")
	if sortField == "" {
		sortField = "id"
	}
	if sortOrder == "" {
		sortOrder = "ASC"
	}

	// Validate sort order
	sortOrder = strings.ToUpper(sortOrder)
	if sortOrder != "ASC" && sortOrder != "DESC" {
		sortOrder = "ASC"
	}

	dbType := db.Dialector.Name()

	// Get total count
	var total int64
	db.Raw(fmt.Sprintf("SELECT COUNT(*) FROM %s", quoteIdentifier(tableName, dbType))).Scan(&total)

	// Get data with pagination
	query := fmt.Sprintf(
		"SELECT * FROM %s ORDER BY %s %s LIMIT %d OFFSET %d",
		quoteIdentifier(tableName, dbType),
		quoteIdentifier(sortField, dbType),
		sortOrder,
		pageSize,
		offset,
	)

	rows, err := db.Raw(query).Rows()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	defer rows.Close()

	columns, _ := rows.Columns()
	var results []map[string]interface{}

	for rows.Next() {
		values := make([]interface{}, len(columns))
		valuePtrs := make([]interface{}, len(columns))
		for i := range values {
			valuePtrs[i] = &values[i]
		}
		rows.Scan(valuePtrs...)

		row := make(map[string]interface{})
		for i, col := range columns {
			val := values[i]
			// Handle []byte to string conversion
			if b, ok := val.([]byte); ok {
				row[col] = string(b)
			} else {
				row[col] = val
			}
		}
		results = append(results, row)
	}

	// Set Content-Range header for React Admin
	c.Response().Header().Set("Content-Range", fmt.Sprintf("%s %d-%d/%d", tableName, offset, offset+len(results), total))
	c.Response().Header().Set("Access-Control-Expose-Headers", "Content-Range")

	return c.JSON(http.StatusOK, results)
}

// dbmsCreateRow creates a new row in a table
func dbmsCreateRow(c echo.Context) error {
	db := GetDB(c)
	tableName := c.Param("name")

	if !isValidTableName(tableName) {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid table name",
		})
	}

	var data map[string]interface{}
	if err := c.Bind(&data); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}

	// Remove id if present (auto-generated)
	delete(data, "id")

	if len(data) == 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "No data provided"})
	}

	dbType := db.Dialector.Name()

	// Build INSERT query
	columns := make([]string, 0, len(data))
	placeholders := make([]string, 0, len(data))
	values := make([]interface{}, 0, len(data))

	i := 1
	for col, val := range data {
		columns = append(columns, quoteIdentifier(col, dbType))
		if dbType == "postgres" {
			placeholders = append(placeholders, fmt.Sprintf("$%d", i))
		} else {
			placeholders = append(placeholders, "?")
		}
		values = append(values, val)
		i++
	}

	query := fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s)",
		quoteIdentifier(tableName, dbType),
		strings.Join(columns, ", "),
		strings.Join(placeholders, ", "),
	)

	result := db.Exec(query, values...)
	if result.Error != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": result.Error.Error()})
	}

	return c.JSON(http.StatusCreated, map[string]interface{}{
		"message":       "Row created successfully",
		"rows_affected": result.RowsAffected,
	})
}

// dbmsUpdateRow updates a row in a table
func dbmsUpdateRow(c echo.Context) error {
	db := GetDB(c)
	tableName := c.Param("name")
	rowID := c.Param("id")

	if !isValidTableName(tableName) {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid table name",
		})
	}

	var data map[string]interface{}
	if err := c.Bind(&data); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}

	// Remove id from update data
	delete(data, "id")

	if len(data) == 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "No data provided"})
	}

	dbType := db.Dialector.Name()

	// Build UPDATE query
	setClauses := make([]string, 0, len(data))
	values := make([]interface{}, 0, len(data)+1)

	i := 1
	for col, val := range data {
		if dbType == "postgres" {
			setClauses = append(setClauses, fmt.Sprintf("%s = $%d", quoteIdentifier(col, dbType), i))
		} else {
			setClauses = append(setClauses, fmt.Sprintf("%s = ?", quoteIdentifier(col, dbType)))
		}
		values = append(values, val)
		i++
	}
	values = append(values, rowID)

	var query string
	if dbType == "postgres" {
		query = fmt.Sprintf(
			"UPDATE %s SET %s WHERE id = $%d",
			quoteIdentifier(tableName, dbType),
			strings.Join(setClauses, ", "),
			i,
		)
	} else {
		query = fmt.Sprintf(
			"UPDATE %s SET %s WHERE id = ?",
			quoteIdentifier(tableName, dbType),
			strings.Join(setClauses, ", "),
		)
	}

	result := db.Exec(query, values...)
	if result.Error != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": result.Error.Error()})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message":       "Row updated successfully",
		"rows_affected": result.RowsAffected,
	})
}

// dbmsDeleteRow deletes a row from a table
func dbmsDeleteRow(c echo.Context) error {
	db := GetDB(c)
	tableName := c.Param("name")
	rowID := c.Param("id")

	if !isValidTableName(tableName) {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid table name",
		})
	}

	dbType := db.Dialector.Name()

	var query string
	if dbType == "postgres" {
		query = fmt.Sprintf("DELETE FROM %s WHERE id = $1", quoteIdentifier(tableName, dbType))
	} else {
		query = fmt.Sprintf("DELETE FROM %s WHERE id = ?", quoteIdentifier(tableName, dbType))
	}

	result := db.Exec(query, rowID)
	if result.Error != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": result.Error.Error()})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message":       "Row deleted successfully",
		"rows_affected": result.RowsAffected,
	})
}

// dbmsExecuteQuery executes a custom SQL query
func dbmsExecuteQuery(c echo.Context) error {
	db := GetDB(c)

	var req DBMSQueryRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}

	sql := strings.TrimSpace(req.SQL)
	if sql == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "SQL query is required"})
	}

	// Determine if it's a SELECT query or not
	upperSQL := strings.ToUpper(sql)
	isSelect := strings.HasPrefix(upperSQL, "SELECT") ||
		strings.HasPrefix(upperSQL, "SHOW") ||
		strings.HasPrefix(upperSQL, "DESCRIBE") ||
		strings.HasPrefix(upperSQL, "EXPLAIN") ||
		strings.HasPrefix(upperSQL, "PRAGMA")

	result := DBMSQueryResult{}

	if isSelect {
		rows, err := db.Raw(sql).Rows()
		if err != nil {
			result.Error = err.Error()
			return c.JSON(http.StatusOK, result)
		}
		defer rows.Close()

		columns, _ := rows.Columns()
		result.Columns = columns
		result.Rows = make([]map[string]interface{}, 0)

		for rows.Next() {
			values := make([]interface{}, len(columns))
			valuePtrs := make([]interface{}, len(columns))
			for i := range values {
				valuePtrs[i] = &values[i]
			}
			rows.Scan(valuePtrs...)

			row := make(map[string]interface{})
			for i, col := range columns {
				val := values[i]
				if b, ok := val.([]byte); ok {
					row[col] = string(b)
				} else {
					row[col] = val
				}
			}
			result.Rows = append(result.Rows, row)
		}
	} else {
		// Execute non-SELECT query (INSERT, UPDATE, DELETE, etc.)
		execResult := db.Exec(sql)
		if execResult.Error != nil {
			result.Error = execResult.Error.Error()
			return c.JSON(http.StatusOK, result)
		}
		result.RowsAffected = execResult.RowsAffected
	}

	return c.JSON(http.StatusOK, result)
}

// dbmsCreateTable creates a new table in the database
func dbmsCreateTable(c echo.Context) error {
	db := GetDB(c)

	var req DBMSCreateTableRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}

	if !isValidTableName(req.Name) {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid table name. Use only alphanumeric characters and underscores.",
		})
	}

	if len(req.Columns) == 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "At least one column is required",
		})
	}

	dbType := db.Dialector.Name()

	// Build CREATE TABLE query
	var columnDefs []string
	for _, col := range req.Columns {
		if !isValidTableName(col.Name) {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": fmt.Sprintf("Invalid column name: %s", col.Name),
			})
		}

		colDef := buildColumnDefinition(col, dbType)
		columnDefs = append(columnDefs, colDef)
	}

	query := fmt.Sprintf(
		"CREATE TABLE %s (%s)",
		quoteIdentifier(req.Name, dbType),
		strings.Join(columnDefs, ", "),
	)

	result := db.Exec(query)
	if result.Error != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": result.Error.Error()})
	}

	return c.JSON(http.StatusCreated, map[string]interface{}{
		"message": "Table created successfully",
		"table":   req.Name,
	})
}

// dbmsDropTable drops a table from the database
func dbmsDropTable(c echo.Context) error {
	db := GetDB(c)
	tableName := c.Param("name")

	if !isValidTableName(tableName) {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid table name",
		})
	}

	dbType := db.Dialector.Name()
	query := fmt.Sprintf("DROP TABLE IF EXISTS %s", quoteIdentifier(tableName, dbType))

	result := db.Exec(query)
	if result.Error != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": result.Error.Error()})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message": "Table dropped successfully",
		"table":   tableName,
	})
}

// buildColumnDefinition builds a column definition string for CREATE TABLE
func buildColumnDefinition(col DBMSCreateColumnConfig, dbType string) string {
	var parts []string

	// Column name
	parts = append(parts, quoteIdentifier(col.Name, dbType))

	// Column type - map common types to database-specific types
	colType := mapColumnType(col.Type, dbType, col.AutoIncrement)
	parts = append(parts, colType)

	// Primary key
	if col.PrimaryKey {
		if dbType == "sqlite" && col.AutoIncrement {
			parts = append(parts, "PRIMARY KEY")
		} else if dbType == "postgres" {
			parts = append(parts, "PRIMARY KEY")
		} else {
			parts = append(parts, "PRIMARY KEY")
		}
	}

	// Auto increment (handled in type mapping for some DBs)
	if col.AutoIncrement && !col.PrimaryKey {
		if dbType == "sqlite" {
			// SQLite requires PRIMARY KEY for AUTOINCREMENT
		} else if dbType == "postgres" {
			// Already handled in type mapping (SERIAL)
		}
	}

	// Nullable
	if !col.Nullable && !col.PrimaryKey {
		parts = append(parts, "NOT NULL")
	}

	// Default value
	if col.DefaultValue != "" && !col.AutoIncrement {
		parts = append(parts, fmt.Sprintf("DEFAULT %s", col.DefaultValue))
	}

	return strings.Join(parts, " ")
}

// mapColumnType maps generic column types to database-specific types
func mapColumnType(genericType, dbType string, autoIncrement bool) string {
	genericType = strings.ToLower(genericType)

	switch dbType {
	case "postgres":
		switch genericType {
		case "int", "integer":
			if autoIncrement {
				return "SERIAL"
			}
			return "INTEGER"
		case "bigint":
			if autoIncrement {
				return "BIGSERIAL"
			}
			return "BIGINT"
		case "string", "varchar":
			return "VARCHAR(255)"
		case "text":
			return "TEXT"
		case "boolean", "bool":
			return "BOOLEAN"
		case "datetime", "timestamp":
			return "TIMESTAMP"
		case "date":
			return "DATE"
		case "time":
			return "TIME"
		case "float", "real":
			return "REAL"
		case "double":
			return "DOUBLE PRECISION"
		case "decimal", "numeric":
			return "NUMERIC"
		case "json", "jsonb":
			return "JSONB"
		default:
			return strings.ToUpper(genericType)
		}
	case "sqlite":
		switch genericType {
		case "int", "integer", "bigint":
			return "INTEGER"
		case "string", "varchar", "text":
			return "TEXT"
		case "boolean", "bool":
			return "INTEGER"
		case "datetime", "timestamp", "date", "time":
			return "TEXT"
		case "float", "real", "double", "decimal", "numeric":
			return "REAL"
		case "json", "jsonb":
			return "TEXT"
		default:
			return strings.ToUpper(genericType)
		}
	default:
		return strings.ToUpper(genericType)
	}
}

// Helper functions

// quoteIdentifier quotes a database identifier based on the database type
func quoteIdentifier(name, dbType string) string {
	switch dbType {
	case "postgres":
		return fmt.Sprintf(`"%s"`, strings.ReplaceAll(name, `"`, `""`))
	case "sqlite":
		return fmt.Sprintf(`"%s"`, strings.ReplaceAll(name, `"`, `""`))
	default:
		return fmt.Sprintf("`%s`", strings.ReplaceAll(name, "`", "``"))
	}
}

// isValidTableName validates table name to prevent SQL injection
func isValidTableName(name string) bool {
	if name == "" || len(name) > 64 {
		return false
	}
	// Only allow alphanumeric characters and underscores
	for _, c := range name {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_') {
			return false
		}
	}
	return true
}

// parseInt64 parses string to int64
func parseInt64(s string) (int64, error) {
	return strconv.ParseInt(s, 10, 64)
}

// isValidColumnName validates column name to prevent SQL injection
func isValidColumnName(name string) bool {
	return isValidTableName(name) // Same rules as table names
}

// dbmsAddColumn adds a new column to an existing table
func dbmsAddColumn(c echo.Context) error {
	db := GetDB(c)
	tableName := c.Param("name")
	
	if !isValidTableName(tableName) {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid table name",
		})
	}
	
	var req DBMSAddColumnRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request body",
		})
	}
	
	if !isValidColumnName(req.Name) {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid column name",
		})
	}
	
	dbType := db.Dialector.Name()
	quotedTable := quoteIdentifier(tableName, dbType)
	quotedColumn := quoteIdentifier(req.Name, dbType)
	columnType := mapColumnType(req.Type, dbType, false)
	
	// Build ALTER TABLE ADD COLUMN statement
	var sql string
	if req.Nullable {
		sql = fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", quotedTable, quotedColumn, columnType)
	} else {
		sql = fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s NOT NULL", quotedTable, quotedColumn, columnType)
	}
	
	// Add default value if specified
	if req.DefaultValue != "" {
		sql += fmt.Sprintf(" DEFAULT '%s'", strings.ReplaceAll(req.DefaultValue, "'", "''"))
	} else if !req.Nullable {
		// For NOT NULL columns without default, add a sensible default
		switch strings.ToLower(req.Type) {
		case "int", "integer", "bigint", "float", "double", "decimal", "numeric":
			sql += " DEFAULT 0"
		case "boolean", "bool":
			sql += " DEFAULT false"
		default:
			sql += " DEFAULT ''"
		}
	}
	
	if err := db.Exec(sql).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": fmt.Sprintf("Failed to add column: %v", err),
		})
	}
	
	return c.JSON(http.StatusOK, map[string]string{
		"message": fmt.Sprintf("Column '%s' added successfully", req.Name),
	})
}

// dbmsDropColumn removes a column from an existing table
func dbmsDropColumn(c echo.Context) error {
	db := GetDB(c)
	tableName := c.Param("name")
	columnName := c.Param("column")
	
	if !isValidTableName(tableName) {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid table name",
		})
	}
	
	if !isValidColumnName(columnName) {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid column name",
		})
	}
	
	dbType := db.Dialector.Name()
	quotedTable := quoteIdentifier(tableName, dbType)
	quotedColumn := quoteIdentifier(columnName, dbType)
	
	// SQLite doesn't support DROP COLUMN in older versions
	// For SQLite 3.35.0+, it's supported
	sql := fmt.Sprintf("ALTER TABLE %s DROP COLUMN %s", quotedTable, quotedColumn)
	
	if err := db.Exec(sql).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": fmt.Sprintf("Failed to drop column: %v", err),
		})
	}
	
	return c.JSON(http.StatusOK, map[string]string{
		"message": fmt.Sprintf("Column '%s' dropped successfully", columnName),
	})
}

// dbmsRenameColumn renames an existing column
func dbmsRenameColumn(c echo.Context) error {
	db := GetDB(c)
	tableName := c.Param("name")
	columnName := c.Param("column")
	
	if !isValidTableName(tableName) {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid table name",
		})
	}
	
	if !isValidColumnName(columnName) {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid column name",
		})
	}
	
	var req DBMSRenameColumnRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request body",
		})
	}
	
	if !isValidColumnName(req.NewName) {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid new column name",
		})
	}
	
	dbType := db.Dialector.Name()
	quotedTable := quoteIdentifier(tableName, dbType)
	quotedOldColumn := quoteIdentifier(columnName, dbType)
	quotedNewColumn := quoteIdentifier(req.NewName, dbType)
	
	var sql string
	switch dbType {
	case "postgres":
		sql = fmt.Sprintf("ALTER TABLE %s RENAME COLUMN %s TO %s", quotedTable, quotedOldColumn, quotedNewColumn)
	case "sqlite":
		sql = fmt.Sprintf("ALTER TABLE %s RENAME COLUMN %s TO %s", quotedTable, quotedOldColumn, quotedNewColumn)
	default:
		sql = fmt.Sprintf("ALTER TABLE %s CHANGE %s %s", quotedTable, quotedOldColumn, quotedNewColumn)
	}
	
	if err := db.Exec(sql).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": fmt.Sprintf("Failed to rename column: %v", err),
		})
	}
	
	return c.JSON(http.StatusOK, map[string]string{
		"message": fmt.Sprintf("Column renamed from '%s' to '%s' successfully", columnName, req.NewName),
	})
}

// dbmsRenameTable renames an existing table
func dbmsRenameTable(c echo.Context) error {
	db := GetDB(c)
	tableName := c.Param("name")
	
	if !isValidTableName(tableName) {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid table name",
		})
	}
	
	var req DBMSRenameTableRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request body",
		})
	}
	
	if !isValidTableName(req.NewName) {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid new table name",
		})
	}
	
	dbType := db.Dialector.Name()
	quotedOldTable := quoteIdentifier(tableName, dbType)
	quotedNewTable := quoteIdentifier(req.NewName, dbType)
	
	sql := fmt.Sprintf("ALTER TABLE %s RENAME TO %s", quotedOldTable, quotedNewTable)
	
	if err := db.Exec(sql).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": fmt.Sprintf("Failed to rename table: %v", err),
		})
	}
	
	return c.JSON(http.StatusOK, map[string]string{
		"message": fmt.Sprintf("Table renamed from '%s' to '%s' successfully", tableName, req.NewName),
	})
}

// dbmsModifyColumn modifies a column's type and attributes
func dbmsModifyColumn(c echo.Context) error {
	db := GetDB(c)
	tableName := c.Param("name")
	columnName := c.Param("column")
	
	if !isValidTableName(tableName) {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid table name",
		})
	}
	
	if !isValidColumnName(columnName) {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid column name",
		})
	}
	
	var req DBMSModifyColumnRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request body",
		})
	}
	
	dbType := db.Dialector.Name()
	quotedTable := quoteIdentifier(tableName, dbType)
	quotedColumn := quoteIdentifier(columnName, dbType)
	columnType := mapColumnType(req.Type, dbType, false)
	
	var sql string
	switch dbType {
	case "postgres":
		// PostgreSQL uses ALTER COLUMN ... TYPE
		sql = fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s TYPE %s", quotedTable, quotedColumn, columnType)
		if err := db.Exec(sql).Error; err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": fmt.Sprintf("Failed to modify column type: %v", err),
			})
		}
		
		// Set nullable/not null separately in PostgreSQL
		if req.Nullable {
			sql = fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s DROP NOT NULL", quotedTable, quotedColumn)
		} else {
			sql = fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s SET NOT NULL", quotedTable, quotedColumn)
		}
		if err := db.Exec(sql).Error; err != nil {
			// Ignore error for nullable change as it might fail if column already has the constraint
		}
		
		// Set default value
		if req.DefaultValue != "" {
			sql = fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s SET DEFAULT '%s'", quotedTable, quotedColumn, strings.ReplaceAll(req.DefaultValue, "'", "''"))
		} else {
			sql = fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s DROP DEFAULT", quotedTable, quotedColumn)
		}
		db.Exec(sql) // Ignore errors for default
		
	case "sqlite":
		// SQLite doesn't support ALTER COLUMN directly
		// We need to recreate the table, but for simplicity, we'll use a workaround
		// First, let's try the simpler approach which works in SQLite 3.35+
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "SQLite does not support modifying column types directly. Please use SQL query to recreate the table.",
		})
		
	default:
		// MySQL/MariaDB syntax
		nullStr := "NULL"
		if !req.Nullable {
			nullStr = "NOT NULL"
		}
		defaultStr := ""
		if req.DefaultValue != "" {
			defaultStr = fmt.Sprintf(" DEFAULT '%s'", strings.ReplaceAll(req.DefaultValue, "'", "''"))
		}
		sql = fmt.Sprintf("ALTER TABLE %s MODIFY COLUMN %s %s %s%s", quotedTable, quotedColumn, columnType, nullStr, defaultStr)
		if err := db.Exec(sql).Error; err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": fmt.Sprintf("Failed to modify column: %v", err),
			})
		}
	}
	
	return c.JSON(http.StatusOK, map[string]string{
		"message": fmt.Sprintf("Column '%s' modified successfully", columnName),
	})
}

// dbmsGetTableIndexes returns all indexes for a table
func dbmsGetTableIndexes(c echo.Context) error {
	db := GetDB(c)
	tableName := c.Param("name")
	
	if tableName == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Table name is required",
		})
	}
	
	var indexes []DBMSIndexInfo
	dbType := db.Dialector.Name()
	
	switch dbType {
	case "postgres":
		// Query PostgreSQL indexes
		type pgIndex struct {
			IndexName  string `gorm:"column:indexname"`
			IndexDef   string `gorm:"column:indexdef"`
		}
		var pgIndexes []pgIndex
		db.Raw(`
			SELECT indexname, indexdef 
			FROM pg_indexes 
			WHERE tablename = ?
			ORDER BY indexname
		`, tableName).Scan(&pgIndexes)
		
		for _, idx := range pgIndexes {
			info := DBMSIndexInfo{
				Name:    idx.IndexName,
				Columns: extractColumnsFromIndexDef(idx.IndexDef),
				Unique:  strings.Contains(strings.ToUpper(idx.IndexDef), "UNIQUE"),
				Primary: strings.Contains(idx.IndexName, "_pkey"),
			}
			indexes = append(indexes, info)
		}
		
	case "sqlite":
		// Query SQLite indexes
		type sqliteIndex struct {
			Name   string `gorm:"column:name"`
			Unique int    `gorm:"column:unique"`
		}
		var sqliteIndexes []sqliteIndex
		db.Raw(`PRAGMA index_list(?)`, tableName).Scan(&sqliteIndexes)
		
		for _, idx := range sqliteIndexes {
			// Get columns for this index
			type indexColumn struct {
				Name string `gorm:"column:name"`
			}
			var cols []indexColumn
			db.Raw(fmt.Sprintf(`PRAGMA index_info("%s")`, idx.Name)).Scan(&cols)
			
			var colNames []string
			for _, col := range cols {
				colNames = append(colNames, col.Name)
			}
			
			info := DBMSIndexInfo{
				Name:    idx.Name,
				Columns: colNames,
				Unique:  idx.Unique == 1,
				Primary: strings.HasPrefix(idx.Name, "sqlite_autoindex_"),
			}
			indexes = append(indexes, info)
		}
		
	default:
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Unsupported database type: " + dbType,
		})
	}
	
	return c.JSON(http.StatusOK, indexes)
}

// extractColumnsFromIndexDef extracts column names from PostgreSQL index definition
func extractColumnsFromIndexDef(indexDef string) []string {
	// Example: CREATE INDEX idx_name ON table_name USING btree (col1, col2)
	// or: CREATE UNIQUE INDEX idx_name ON table_name (col1)
	start := strings.LastIndex(indexDef, "(")
	end := strings.LastIndex(indexDef, ")")
	if start == -1 || end == -1 || end <= start {
		return nil
	}
	
	colsPart := indexDef[start+1 : end]
	cols := strings.Split(colsPart, ",")
	var result []string
	for _, col := range cols {
		col = strings.TrimSpace(col)
		// Remove any sorting suffix like ASC, DESC
		col = strings.TrimSuffix(col, " ASC")
		col = strings.TrimSuffix(col, " DESC")
		col = strings.TrimSuffix(col, " NULLS FIRST")
		col = strings.TrimSuffix(col, " NULLS LAST")
		if col != "" {
			result = append(result, col)
		}
	}
	return result
}

// dbmsGetTableForeignKeys returns all foreign key constraints for a table
func dbmsGetTableForeignKeys(c echo.Context) error {
	db := GetDB(c)
	tableName := c.Param("name")
	
	if tableName == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Table name is required",
		})
	}
	
	var foreignKeys []DBMSForeignKeyInfo
	dbType := db.Dialector.Name()
	
	switch dbType {
	case "postgres":
		// Query PostgreSQL foreign keys
		type pgFK struct {
			ConstraintName string `gorm:"column:constraint_name"`
			ColumnName     string `gorm:"column:column_name"`
			ForeignTable   string `gorm:"column:foreign_table_name"`
			ForeignColumn  string `gorm:"column:foreign_column_name"`
			UpdateRule     string `gorm:"column:update_rule"`
			DeleteRule     string `gorm:"column:delete_rule"`
		}
		var pgFKs []pgFK
		db.Raw(`
			SELECT
				tc.constraint_name,
				kcu.column_name,
				ccu.table_name AS foreign_table_name,
				ccu.column_name AS foreign_column_name,
				rc.update_rule,
				rc.delete_rule
			FROM information_schema.table_constraints AS tc
			JOIN information_schema.key_column_usage AS kcu
				ON tc.constraint_name = kcu.constraint_name
				AND tc.table_schema = kcu.table_schema
			JOIN information_schema.constraint_column_usage AS ccu
				ON ccu.constraint_name = tc.constraint_name
				AND ccu.table_schema = tc.table_schema
			JOIN information_schema.referential_constraints AS rc
				ON tc.constraint_name = rc.constraint_name
				AND tc.table_schema = rc.constraint_schema
			WHERE tc.constraint_type = 'FOREIGN KEY'
				AND tc.table_name = ?
			ORDER BY tc.constraint_name
		`, tableName).Scan(&pgFKs)
		
		for _, fk := range pgFKs {
			foreignKeys = append(foreignKeys, DBMSForeignKeyInfo{
				Name:             fk.ConstraintName,
				Column:           fk.ColumnName,
				ReferencedTable:  fk.ForeignTable,
				ReferencedColumn: fk.ForeignColumn,
				OnUpdate:         fk.UpdateRule,
				OnDelete:         fk.DeleteRule,
			})
		}
		
	case "sqlite":
		// Query SQLite foreign keys
		type sqliteFK struct {
			ID        int    `gorm:"column:id"`
			Seq       int    `gorm:"column:seq"`
			Table     string `gorm:"column:table"`
			From      string `gorm:"column:from"`
			To        string `gorm:"column:to"`
			OnUpdate  string `gorm:"column:on_update"`
			OnDelete  string `gorm:"column:on_delete"`
		}
		var sqliteFKs []sqliteFK
		db.Raw(fmt.Sprintf(`PRAGMA foreign_key_list("%s")`, tableName)).Scan(&sqliteFKs)
		
		for _, fk := range sqliteFKs {
			foreignKeys = append(foreignKeys, DBMSForeignKeyInfo{
				Name:             fmt.Sprintf("fk_%s_%d", tableName, fk.ID),
				Column:           fk.From,
				ReferencedTable:  fk.Table,
				ReferencedColumn: fk.To,
				OnUpdate:         fk.OnUpdate,
				OnDelete:         fk.OnDelete,
			})
		}
		
	default:
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Unsupported database type: " + dbType,
		})
	}
	
	return c.JSON(http.StatusOK, foreignKeys)
}

// dbmsGetTableDDL returns the CREATE TABLE DDL statement for a table
func dbmsGetTableDDL(c echo.Context) error {
	db := GetDB(c)
	tableName := c.Param("name")
	
	if tableName == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Table name is required",
		})
	}
	
	var ddl string
	dbType := db.Dialector.Name()
	
	switch dbType {
	case "postgres":
		// Build CREATE TABLE statement for PostgreSQL
		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("CREATE TABLE \"%s\" (\n", tableName))
		
		// Get columns
		type pgColumn struct {
			ColumnName    string  `gorm:"column:column_name"`
			DataType      string  `gorm:"column:data_type"`
			UdtName       string  `gorm:"column:udt_name"`
			CharMaxLen    *int    `gorm:"column:character_maximum_length"`
			NumPrecision  *int    `gorm:"column:numeric_precision"`
			NumScale      *int    `gorm:"column:numeric_scale"`
			IsNullable    string  `gorm:"column:is_nullable"`
			ColumnDefault *string `gorm:"column:column_default"`
		}
		var columns []pgColumn
		db.Raw(`
			SELECT column_name, data_type, udt_name, character_maximum_length, 
			       numeric_precision, numeric_scale, is_nullable, column_default
			FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = ?
			ORDER BY ordinal_position
		`, tableName).Scan(&columns)
		
		// Get primary key columns
		var pkColumns []string
		db.Raw(`
			SELECT a.attname
			FROM pg_index i
			JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
			WHERE i.indrelid = ?::regclass AND i.indisprimary
			ORDER BY array_position(i.indkey, a.attnum)
		`, tableName).Scan(&pkColumns)
		pkSet := make(map[string]bool)
		for _, pk := range pkColumns {
			pkSet[pk] = true
		}
		
		for i, col := range columns {
			if i > 0 {
				sb.WriteString(",\n")
			}
			sb.WriteString(fmt.Sprintf("    \"%s\" ", col.ColumnName))
			
			// Format data type
			switch col.UdtName {
			case "int4":
				sb.WriteString("INTEGER")
			case "int8":
				sb.WriteString("BIGINT")
			case "int2":
				sb.WriteString("SMALLINT")
			case "varchar":
				if col.CharMaxLen != nil {
					sb.WriteString(fmt.Sprintf("VARCHAR(%d)", *col.CharMaxLen))
				} else {
					sb.WriteString("VARCHAR")
				}
			case "text":
				sb.WriteString("TEXT")
			case "bool":
				sb.WriteString("BOOLEAN")
			case "float4":
				sb.WriteString("REAL")
			case "float8":
				sb.WriteString("DOUBLE PRECISION")
			case "numeric":
				if col.NumPrecision != nil && col.NumScale != nil {
					sb.WriteString(fmt.Sprintf("NUMERIC(%d,%d)", *col.NumPrecision, *col.NumScale))
				} else {
					sb.WriteString("NUMERIC")
				}
			case "timestamp":
				sb.WriteString("TIMESTAMP")
			case "timestamptz":
				sb.WriteString("TIMESTAMPTZ")
			case "date":
				sb.WriteString("DATE")
			case "time":
				sb.WriteString("TIME")
			case "uuid":
				sb.WriteString("UUID")
			case "json":
				sb.WriteString("JSON")
			case "jsonb":
				sb.WriteString("JSONB")
			case "bytea":
				sb.WriteString("BYTEA")
			default:
				sb.WriteString(strings.ToUpper(col.UdtName))
			}
			
			// NOT NULL
			if col.IsNullable == "NO" {
				sb.WriteString(" NOT NULL")
			}
			
			// DEFAULT
			if col.ColumnDefault != nil && *col.ColumnDefault != "" {
				sb.WriteString(fmt.Sprintf(" DEFAULT %s", *col.ColumnDefault))
			}
		}
		
		// Add PRIMARY KEY constraint
		if len(pkColumns) > 0 {
			sb.WriteString(",\n    PRIMARY KEY (")
			for i, pk := range pkColumns {
				if i > 0 {
					sb.WriteString(", ")
				}
				sb.WriteString(fmt.Sprintf("\"%s\"", pk))
			}
			sb.WriteString(")")
		}
		
		// Get foreign keys
		type pgFK struct {
			ConstraintName string `gorm:"column:conname"`
			ColumnName     string `gorm:"column:column_name"`
			ForeignTable   string `gorm:"column:foreign_table"`
			ForeignColumn  string `gorm:"column:foreign_column"`
			UpdateAction   string `gorm:"column:confupdtype"`
			DeleteAction   string `gorm:"column:confdeltype"`
		}
		var fks []pgFK
		db.Raw(`
			SELECT
				c.conname,
				a.attname AS column_name,
				ref_table.relname AS foreign_table,
				ref_col.attname AS foreign_column,
				c.confupdtype,
				c.confdeltype
			FROM pg_constraint c
			JOIN pg_class t ON c.conrelid = t.oid
			JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
			JOIN pg_class ref_table ON c.confrelid = ref_table.oid
			JOIN pg_attribute ref_col ON ref_col.attrelid = ref_table.oid AND ref_col.attnum = ANY(c.confkey)
			WHERE c.contype = 'f' AND t.relname = ?
			ORDER BY c.conname
		`, tableName).Scan(&fks)
		
		for _, fk := range fks {
			sb.WriteString(fmt.Sprintf(",\n    CONSTRAINT \"%s\" FOREIGN KEY (\"%s\") REFERENCES \"%s\" (\"%s\")",
				fk.ConstraintName, fk.ColumnName, fk.ForeignTable, fk.ForeignColumn))
			
			// ON UPDATE action
			switch fk.UpdateAction {
			case "c":
				sb.WriteString(" ON UPDATE CASCADE")
			case "n":
				sb.WriteString(" ON UPDATE SET NULL")
			case "d":
				sb.WriteString(" ON UPDATE SET DEFAULT")
			case "r":
				sb.WriteString(" ON UPDATE RESTRICT")
			}
			
			// ON DELETE action
			switch fk.DeleteAction {
			case "c":
				sb.WriteString(" ON DELETE CASCADE")
			case "n":
				sb.WriteString(" ON DELETE SET NULL")
			case "d":
				sb.WriteString(" ON DELETE SET DEFAULT")
			case "r":
				sb.WriteString(" ON DELETE RESTRICT")
			}
		}
		
		sb.WriteString("\n);")
		
		// Add indexes (separate from table definition)
		type pgIndex struct {
			IndexName  string `gorm:"column:indexname"`
			IndexDef   string `gorm:"column:indexdef"`
		}
		var indexes []pgIndex
		db.Raw(`
			SELECT indexname, indexdef 
			FROM pg_indexes 
			WHERE tablename = ? AND indexname NOT LIKE '%_pkey'
			ORDER BY indexname
		`, tableName).Scan(&indexes)
		
		for _, idx := range indexes {
			sb.WriteString(fmt.Sprintf("\n\n%s;", idx.IndexDef))
		}
		
		// Add column comments
		type pgComment struct {
			ColumnName string  `gorm:"column:column_name"`
			Comment    *string `gorm:"column:description"`
		}
		var comments []pgComment
		db.Raw(`
			SELECT
				c.column_name,
				pgd.description
			FROM information_schema.columns c
			LEFT JOIN pg_catalog.pg_statio_all_tables st ON c.table_name = st.relname
			LEFT JOIN pg_catalog.pg_description pgd ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
			WHERE c.table_schema = 'public' AND c.table_name = ? AND pgd.description IS NOT NULL
			ORDER BY c.ordinal_position
		`, tableName).Scan(&comments)
		
		for _, cmt := range comments {
			if cmt.Comment != nil && *cmt.Comment != "" {
				sb.WriteString(fmt.Sprintf("\n\nCOMMENT ON COLUMN \"%s\".\"%s\" IS '%s';", 
					tableName, cmt.ColumnName, strings.ReplaceAll(*cmt.Comment, "'", "''")))
			}
		}
		
		ddl = sb.String()
		
	case "sqlite":
		// SQLite can directly return CREATE TABLE statement
		var result struct {
			SQL string `gorm:"column:sql"`
		}
		db.Raw(`SELECT sql FROM sqlite_master WHERE type='table' AND name = ?`, tableName).Scan(&result)
		ddl = result.SQL
		if ddl != "" {
			ddl += ";"
			
			// Also get indexes
			type sqliteIndex struct {
				SQL *string `gorm:"column:sql"`
			}
			var indexes []sqliteIndex
			db.Raw(`SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name = ? AND sql IS NOT NULL`, tableName).Scan(&indexes)
			for _, idx := range indexes {
				if idx.SQL != nil && *idx.SQL != "" {
					ddl += "\n\n" + *idx.SQL + ";"
				}
			}
		}
		
	default:
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Unsupported database type: " + dbType,
		})
	}
	
	if ddl == "" {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Table not found or unable to generate DDL",
		})
	}
	
	return c.JSON(http.StatusOK, DBMSTableDDL{
		TableName: tableName,
		DDL:       ddl,
	})
}

// dbmsBackupDatabase generates a SQL dump of the entire database and returns it as a downloadable file
func dbmsBackupDatabase(c echo.Context) error {
	db := GetDB(c)
	dbType := db.Dialector.Name()
	
	var sqlDump strings.Builder
	timestamp := time.Now().Format("20060102_150405")
	
	// Write header
	sqlDump.WriteString("-- ToughRADIUS Database Backup\n")
	sqlDump.WriteString(fmt.Sprintf("-- Generated at: %s\n", time.Now().Format("2006-01-02 15:04:05")))
	sqlDump.WriteString(fmt.Sprintf("-- Database type: %s\n", dbType))
	sqlDump.WriteString("-- ============================================\n\n")
	
	// Get all table names
	var tableNames []string
	switch dbType {
	case "postgres":
		db.Raw(`
			SELECT table_name 
			FROM information_schema.tables 
			WHERE table_schema = 'public' 
			ORDER BY table_name
		`).Scan(&tableNames)
	case "sqlite":
		db.Raw(`
			SELECT name 
			FROM sqlite_master 
			WHERE type='table' AND name NOT LIKE 'sqlite_%'
			ORDER BY name
		`).Scan(&tableNames)
	default:
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Unsupported database type: " + dbType,
		})
	}
	
	// For each table, generate CREATE TABLE and INSERT statements
	for _, tableName := range tableNames {
		sqlDump.WriteString(fmt.Sprintf("-- ============================================\n"))
		sqlDump.WriteString(fmt.Sprintf("-- Table: %s\n", tableName))
		sqlDump.WriteString(fmt.Sprintf("-- ============================================\n\n"))
		
		// Generate CREATE TABLE statement
		ddl := backupGenerateTableDDL(db, dbType, tableName)
		if ddl != "" {
			sqlDump.WriteString(fmt.Sprintf("DROP TABLE IF EXISTS %s;\n", backupQuoteIdentifier(dbType, tableName)))
			sqlDump.WriteString(ddl)
			sqlDump.WriteString("\n\n")
		}
		
		// Generate INSERT statements for data
		inserts := backupGenerateTableInserts(db, dbType, tableName)
		if inserts != "" {
			sqlDump.WriteString(inserts)
			sqlDump.WriteString("\n")
		}
	}
	
	// Set headers for file download
	filename := fmt.Sprintf("toughradius_backup_%s.sql", timestamp)
	c.Response().Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	c.Response().Header().Set("Content-Type", "application/sql")
	
	return c.String(http.StatusOK, sqlDump.String())
}

// backupQuoteIdentifier properly quotes an identifier based on database type
func backupQuoteIdentifier(dbType, identifier string) string {
	switch dbType {
	case "postgres":
		return fmt.Sprintf("\"%s\"", identifier)
	case "sqlite":
		return fmt.Sprintf("\"%s\"", identifier)
	default:
		return identifier
	}
}

// backupGenerateTableDDL generates CREATE TABLE DDL for backup
func backupGenerateTableDDL(db *gorm.DB, dbType, tableName string) string {
	switch dbType {
	case "sqlite":
		var ddl string
		db.Raw(`SELECT sql FROM sqlite_master WHERE type='table' AND name = ?`, tableName).Scan(&ddl)
		if ddl != "" {
			return ddl + ";"
		}
	case "postgres":
		return buildPostgresDDLForBackup(db, tableName)
	}
	return ""
}

// buildPostgresDDLForBackup builds CREATE TABLE statement for PostgreSQL backup
func buildPostgresDDLForBackup(db *gorm.DB, tableName string) string {
	type ColumnDef struct {
		ColumnName    string
		DataType      string
		CharMaxLen    *int
		IsNullable    string
		ColumnDefault *string
	}

	var columns []ColumnDef
	db.Raw(`
		SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
		FROM information_schema.columns
		WHERE table_name = ? AND table_schema = 'public'
		ORDER BY ordinal_position
	`, tableName).Scan(&columns)

	if len(columns) == 0 {
		return ""
	}

	// Get primary key columns
	var pkColumns []string
	db.Raw(`
		SELECT a.attname
		FROM pg_index i
		JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
		WHERE i.indrelid = ?::regclass AND i.indisprimary
	`, tableName).Scan(&pkColumns)

	pkSet := make(map[string]bool)
	for _, pk := range pkColumns {
		pkSet[pk] = true
	}

	var ddl strings.Builder
	ddl.WriteString(fmt.Sprintf("CREATE TABLE \"%s\" (\n", tableName))

	for i, col := range columns {
		ddl.WriteString(fmt.Sprintf("    \"%s\" ", col.ColumnName))

		// Data type
		dataType := strings.ToUpper(col.DataType)
		if col.CharMaxLen != nil && *col.CharMaxLen > 0 {
			ddl.WriteString(fmt.Sprintf("%s(%d)", dataType, *col.CharMaxLen))
		} else {
			ddl.WriteString(dataType)
		}

		// NOT NULL
		if col.IsNullable == "NO" {
			ddl.WriteString(" NOT NULL")
		}

		// Default value
		if col.ColumnDefault != nil && *col.ColumnDefault != "" {
			ddl.WriteString(fmt.Sprintf(" DEFAULT %s", *col.ColumnDefault))
		}

		if i < len(columns)-1 || len(pkColumns) > 0 {
			ddl.WriteString(",")
		}
		ddl.WriteString("\n")
	}

	// Primary key constraint
	if len(pkColumns) > 0 {
		ddl.WriteString(fmt.Sprintf("    PRIMARY KEY (\"%s\")\n", strings.Join(pkColumns, "\", \"")))
	}

	ddl.WriteString(");")
	return ddl.String()
}

// backupGenerateTableInserts generates INSERT statements for all rows in a table
func backupGenerateTableInserts(db *gorm.DB, dbType, tableName string) string {
	// Get column names
	var columns []string
	switch dbType {
	case "postgres":
		db.Raw(`
			SELECT column_name
			FROM information_schema.columns
			WHERE table_name = ? AND table_schema = 'public'
			ORDER BY ordinal_position
		`, tableName).Scan(&columns)
	case "sqlite":
		type PragmaInfo struct {
			Name string
		}
		var pragmaInfos []PragmaInfo
		db.Raw(fmt.Sprintf("PRAGMA table_info(%s)", tableName)).Scan(&pragmaInfos)
		for _, info := range pragmaInfos {
			columns = append(columns, info.Name)
		}
	}

	if len(columns) == 0 {
		return ""
	}

	// Get all rows
	var rows []map[string]interface{}
	db.Table(tableName).Find(&rows)

	if len(rows) == 0 {
		return ""
	}

	var inserts strings.Builder
	quotedTable := backupQuoteIdentifier(dbType, tableName)

	for _, row := range rows {
		var quotedCols []string
		var values []string

		for _, col := range columns {
			quotedCols = append(quotedCols, backupQuoteIdentifier(dbType, col))
			val := row[col]
			values = append(values, formatSQLValue(val))
		}

		inserts.WriteString(fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s);\n",
			quotedTable,
			strings.Join(quotedCols, ", "),
			strings.Join(values, ", "),
		))
	}

	return inserts.String()
}

// formatSQLValue formats a Go value as a SQL literal
func formatSQLValue(val interface{}) string {
	if val == nil {
		return "NULL"
	}
	
	switch v := val.(type) {
	case string:
		// Escape single quotes
		escaped := strings.ReplaceAll(v, "'", "''")
		return fmt.Sprintf("'%s'", escaped)
	case []byte:
		escaped := strings.ReplaceAll(string(v), "'", "''")
		return fmt.Sprintf("'%s'", escaped)
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		return fmt.Sprintf("%d", v)
	case float32, float64:
		return fmt.Sprintf("%v", v)
	case bool:
		if v {
			return "TRUE"
		}
		return "FALSE"
	case time.Time:
		return fmt.Sprintf("'%s'", v.Format("2006-01-02 15:04:05"))
	default:
		// Convert to string and escape
		str := fmt.Sprintf("%v", v)
		escaped := strings.ReplaceAll(str, "'", "''")
		return fmt.Sprintf("'%s'", escaped)
	}
}

// dbmsGetServerInfo returns database server information
func dbmsGetServerInfo(c echo.Context) error {
	db := GetDB(c)
	dbType := db.Dialector.Name()

	info := DBMSServerInfo{
		DatabaseType: dbType,
		ServerTime:   time.Now().Format("2006-01-02 15:04:05"),
	}

	// Get table count
	var tableNames []string
	switch dbType {
	case "postgres":
		db.Raw(`
			SELECT table_name 
			FROM information_schema.tables 
			WHERE table_schema = 'public'
		`).Scan(&tableNames)
	case "sqlite":
		db.Raw(`
			SELECT name 
			FROM sqlite_master 
			WHERE type='table' AND name NOT LIKE 'sqlite_%'
		`).Scan(&tableNames)
	}
	info.TableCount = len(tableNames)

	// Get database-specific information
	switch dbType {
	case "postgres":
		// Get PostgreSQL version
		var version string
		db.Raw("SELECT version()").Scan(&version)
		info.DatabaseVersion = version

		// Get current database name
		var dbName string
		db.Raw("SELECT current_database()").Scan(&dbName)
		info.DatabaseName = dbName

		// Get database size
		var dbSize string
		db.Raw("SELECT pg_size_pretty(pg_database_size(current_database()))").Scan(&dbSize)
		info.DatabaseSize = dbSize

		// Get encoding
		var encoding string
		db.Raw("SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname = current_database()").Scan(&encoding)
		info.Encoding = encoding

		// Get collation
		var collation string
		db.Raw("SELECT datcollate FROM pg_database WHERE datname = current_database()").Scan(&collation)
		info.Collation = collation

	case "sqlite":
		// Get SQLite version
		var version string
		db.Raw("SELECT sqlite_version()").Scan(&version)
		info.DatabaseVersion = "SQLite " + version

		// SQLite database name (file path)
		info.DatabaseName = "SQLite Database"

		// Get database size - use page_count * page_size
		var pageCount, pageSize int64
		db.Raw("PRAGMA page_count").Scan(&pageCount)
		db.Raw("PRAGMA page_size").Scan(&pageSize)
		sizeBytes := pageCount * pageSize
		if sizeBytes < 1024 {
			info.DatabaseSize = fmt.Sprintf("%d B", sizeBytes)
		} else if sizeBytes < 1024*1024 {
			info.DatabaseSize = fmt.Sprintf("%.2f KB", float64(sizeBytes)/1024)
		} else if sizeBytes < 1024*1024*1024 {
			info.DatabaseSize = fmt.Sprintf("%.2f MB", float64(sizeBytes)/(1024*1024))
		} else {
			info.DatabaseSize = fmt.Sprintf("%.2f GB", float64(sizeBytes)/(1024*1024*1024))
		}

		// Get encoding
		var encoding string
		db.Raw("PRAGMA encoding").Scan(&encoding)
		info.Encoding = encoding
	}

	return c.JSON(http.StatusOK, info)
}
