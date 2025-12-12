import React, { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Chip,
  CircularProgress,
  Tabs,
  Tab,
  Tooltip,
  Skeleton,
  Select,
  MenuItem,
  Checkbox,
  Divider,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  PlayArrow as PlayArrowIcon,
  Storage as StorageIcon,
  TableChart as TableChartIcon,
  CreateNewFolder as CreateTableIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Download as DownloadIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { useNotify, useTranslate } from 'react-admin';
import { apiRequest, authFetch } from '../utils/apiClient';

// ============================================================================
// Types
// ============================================================================

interface TableInfo {
  name: string;
  row_count: number;
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primary_key: boolean;
  default_value: string;
}

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rows_affected: number;
  error?: string;
}

interface RowData {
  id?: number | string;
  [key: string]: unknown;
}

interface EditingColumn {
  originalName: string;
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string;
  isNew?: boolean;
}

interface ColumnConfig {
  name: string;
  type: string;
  primaryKey: boolean;
  autoIncrement: boolean;
  nullable: boolean;
  defaultValue: string;
}

interface CreateTableRequest {
  name: string;
  columns: ColumnConfig[];
}

interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
  primary: boolean;
  type?: string;
}

interface ForeignKeyInfo {
  name: string;
  column: string;
  referenced_table: string;
  referenced_column: string;
  on_update?: string;
  on_delete?: string;
}

interface TableDDL {
  table_name: string;
  ddl: string;
}

interface ServerInfo {
  database_type: string;
  database_version: string;
  server_time: string;
  database_name: string;
  database_size: string;
  table_count: number;
  encoding?: string;
  collation?: string;
}

const COLUMN_TYPES = [
  { value: 'int', label: 'INT' },
  { value: 'bigint', label: 'BIGINT' },
  { value: 'varchar', label: 'VARCHAR(255)' },
  { value: 'text', label: 'TEXT' },
  { value: 'boolean', label: 'BOOLEAN' },
  { value: 'timestamp', label: 'TIMESTAMP' },
  { value: 'date', label: 'DATE' },
  { value: 'float', label: 'FLOAT' },
  { value: 'double', label: 'DOUBLE' },
  { value: 'json', label: 'JSON' },
];

// ============================================================================
// Query Keys
// ============================================================================

const DBMS_TABLES_KEY = ['dbms', 'tables'] as const;
const DBMS_SCHEMA_KEY = (tableName: string) => ['dbms', 'schema', tableName] as const;
const DBMS_DATA_KEY = (tableName: string, page: number, pageSize: number) => 
  ['dbms', 'data', tableName, page, pageSize] as const;
const DBMS_INDEXES_KEY = (tableName: string) => ['dbms', 'indexes', tableName] as const;
const DBMS_FOREIGNKEYS_KEY = (tableName: string) => ['dbms', 'foreignkeys', tableName] as const;
const DBMS_DDL_KEY = (tableName: string) => ['dbms', 'ddl', tableName] as const;
const DBMS_SERVERINFO_KEY = ['dbms', 'serverinfo'] as const;

// ============================================================================
// Tab Panel
// ============================================================================

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <div role="tabpanel" hidden={value !== index} style={{ height: '100%' }}>
    {value === index && <Box sx={{ height: '100%', overflow: 'auto' }}>{children}</Box>}
  </div>
);

// ============================================================================
// Main Component
// ============================================================================

export const DbmsPage: React.FC = () => {
  const notify = useNotify();
  const translate = useTranslate();
  const queryClient = useQueryClient();

  // State
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [tabIndex, setTabIndex] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  // SQL Query State
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM ');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);

  // Row editing
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<RowData | null>(null);
  const [isNewRow, setIsNewRow] = useState(false);
  const [deleteRowDialogOpen, setDeleteRowDialogOpen] = useState(false);
  const [deleteTableDialogOpen, setDeleteTableDialogOpen] = useState(false);

  // Create Table
  const [createTableDialogOpen, setCreateTableDialogOpen] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableColumns, setNewTableColumns] = useState<ColumnConfig[]>([
    { name: 'id', type: 'int', primaryKey: true, autoIncrement: true, nullable: false, defaultValue: '' },
  ]);

  // Structure editing
  const [editingColumnIndex, setEditingColumnIndex] = useState<number | null>(null);
  const [editingColumn, setEditingColumn] = useState<EditingColumn | null>(null);
  const [newColumnMode, setNewColumnMode] = useState(false);

  // ============================================================================
  // Queries
  // ============================================================================

  const tablesQuery = useQuery<TableInfo[]>({
    queryKey: DBMS_TABLES_KEY,
    queryFn: () => apiRequest<TableInfo[]>('/dbms/tables'),
    staleTime: 30 * 1000,
  });

  const schemaQuery = useQuery<ColumnInfo[]>({
    queryKey: DBMS_SCHEMA_KEY(selectedTable),
    queryFn: () => apiRequest<ColumnInfo[]>(`/dbms/tables/${selectedTable}/schema`),
    enabled: !!selectedTable,
    staleTime: 60 * 1000,
  });

  const dataQuery = useQuery<{ data: RowData[]; total: number }>({
    queryKey: DBMS_DATA_KEY(selectedTable, page, rowsPerPage),
    queryFn: async () => {
        const url = `/dbms/tables/${selectedTable}?page=${page + 1}&pageSize=${rowsPerPage}&_sort=id&_order=DESC`;
        const response = await authFetch(url, { method: 'GET' });
        if (!response.ok) throw new Error('Failed to fetch data');
        const contentRange = response.headers.get('Content-Range');
        let total = 0;
        if (contentRange) {
          const match = contentRange.match(/\d+-\d+\/(\d+)/);
          if (match) total = parseInt(match[1], 10);
        }
        const data = await response.json().catch(() => []);
        return { data: data || [], total };
    },
    enabled: !!selectedTable,
    staleTime: 10 * 1000,
  });

  // Indexes query
  const indexesQuery = useQuery<IndexInfo[]>({
    queryKey: DBMS_INDEXES_KEY(selectedTable),
    queryFn: () => apiRequest<IndexInfo[]>(`/dbms/tables/${selectedTable}/indexes`),
    enabled: !!selectedTable,
    staleTime: 60 * 1000,
  });

  // Foreign keys query
  const foreignKeysQuery = useQuery<ForeignKeyInfo[]>({
    queryKey: DBMS_FOREIGNKEYS_KEY(selectedTable),
    queryFn: () => apiRequest<ForeignKeyInfo[]>(`/dbms/tables/${selectedTable}/foreignkeys`),
    enabled: !!selectedTable,
    staleTime: 60 * 1000,
  });

  // DDL query
  const ddlQuery = useQuery<TableDDL>({
    queryKey: DBMS_DDL_KEY(selectedTable),
    queryFn: () => apiRequest<TableDDL>(`/dbms/tables/${selectedTable}/ddl`),
    enabled: !!selectedTable,
    staleTime: 60 * 1000,
  });

  // Server info query
  const serverInfoQuery = useQuery<ServerInfo>({
    queryKey: DBMS_SERVERINFO_KEY,
    queryFn: () => apiRequest<ServerInfo>('/dbms/serverinfo'),
    staleTime: 60 * 1000,
  });

  // ============================================================================
  // Mutations
  // ============================================================================

  const executeQueryMutation = useMutation({
    mutationFn: (sql: string) => 
      apiRequest<QueryResult>('/dbms/query', { method: 'POST', body: JSON.stringify({ sql }) }),
    onSuccess: (data) => {
      setQueryResult(data);
      if (data.error) {
        notify(`Error: ${data.error}`, { type: 'error' });
      } else {
        notify(translate('dbms.queryExecuted', { _: 'Query executed' }), { type: 'success' });
        if (selectedTable) {
          queryClient.invalidateQueries({ queryKey: ['dbms', 'data', selectedTable] });
          queryClient.invalidateQueries({ queryKey: ['dbms', 'schema', selectedTable] });
        }
        queryClient.invalidateQueries({ queryKey: DBMS_TABLES_KEY });
      }
    },
    onError: (error: Error) => notify(error.message, { type: 'error' }),
  });

  const createRowMutation = useMutation({
    mutationFn: (data: RowData) =>
      apiRequest(`/dbms/tables/${selectedTable}/rows`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      notify(translate('dbms.rowCreated', { _: 'Row created' }), { type: 'success' });
      setEditDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['dbms', 'data', selectedTable] });
      queryClient.invalidateQueries({ queryKey: DBMS_TABLES_KEY });
    },
    onError: (error: Error) => notify(error.message, { type: 'error' }),
  });

  const updateRowMutation = useMutation({
    mutationFn: (data: RowData) =>
      apiRequest(`/dbms/tables/${selectedTable}/rows/${data.id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      notify(translate('dbms.rowUpdated', { _: 'Row updated' }), { type: 'success' });
      setEditDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['dbms', 'data', selectedTable] });
    },
    onError: (error: Error) => notify(error.message, { type: 'error' }),
  });

  const deleteRowMutation = useMutation({
    mutationFn: (id: number | string) =>
      apiRequest(`/dbms/tables/${selectedTable}/rows/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify(translate('dbms.rowDeleted', { _: 'Row deleted' }), { type: 'success' });
      setDeleteRowDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['dbms', 'data', selectedTable] });
      queryClient.invalidateQueries({ queryKey: DBMS_TABLES_KEY });
    },
    onError: (error: Error) => notify(error.message, { type: 'error' }),
  });

  const createTableMutation = useMutation({
    mutationFn: (data: CreateTableRequest) =>
      apiRequest('/dbms/tables', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      notify(translate('dbms.tableCreated', { _: 'Table created' }), { type: 'success' });
      setCreateTableDialogOpen(false);
      resetCreateTableForm();
      queryClient.invalidateQueries({ queryKey: DBMS_TABLES_KEY });
    },
    onError: (error: Error) => notify(error.message, { type: 'error' }),
  });

  const dropTableMutation = useMutation({
    mutationFn: (tableName: string) =>
      apiRequest(`/dbms/tables/${tableName}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify(translate('dbms.tableDropped', { _: 'Table dropped' }), { type: 'success' });
      setDeleteTableDialogOpen(false);
      setSelectedTable('');
      queryClient.invalidateQueries({ queryKey: DBMS_TABLES_KEY });
    },
    onError: (error: Error) => notify(error.message, { type: 'error' }),
  });

  const addColumnMutation = useMutation({
    mutationFn: (data: { name: string; type: string; nullable: boolean; default_value: string }) =>
      apiRequest(`/dbms/tables/${selectedTable}/columns`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      notify(translate('dbms.columnAdded', { _: 'Column added' }), { type: 'success' });
      setNewColumnMode(false);
      setEditingColumn(null);
      queryClient.invalidateQueries({ queryKey: ['dbms', 'schema', selectedTable] });
      queryClient.invalidateQueries({ queryKey: ['dbms', 'data', selectedTable] });
    },
    onError: (error: Error) => notify(error.message, { type: 'error' }),
  });

  const modifyColumnMutation = useMutation({
    mutationFn: (data: { column: string; type: string; nullable: boolean; default_value: string }) =>
      apiRequest(`/dbms/tables/${selectedTable}/columns/${data.column}/modify`, {
        method: 'PUT',
        body: JSON.stringify({ type: data.type, nullable: data.nullable, default_value: data.default_value }),
      }),
    onSuccess: () => {
      notify(translate('dbms.columnModified', { _: 'Column modified' }), { type: 'success' });
      setEditingColumnIndex(null);
      setEditingColumn(null);
      queryClient.invalidateQueries({ queryKey: ['dbms', 'schema', selectedTable] });
    },
    onError: (error: Error) => notify(error.message, { type: 'error' }),
  });

  const renameColumnMutation = useMutation({
    mutationFn: (data: { oldName: string; newName: string }) =>
      apiRequest(`/dbms/tables/${selectedTable}/columns/${data.oldName}/rename`, {
        method: 'PUT',
        body: JSON.stringify({ new_name: data.newName }),
      }),
    onSuccess: () => {
      notify(translate('dbms.columnRenamed', { _: 'Column renamed' }), { type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['dbms', 'schema', selectedTable] });
    },
    onError: (error: Error) => notify(error.message, { type: 'error' }),
  });

  const dropColumnMutation = useMutation({
    mutationFn: (columnName: string) =>
      apiRequest(`/dbms/tables/${selectedTable}/columns/${columnName}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify(translate('dbms.columnDropped', { _: 'Column dropped' }), { type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['dbms', 'schema', selectedTable] });
      queryClient.invalidateQueries({ queryKey: ['dbms', 'data', selectedTable] });
    },
    onError: (error: Error) => notify(error.message, { type: 'error' }),
  });

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleTableSelect = useCallback((tableName: string) => {
    setSelectedTable(tableName);
    setPage(0);
    setTabIndex(0);
    setSqlQuery(`SELECT * FROM ${tableName} LIMIT 100`);
    setEditingColumnIndex(null);
    setEditingColumn(null);
    setNewColumnMode(false);
  }, []);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: DBMS_TABLES_KEY });
    if (selectedTable) {
      queryClient.invalidateQueries({ queryKey: ['dbms', 'data', selectedTable] });
      queryClient.invalidateQueries({ queryKey: ['dbms', 'schema', selectedTable] });
    }
  }, [queryClient, selectedTable]);

  const handleOpenEditRow = useCallback((row: RowData | null, isNew: boolean) => {
    if (isNew && schemaQuery.data) {
      const newRow: RowData = {};
      schemaQuery.data.forEach((col) => {
        if (!col.primary_key) newRow[col.name] = '';
      });
      setEditingRow(newRow);
    } else {
      setEditingRow(row ? { ...row } : null);
    }
    setIsNewRow(isNew);
    setEditDialogOpen(true);
  }, [schemaQuery.data]);

  const handleSaveRow = useCallback(() => {
    if (!editingRow) return;
    if (isNewRow) createRowMutation.mutate(editingRow);
    else updateRowMutation.mutate(editingRow);
  }, [editingRow, isNewRow, createRowMutation, updateRowMutation]);

  const handleDeleteRow = useCallback(() => {
    if (!editingRow?.id) return;
    deleteRowMutation.mutate(editingRow.id);
  }, [editingRow, deleteRowMutation]);

  const resetCreateTableForm = useCallback(() => {
    setNewTableName('');
    setNewTableColumns([{ name: 'id', type: 'int', primaryKey: true, autoIncrement: true, nullable: false, defaultValue: '' }]);
  }, []);

  const handleCreateTableColumn = useCallback((index: number, field: keyof ColumnConfig, value: string | boolean) => {
    setNewTableColumns((prev) => prev.map((col, i) => (i === index ? { ...col, [field]: value } : col)));
  }, []);

  const handleAddTableColumn = useCallback(() => {
    setNewTableColumns((prev) => [...prev, { name: '', type: 'varchar', primaryKey: false, autoIncrement: false, nullable: true, defaultValue: '' }]);
  }, []);

  const handleRemoveTableColumn = useCallback((index: number) => {
    setNewTableColumns((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleCreateTable = useCallback(() => {
    if (!newTableName.trim()) {
      notify(translate('dbms.enterTableName', { _: 'Enter table name' }), { type: 'warning' });
      return;
    }
    createTableMutation.mutate({ name: newTableName.trim(), columns: newTableColumns.filter((col) => col.name.trim()) });
  }, [newTableName, newTableColumns, createTableMutation, notify, translate]);

  // Column editing
  const handleEditColumn = useCallback((index: number, col: ColumnInfo) => {
    setEditingColumnIndex(index);
    const normalizedType = col.type.toLowerCase()
      .replace(/\(.*\)/, '')
      .replace('character varying', 'varchar')
      .replace('integer', 'int')
      .replace('bigint', 'bigint')
      .replace('double precision', 'double')
      .trim();
    setEditingColumn({
      originalName: col.name,
      name: col.name,
      type: COLUMN_TYPES.find(t => normalizedType.includes(t.value))?.value || 'varchar',
      nullable: col.nullable,
      defaultValue: col.default_value || '',
    });
    setNewColumnMode(false);
  }, []);

  const handleNewColumn = useCallback(() => {
    setNewColumnMode(true);
    setEditingColumnIndex(null);
    setEditingColumn({ originalName: '', name: '', type: 'varchar', nullable: true, defaultValue: '', isNew: true });
  }, []);

  const handleCancelColumnEdit = useCallback(() => {
    setEditingColumnIndex(null);
    setEditingColumn(null);
    setNewColumnMode(false);
  }, []);

  const handleSaveColumn = useCallback(async () => {
    if (!editingColumn) return;
    if (!editingColumn.name.trim()) {
      notify(translate('dbms.enterColumnName', { _: 'Enter column name' }), { type: 'warning' });
      return;
    }

    if (editingColumn.isNew) {
      addColumnMutation.mutate({
        name: editingColumn.name.trim(),
        type: editingColumn.type,
        nullable: editingColumn.nullable,
        default_value: editingColumn.defaultValue,
      });
    } else {
      // Rename if needed
      if (editingColumn.name !== editingColumn.originalName) {
        await renameColumnMutation.mutateAsync({ oldName: editingColumn.originalName, newName: editingColumn.name });
      }
      // Modify type
      modifyColumnMutation.mutate({
        column: editingColumn.name,
        type: editingColumn.type,
        nullable: editingColumn.nullable,
        default_value: editingColumn.defaultValue,
      });
    }
  }, [editingColumn, addColumnMutation, modifyColumnMutation, renameColumnMutation, notify, translate]);

  const handleDeleteColumn = useCallback((columnName: string) => {
    if (window.confirm(`Drop column "${columnName}"?`)) {
      dropColumnMutation.mutate(columnName);
    }
  }, [dropColumnMutation]);

  const handleBackupDatabase = useCallback(() => {
  const url = `/api/v1/dbms/backup`;
    
    // Create a temporary link to trigger download
    authFetch(url, { method: 'GET' })
      .then((response) => {
        if (!response.ok) throw new Error('Backup failed');
        return response.blob();
      })
      .then((blob) => {
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `toughradius_backup_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.sql`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
        notify(translate('dbms.backupSuccess', { _: 'Database backup downloaded' }), { type: 'success' });
      })
      .catch((error) => {
        notify(error.message || translate('dbms.backupFailed', { _: 'Backup failed' }), { type: 'error' });
      });
  }, [notify, translate]);

  // ============================================================================
  // Derived State
  // ============================================================================

  const tables = useMemo(() => tablesQuery.data || [], [tablesQuery.data]);
  const schema = useMemo(() => schemaQuery.data || [], [schemaQuery.data]);
  const tableData = useMemo(() => dataQuery.data?.data || [], [dataQuery.data]);
  const totalRows = useMemo(() => dataQuery.data?.total || 0, [dataQuery.data]);

  const isLoading = tablesQuery.isLoading || schemaQuery.isLoading || dataQuery.isLoading;
  const isMutating = createRowMutation.isPending || updateRowMutation.isPending || deleteRowMutation.isPending ||
    createTableMutation.isPending || dropTableMutation.isPending || addColumnMutation.isPending ||
    modifyColumnMutation.isPending || renameColumnMutation.isPending || dropColumnMutation.isPending;

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 100px)', gap: 1, p: 1 }}>
      {/* Left Panel - Table List */}
      <Paper sx={{ width: 240, minWidth: 200, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
          <StorageIcon color="primary" fontSize="small" />
          <Typography variant="subtitle2" fontWeight="bold" sx={{ flex: 1 }}>
            {translate('dbms.tables', { _: 'Tables' })}
          </Typography>
          <Tooltip title={translate('dbms.backupDatabase', { _: 'Backup' })}>
            <IconButton size="small" onClick={handleBackupDatabase}>
              <DownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={translate('dbms.refresh', { _: 'Refresh' })}>
            <span>
              <IconButton size="small" onClick={handleRefresh} disabled={isLoading}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={translate('dbms.createTable', { _: 'New' })}>
            <IconButton size="small" onClick={() => { resetCreateTableForm(); setCreateTableDialogOpen(true); }}>
              <CreateTableIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        
        <List dense sx={{ flex: 1, overflow: 'auto', py: 0 }}>
          {tablesQuery.isLoading ? (
            <Box sx={{ p: 2 }}>{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={32} sx={{ mb: 0.5 }} />)}</Box>
          ) : tables.length === 0 ? (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="textSecondary">{translate('dbms.noTables', { _: 'No tables' })}</Typography>
            </Box>
          ) : (
            tables.map((table) => (
              <ListItem key={table.name} disablePadding>
                <ListItemButton selected={selectedTable === table.name} onClick={() => handleTableSelect(table.name)} sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    <TableChartIcon fontSize="small" color={selectedTable === table.name ? 'primary' : 'action'} />
                  </ListItemIcon>
                  <ListItemText
                    primary={table.name}
                    secondary={`${table.row_count} rows`}
                    primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                </ListItemButton>
              </ListItem>
            ))
          )}
        </List>

        {/* Server Info */}
        <Divider />
        <Box sx={{ p: 1, bgcolor: 'grey.50' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <InfoIcon fontSize="small" color="primary" />
            <Typography variant="caption" fontWeight="bold">
              {translate('dbms.serverInfo', { _: 'Server Info' })}
            </Typography>
          </Box>
          {serverInfoQuery.isLoading ? (
            <Skeleton height={60} />
          ) : serverInfoQuery.data ? (
            <Box sx={{ fontSize: 11, color: 'text.secondary' }}>
              <Box><strong>{translate('dbms.dbType', { _: 'Type' })}:</strong> {serverInfoQuery.data.database_type}</Box>
              <Box sx={{ wordBreak: 'break-word' }}><strong>{translate('dbms.dbVersion', { _: 'Version' })}:</strong> {serverInfoQuery.data.database_version}</Box>
              <Box><strong>{translate('dbms.dbSize', { _: 'Size' })}:</strong> {serverInfoQuery.data.database_size}</Box>
              <Box><strong>{translate('dbms.encoding', { _: 'Encoding' })}:</strong> {serverInfoQuery.data.encoding || '-'}</Box>
              <Box><strong>{translate('dbms.tableCount', { _: 'Tables' })}:</strong> {serverInfoQuery.data.table_count}</Box>
            </Box>
          ) : null}
        </Box>
      </Paper>

      {/* Right Panel */}
      <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selectedTable ? (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box sx={{ textAlign: 'center' }}>
              <StorageIcon sx={{ fontSize: 64, color: 'action.disabled', mb: 2 }} />
              <Typography color="textSecondary">{translate('dbms.selectTableHint', { _: 'Select a table' })}</Typography>
            </Box>
          </Box>
        ) : (
          <>
            {/* Header */}
            <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
              <TableChartIcon color="primary" />
              <Typography variant="subtitle1" fontWeight="bold" sx={{ flex: 1 }}>{selectedTable}</Typography>
              <Button size="small" color="error" onClick={() => setDeleteTableDialogOpen(true)} disabled={isMutating}>
                {translate('dbms.dropTable', { _: 'Drop' })}
              </Button>
            </Box>

            {/* Tabs */}
            <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 36 }}>
              <Tab label={translate('dbms.data', { _: 'Data' })} sx={{ minHeight: 36, py: 0 }} />
              <Tab label={translate('dbms.structure', { _: 'Structure' })} sx={{ minHeight: 36, py: 0 }} />
              <Tab label={translate('dbms.indexes', { _: 'Indexes' })} sx={{ minHeight: 36, py: 0 }} />
              <Tab label={translate('dbms.foreignKeys', { _: 'Foreign Keys' })} sx={{ minHeight: 36, py: 0 }} />
              <Tab label={translate('dbms.createCode', { _: 'CREATE Code' })} sx={{ minHeight: 36, py: 0 }} />
              <Tab label={translate('dbms.query', { _: 'Query' })} sx={{ minHeight: 36, py: 0 }} />
            </Tabs>

            {/* Data Tab */}
            <TabPanel value={tabIndex} index={0}>
              <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Box sx={{ mb: 1, display: 'flex', gap: 1 }}>
                  <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenEditRow(null, true)}>
                    {translate('dbms.addRow', { _: 'Add' })}
                  </Button>
                  <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={handleRefresh}>
                    {translate('dbms.refresh', { _: 'Refresh' })}
                  </Button>
                </Box>

                {dataQuery.isLoading ? (
                  <Box sx={{ p: 2 }}>{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={40} sx={{ mb: 1 }} />)}</Box>
                ) : tableData.length === 0 ? (
                  <Alert severity="info">{translate('dbms.noData', { _: 'No data' })}</Alert>
                ) : (
                  <>
                    <TableContainer sx={{ flex: 1 }}>
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100', width: 80 }}>#</TableCell>
                            {schema.map((col) => (
                              <TableCell key={col.name} sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>
                                {col.name}{col.primary_key && <Chip size="small" label="PK" sx={{ ml: 0.5, height: 16, fontSize: 10 }} />}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {tableData.map((row, idx) => (
                            <TableRow key={row.id || idx} hover>
                              <TableCell>
                                <IconButton size="small" onClick={() => handleOpenEditRow(row, false)}><EditIcon fontSize="small" /></IconButton>
                                <IconButton size="small" color="error" onClick={() => { setEditingRow(row); setDeleteRowDialogOpen(true); }}><DeleteIcon fontSize="small" /></IconButton>
                              </TableCell>
                              {schema.map((col) => (
                                <TableCell key={col.name} sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {String(row[col.name] ?? '')}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    <TablePagination
                      component="div"
                      count={totalRows}
                      page={page}
                      onPageChange={(_, p) => setPage(p)}
                      rowsPerPage={rowsPerPage}
                      onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                      rowsPerPageOptions={[20, 50, 100, 200]}
                    />
                  </>
                )}
              </Box>
            </TabPanel>

            {/* Structure Tab */}
            <TabPanel value={tabIndex} index={1}>
              <Box sx={{ p: 1 }}>
                <Box sx={{ mb: 1 }}>
                  <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={handleNewColumn} disabled={newColumnMode || editingColumnIndex !== null}>
                    {translate('dbms.addColumn', { _: 'Add Column' })}
                  </Button>
                </Box>

                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'grey.100' }}>
                        <TableCell sx={{ fontWeight: 'bold', width: 180 }}>{translate('dbms.columnName', { _: 'Name' })}</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 140 }}>{translate('dbms.columnType', { _: 'Type' })}</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 70 }}>{translate('dbms.nullable', { _: 'Null' })}</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 130 }}>{translate('dbms.defaultValue', { _: 'Default' })}</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 60 }}>Key</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 100 }}></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {/* New Column Row */}
                      {newColumnMode && editingColumn && (
                        <TableRow sx={{ bgcolor: 'action.hover' }}>
                          <TableCell>
                            <TextField size="small" fullWidth value={editingColumn.name}
                              onChange={(e) => setEditingColumn({ ...editingColumn, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                              placeholder="column_name" autoFocus />
                          </TableCell>
                          <TableCell>
                            <Select size="small" fullWidth value={editingColumn.type}
                              onChange={(e) => setEditingColumn({ ...editingColumn, type: e.target.value })}>
                              {COLUMN_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Checkbox checked={editingColumn.nullable} size="small"
                              onChange={(e) => setEditingColumn({ ...editingColumn, nullable: e.target.checked })} />
                          </TableCell>
                          <TableCell>
                            <TextField size="small" fullWidth value={editingColumn.defaultValue}
                              onChange={(e) => setEditingColumn({ ...editingColumn, defaultValue: e.target.value })} placeholder="NULL" />
                          </TableCell>
                          <TableCell>-</TableCell>
                          <TableCell>
                            <IconButton size="small" color="primary" onClick={handleSaveColumn} disabled={isMutating}><SaveIcon fontSize="small" /></IconButton>
                            <IconButton size="small" onClick={handleCancelColumnEdit}><CancelIcon fontSize="small" /></IconButton>
                          </TableCell>
                        </TableRow>
                      )}

                      {/* Existing Columns */}
                      {schema.map((col, index) => (
                        <TableRow key={col.name} hover>
                          {editingColumnIndex === index && editingColumn ? (
                            <>
                              <TableCell>
                                <TextField size="small" fullWidth value={editingColumn.name}
                                  onChange={(e) => setEditingColumn({ ...editingColumn, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                                  disabled={col.primary_key} />
                              </TableCell>
                              <TableCell>
                                <Select size="small" fullWidth value={editingColumn.type}
                                  onChange={(e) => setEditingColumn({ ...editingColumn, type: e.target.value })}
                                  disabled={col.primary_key}>
                                  {COLUMN_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Checkbox checked={editingColumn.nullable} size="small"
                                  onChange={(e) => setEditingColumn({ ...editingColumn, nullable: e.target.checked })}
                                  disabled={col.primary_key} />
                              </TableCell>
                              <TableCell>
                                <TextField size="small" fullWidth value={editingColumn.defaultValue}
                                  onChange={(e) => setEditingColumn({ ...editingColumn, defaultValue: e.target.value })}
                                  disabled={col.primary_key} />
                              </TableCell>
                              <TableCell>{col.primary_key ? <Chip size="small" label="PK" color="primary" /> : '-'}</TableCell>
                              <TableCell>
                                <IconButton size="small" color="primary" onClick={handleSaveColumn} disabled={isMutating || col.primary_key}><SaveIcon fontSize="small" /></IconButton>
                                <IconButton size="small" onClick={handleCancelColumnEdit}><CancelIcon fontSize="small" /></IconButton>
                              </TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell>{col.name}</TableCell>
                              <TableCell>{col.type}</TableCell>
                              <TableCell>{col.nullable ? '✓' : ''}</TableCell>
                              <TableCell sx={{ color: col.default_value ? 'text.primary' : 'text.disabled', fontStyle: col.default_value ? 'normal' : 'italic' }}>
                                {col.default_value || 'NULL'}
                              </TableCell>
                              <TableCell>{col.primary_key ? <Chip size="small" label="PK" color="primary" /> : '-'}</TableCell>
                              <TableCell>
                                <IconButton size="small" onClick={() => handleEditColumn(index, col)} disabled={editingColumnIndex !== null || newColumnMode}>
                                  <EditIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" color="error" onClick={() => handleDeleteColumn(col.name)}
                                  disabled={col.primary_key || editingColumnIndex !== null || newColumnMode}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </TabPanel>

            {/* Indexes Tab */}
            <TabPanel value={tabIndex} index={2}>
              <Box sx={{ p: 1, height: '100%', overflow: 'auto' }}>
                {indexesQuery.isLoading ? (
                  <Box sx={{ p: 2 }}>{[1, 2, 3].map((i) => <Skeleton key={i} height={40} sx={{ mb: 1 }} />)}</Box>
                ) : !indexesQuery.data || indexesQuery.data.length === 0 ? (
                  <Alert severity="info">{translate('dbms.noIndexes', { _: 'No indexes found' })}</Alert>
                ) : (
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>{translate('dbms.indexName', { _: 'Name' })}</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>{translate('dbms.columns', { _: 'Columns' })}</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>{translate('dbms.type', { _: 'Type' })}</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>{translate('dbms.unique', { _: 'Unique' })}</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>{translate('dbms.primary', { _: 'Primary' })}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {indexesQuery.data.map((idx, i) => (
                          <TableRow key={i} hover>
                            <TableCell>{idx.name}</TableCell>
                            <TableCell>{idx.columns?.join(', ') || '-'}</TableCell>
                            <TableCell>{idx.type || 'BTREE'}</TableCell>
                            <TableCell>{idx.unique ? <Chip size="small" label="YES" color="success" /> : <Chip size="small" label="NO" />}</TableCell>
                            <TableCell>{idx.primary ? <Chip size="small" label="PK" color="primary" /> : '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            </TabPanel>

            {/* Foreign Keys Tab */}
            <TabPanel value={tabIndex} index={3}>
              <Box sx={{ p: 1, height: '100%', overflow: 'auto' }}>
                {foreignKeysQuery.isLoading ? (
                  <Box sx={{ p: 2 }}>{[1, 2, 3].map((i) => <Skeleton key={i} height={40} sx={{ mb: 1 }} />)}</Box>
                ) : !foreignKeysQuery.data || foreignKeysQuery.data.length === 0 ? (
                  <Alert severity="info">{translate('dbms.noForeignKeys', { _: 'No foreign keys found' })}</Alert>
                ) : (
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>{translate('dbms.constraintName', { _: 'Constraint' })}</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>{translate('dbms.columnName', { _: 'Column' })}</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>{translate('dbms.referencedTable', { _: 'Ref. Table' })}</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>{translate('dbms.referencedColumn', { _: 'Ref. Column' })}</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>{translate('dbms.onUpdate', { _: 'ON UPDATE' })}</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>{translate('dbms.onDelete', { _: 'ON DELETE' })}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {foreignKeysQuery.data.map((fk, i) => (
                          <TableRow key={i} hover>
                            <TableCell>{fk.name}</TableCell>
                            <TableCell>{fk.column}</TableCell>
                            <TableCell><Chip size="small" label={fk.referenced_table} color="info" /></TableCell>
                            <TableCell>{fk.referenced_column}</TableCell>
                            <TableCell>{fk.on_update || 'NO ACTION'}</TableCell>
                            <TableCell>{fk.on_delete || 'NO ACTION'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            </TabPanel>

            {/* CREATE Code Tab */}
            <TabPanel value={tabIndex} index={4}>
              <Box sx={{ p: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ mb: 1, display: 'flex', gap: 1 }}>
                  <Button size="small" variant="outlined" onClick={() => {
                    if (ddlQuery.data?.ddl) {
                      navigator.clipboard.writeText(ddlQuery.data.ddl);
                      notify(translate('dbms.copiedToClipboard', { _: 'Copied to clipboard' }), { type: 'success' });
                    }
                  }} disabled={!ddlQuery.data?.ddl}>
                    {translate('dbms.copyDDL', { _: 'Copy to Clipboard' })}
                  </Button>
                  <Button size="small" variant="outlined" onClick={() => ddlQuery.refetch()}>
                    <RefreshIcon fontSize="small" />
                  </Button>
                </Box>
                {ddlQuery.isLoading ? (
                  <Box sx={{ p: 2 }}><Skeleton height={200} /></Box>
                ) : ddlQuery.data?.ddl ? (
                  <Paper variant="outlined" sx={{ flex: 1, overflow: 'auto', p: 2, bgcolor: 'grey.50' }}>
                    <pre style={{ margin: 0, fontFamily: 'Consolas, Monaco, monospace', fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {ddlQuery.data.ddl}
                    </pre>
                  </Paper>
                ) : (
                  <Alert severity="info">{translate('dbms.noDDL', { _: 'No DDL available' })}</Alert>
                )}
              </Box>
            </TabPanel>

            {/* Query Tab */}
            <TabPanel value={tabIndex} index={5}>
              <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                <TextField fullWidth multiline rows={4} value={sqlQuery} onChange={(e) => setSqlQuery(e.target.value)}
                  placeholder="SELECT * FROM ..." sx={{ mb: 1, '& textarea': { fontFamily: 'monospace', fontSize: 13 } }} />
                <Box sx={{ mb: 1 }}>
                  <Button variant="contained" startIcon={executeQueryMutation.isPending ? <CircularProgress size={16} /> : <PlayArrowIcon />}
                    onClick={() => executeQueryMutation.mutate(sqlQuery)} disabled={executeQueryMutation.isPending || !sqlQuery.trim()}>
                    {translate('dbms.execute', { _: 'Execute' })}
                  </Button>
                </Box>

                {queryResult && (
                  <Box sx={{ flex: 1, overflow: 'auto' }}>
                    {queryResult.error ? (
                      <Alert severity="error">{queryResult.error}</Alert>
                    ) : queryResult.rows && queryResult.rows.length > 0 ? (
                      <TableContainer component={Paper} variant="outlined">
                        <Table size="small" stickyHeader>
                          <TableHead>
                            <TableRow>
                              {queryResult.columns.map((col) => <TableCell key={col} sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>{col}</TableCell>)}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {queryResult.rows.map((row, idx) => (
                              <TableRow key={idx} hover>
                                {queryResult.columns.map((col) => <TableCell key={col}>{String(row[col] ?? '')}</TableCell>)}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    ) : (
                      <Alert severity="success">
                        {queryResult.rows_affected !== undefined ? `${queryResult.rows_affected} rows affected` : 'Query executed'}
                      </Alert>
                    )}
                  </Box>
                )}
              </Box>
            </TabPanel>
          </>
        )}
      </Paper>

      {/* Dialogs */}
      
      {/* Edit Row Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{isNewRow ? translate('dbms.createRow', { _: 'Create Row' }) : translate('dbms.editRow', { _: 'Edit Row' })}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {schema.map((col) => (
              <TextField key={col.name} label={`${col.name} (${col.type})`} value={editingRow?.[col.name] ?? ''}
                onChange={(e) => setEditingRow((prev) => prev ? { ...prev, [col.name]: e.target.value } : null)}
                disabled={col.primary_key && !isNewRow} fullWidth size="small"
                helperText={col.primary_key ? 'Primary Key' : col.nullable ? 'Nullable' : 'Required'} />
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>{translate('ra.action.cancel', { _: 'Cancel' })}</Button>
          <Button variant="contained" onClick={handleSaveRow} disabled={isMutating}>
            {isMutating ? <CircularProgress size={20} /> : translate('ra.action.save', { _: 'Save' })}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Row Dialog */}
      <Dialog open={deleteRowDialogOpen} onClose={() => setDeleteRowDialogOpen(false)}>
        <DialogTitle>{translate('dbms.confirmDelete', { _: 'Confirm Delete' })}</DialogTitle>
        <DialogContent><Typography>Delete this row?</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteRowDialogOpen(false)}>{translate('ra.action.cancel', { _: 'Cancel' })}</Button>
          <Button variant="contained" color="error" onClick={handleDeleteRow} disabled={isMutating}>
            {isMutating ? <CircularProgress size={20} /> : translate('ra.action.delete', { _: 'Delete' })}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Table Dialog */}
      <Dialog open={deleteTableDialogOpen} onClose={() => setDeleteTableDialogOpen(false)}>
        <DialogTitle>{translate('dbms.confirmDropTable', { _: 'Drop Table?' })}</DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>This will permanently delete all data!</Alert>
          <Typography>Drop table "{selectedTable}"?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTableDialogOpen(false)}>{translate('ra.action.cancel', { _: 'Cancel' })}</Button>
          <Button variant="contained" color="error" onClick={() => dropTableMutation.mutate(selectedTable)} disabled={isMutating}>
            {isMutating ? <CircularProgress size={20} /> : translate('dbms.dropTable', { _: 'Drop' })}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Table Dialog */}
      <Dialog open={createTableDialogOpen} onClose={() => setCreateTableDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle><CreateTableIcon sx={{ mr: 1, verticalAlign: 'middle' }} />{translate('dbms.createTable', { _: 'Create Table' })}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField label={translate('dbms.tableName', { _: 'Table Name' })} value={newTableName}
              onChange={(e) => setNewTableName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              fullWidth size="small" placeholder="my_table" />

            <Typography variant="subtitle2">{translate('dbms.columns', { _: 'Columns' })}</Typography>

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <TableCell>Name</TableCell><TableCell>Type</TableCell><TableCell>PK</TableCell>
                    <TableCell>Auto++</TableCell><TableCell>Null</TableCell><TableCell>Default</TableCell><TableCell></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {newTableColumns.map((col, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <TextField size="small" value={col.name}
                          onChange={(e) => handleCreateTableColumn(index, 'name', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                          placeholder="col" sx={{ width: 120 }} />
                      </TableCell>
                      <TableCell>
                        <Select size="small" value={col.type} onChange={(e) => handleCreateTableColumn(index, 'type', e.target.value)} sx={{ minWidth: 100 }}>
                          {COLUMN_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                        </Select>
                      </TableCell>
                      <TableCell><Checkbox size="small" checked={col.primaryKey} onChange={(e) => handleCreateTableColumn(index, 'primaryKey', e.target.checked)} /></TableCell>
                      <TableCell><Checkbox size="small" checked={col.autoIncrement} onChange={(e) => handleCreateTableColumn(index, 'autoIncrement', e.target.checked)} disabled={!col.primaryKey} /></TableCell>
                      <TableCell><Checkbox size="small" checked={col.nullable} onChange={(e) => handleCreateTableColumn(index, 'nullable', e.target.checked)} disabled={col.primaryKey} /></TableCell>
                      <TableCell>
                        <TextField size="small" value={col.defaultValue} onChange={(e) => handleCreateTableColumn(index, 'defaultValue', e.target.value)} placeholder="NULL" sx={{ width: 80 }} />
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" color="error" onClick={() => handleRemoveTableColumn(index)} disabled={newTableColumns.length <= 1}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddTableColumn} sx={{ alignSelf: 'flex-start' }}>
              {translate('dbms.addColumn', { _: 'Add Column' })}
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateTableDialogOpen(false)}>{translate('ra.action.cancel', { _: 'Cancel' })}</Button>
          <Button variant="contained" onClick={handleCreateTable} disabled={isMutating}>
            {isMutating ? <CircularProgress size={20} /> : translate('dbms.createTable', { _: 'Create' })}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DbmsPage;
