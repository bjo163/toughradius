import {
  List,
  Datagrid,
  TextField,
  DateField,
  Edit,
  SimpleForm,
  TextInput,
  NumberInput,
  SelectInput,
  ReferenceInput,
  Create,
  Show,
  TopToolbar,
  CreateButton,
  ExportButton,
  SortButton,
  ReferenceField,
  PasswordInput,
  required,
  minLength,
  maxLength,
  number,
  minValue,
  maxValue,
  useRecordContext,
  Toolbar,
  SaveButton,
  DeleteButton,
  ToolbarProps,
  ListButton,
  useTranslate,
  useListContext,
  useRefresh,
  useNotify,
  RaRecord,
  FunctionField
} from 'react-admin';
import { apiRequest } from '../utils/apiClient';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Stack,
  Chip,
  Avatar,
  Skeleton,
  IconButton,
  Tooltip,
  useTheme,
  useMediaQuery,
  TextField as MuiTextField,
  alpha
} from '@mui/material';
import { useMemo, useCallback, useState, useEffect } from 'react';
import {
  Router as NasIcon,
  NetworkCheck as NetworkIcon,
  Schedule as TimeIcon,
  Note as NoteIcon,
  ContentCopy as CopyIcon,
  Refresh as RefreshIcon,
  ArrowBack as BackIcon,
  Print as PrintIcon,
  FilterList as FilterIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  CheckCircle as EnabledIcon,
  Cancel as DisabledIcon,
  Dns as ServerIcon,
  VpnKey as SecretIcon,
  Business as VendorIcon
} from '@mui/icons-material';
import {
  ServerPagination,
  ActiveFilters,
  FormSection,
  FieldGrid,
  FieldGridItem,
  formLayoutSx,
  DetailItem,
  DetailSectionCard,
  EmptyValue
} from '../components';

const LARGE_LIST_PER_PAGE = 50;

// ============ Type Definitions ============

interface NASDevice extends RaRecord {
  name?: string;
  identifier?: string;
  ipaddr?: string;
  hostname?: string;
  secret?: string;
  username?: string;
  password?: string;
  vendor_code?: string;
  model?: string;
  coa_port?: number;
  api_port?: number;
  api_state?: 'enabled' | 'disabled';
  snmp_port?: number;
  snmp_community?: string;
  snmp_state?: 'enabled' | 'disabled';
  snmp_last_probe_at?: string;
  snmp_last_result?: string;
  status?: 'enabled' | 'disabled';
  latency?: number;
  node_id?: string;
  tags?: string;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

// ============ Constants ============

// Status options
const STATUS_CHOICES = [
  { id: 'enabled', name: 'Enabled' },
  { id: 'disabled', name: 'Disabled' },
];

// Vendor cache helper - load vendors from backend once and cache
let _vendorCache: Array<{ code: string; name: string }> | null = null;
const loadVendorCache = async () => {
  if (_vendorCache) return _vendorCache;
  try {
    const res = await apiRequest('/network/vendors') as unknown;
    // apiRequest may return an array or a paged object { data: [] }
    let list: Array<Record<string, unknown>> = [];
    if (Array.isArray(res)) {
      list = res as Array<Record<string, unknown>>;
    } else if (res && typeof res === 'object') {
      const obj = res as Record<string, unknown>;
      if (Array.isArray(obj.data)) {
        list = obj.data as Array<Record<string, unknown>>;
      }
    }
    _vendorCache = list.map(v => ({ code: String(v['code']), name: String(v['name'] ?? '') }));
  } catch (e) {
    _vendorCache = [];
  }
  return _vendorCache;
};

// Component to display vendor name for a NAS record (used in lists)
const VendorField = () => {
  const record = useRecordContext<NASDevice>();
  const [name, setName] = useState<string>('-');

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!record || !record.vendor_code) {
        setName('-');
        return;
      }
      const list = await loadVendorCache();
      const found = list.find(v => v.code === String(record.vendor_code));
      if (mounted) setName(found ? found.name : String(record.vendor_code));
    })();
    return () => {
      mounted = false;
    };
  }, [record]);

  if (!record) return null;
  return (
    <Chip
      label={name}
      size="small"
      color="info"
      variant="outlined"
      sx={{ height: 22, fontSize: '0.75rem' }}
    />
  );
};

// Component to render vendor name in detail panels
const VendorName = ({ code }: { code?: string }) => {
  const [name, setName] = useState<string>('-');
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!code) {
        setName('-');
        return;
      }
      const list = await loadVendorCache();
      const found = list.find(v => v.code === String(code));
      if (mounted) setName(found ? found.name : String(code));
    })();
    return () => {
      mounted = false;
    };
  }, [code]);
  return <Typography variant="body2" sx={{ fontWeight: 600 }}>{name}</Typography>;
};

// Select input that loads vendor choices from backend
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const VendorSelectInput = (props: any) => {
  const [choices, setChoices] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const list = await loadVendorCache();
      if (!mounted) return;
      setChoices(list.map(v => ({ id: v.code, name: v.name })));
    })();
    return () => {
      mounted = false;
    };
  }, []);
  return <SelectInput {...props} choices={choices} />;
};

// ============ Utility Functions ============

const formatTimestamp = (value?: string | number): string => {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString();
};

// ============ List Loading Skeleton ============

const NASListSkeleton = ({ rows = 10 }: { rows?: number }) => (
  <Box sx={{ width: '100%' }}>
    {/* Search area skeleton */}
    <Card
      elevation={0}
      sx={{
        mb: 2,
        borderRadius: 2,
        border: theme => `1px solid ${theme.palette.divider}`,
      }}
    >
      <CardContent sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Skeleton variant="rectangular" width={24} height={24} />
          <Skeleton variant="text" width={100} height={24} />
        </Box>
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(4, 1fr)',
            },
          }}
        >
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={40} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      </CardContent>
    </Card>

    {/* Table skeleton */}
    <Card
      elevation={0}
      sx={{
        borderRadius: 2,
        border: theme => `1px solid ${theme.palette.divider}`,
        overflow: 'hidden',
      }}
    >
      {/* Table header */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 1,
          p: 2,
          bgcolor: theme =>
            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
          borderBottom: theme => `1px solid ${theme.palette.divider}`,
        }}
      >
        {[...Array(7)].map((_, i) => (
          <Skeleton key={i} variant="text" height={20} width="80%" />
        ))}
      </Box>

      {/* Table rows */}
      {[...Array(rows)].map((_, rowIndex) => (
        <Box
          key={rowIndex}
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 1,
            p: 2,
            borderBottom: theme => `1px solid ${theme.palette.divider}`,
          }}
        >
          {[...Array(7)].map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              variant="text"
              height={18}
              width={`${60 + Math.random() * 30}%`}
            />
          ))}
        </Box>
      ))}

      {/* Pagination skeleton */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 2,
          p: 2,
        }}
      >
        <Skeleton variant="text" width={100} />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Skeleton variant="circular" width={32} height={32} />
          <Skeleton variant="circular" width={32} height={32} />
        </Box>
      </Box>
    </Card>
  </Box>
);

// ============ Empty State Component ============

const NASEmptyState = () => {
  const translate = useTranslate();
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 8,
        color: 'text.secondary',
      }}
    >
      <NasIcon sx={{ fontSize: 64, opacity: 0.3, mb: 2 }} />
      <Typography variant="h6" sx={{ opacity: 0.6, mb: 1 }}>
        {translate('resources.network/nas.empty.title', { _: 'No NAS Devices' })}
      </Typography>
      <Typography variant="body2" sx={{ opacity: 0.5 }}>
        {translate('resources.network/nas.empty.description', { _: 'Click the "Create" button to add your first NAS device' })}
      </Typography>
    </Box>
  );
};

// ============ Search Header Card Component ============

const NASSearchHeaderCard = () => {
  const translate = useTranslate();
  const { filterValues, setFilters, displayedFilters } = useListContext();
  const [localFilters, setLocalFilters] = useState<Record<string, string>>({});

  useEffect(() => {
    const newLocalFilters: Record<string, string> = {};
    if (filterValues) {
      Object.entries(filterValues).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          newLocalFilters[key] = String(value);
        }
      });
    }
    setLocalFilters(newLocalFilters);
  }, [filterValues]);

  const handleFilterChange = useCallback(
    (field: string, value: string) => {
      setLocalFilters(prev => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleSearch = useCallback(() => {
    const newFilters: Record<string, string> = {};
    Object.entries(localFilters).forEach(([key, value]) => {
      if (value.trim()) {
        newFilters[key] = value.trim();
      }
    });
    setFilters(newFilters, displayedFilters);
  }, [localFilters, setFilters, displayedFilters]);

  const handleClear = useCallback(() => {
    setLocalFilters({});
    setFilters({}, displayedFilters);
  }, [setFilters, displayedFilters]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSearch();
      }
    },
    [handleSearch],
  );

  const filterFields = [
    { key: 'name', label: translate('resources.network/nas.fields.name', { _: 'Device Name' }) },
    { key: 'ipaddr', label: translate('resources.network/nas.fields.ipaddr', { _: 'IP Address' }) },
    { key: 'identifier', label: translate('resources.network/nas.fields.identifier', { _: 'Identifier' }) },
  ];

  return (
    <Card
      elevation={0}
      sx={{
        mb: 2,
        borderRadius: 2,
        border: theme => `1px solid ${theme.palette.divider}`,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          px: 2.5,
          py: 1.5,
          bgcolor: theme =>
            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          borderBottom: theme => `1px solid ${theme.palette.divider}`,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <FilterIcon sx={{ color: 'primary.main', fontSize: 20 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
          {translate('resources.network/nas.filter.title', { _: 'Filter Criteria' })}
        </Typography>
      </Box>

      <CardContent sx={{ p: 2 }}>
        <Box
          sx={{
            display: 'grid',
            gap: 1.5,
            gridTemplateColumns: {
              xs: 'repeat(1, 1fr)',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(4, 1fr)',
            },
            alignItems: 'end',
          }}
        >
          {filterFields.map(field => (
            <MuiTextField
              key={field.key}
              label={field.label}
              value={localFilters[field.key] || ''}
              onChange={e => handleFilterChange(field.key, e.target.value)}
              onKeyPress={handleKeyPress}
              size="small"
              fullWidth
              sx={{
                '& .MuiInputBase-root': {
                  borderRadius: 1.5,
                },
              }}
            />
          ))}

          {/* Action buttons */}
          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
            <Tooltip title={translate('ra.action.clear_filters', { _: 'Clear Filters' })}>
              <IconButton
                onClick={handleClear}
                size="small"
                sx={{
                  bgcolor: theme => alpha(theme.palette.grey[500], 0.1),
                  '&:hover': {
                    bgcolor: theme => alpha(theme.palette.grey[500], 0.2),
                  },
                }}
              >
                <ClearIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={translate('ra.action.search', { _: 'Search' })}>
              <IconButton
                onClick={handleSearch}
                color="primary"
                sx={{
                  bgcolor: theme => alpha(theme.palette.primary.main, 0.1),
                  '&:hover': {
                    bgcolor: theme => alpha(theme.palette.primary.main, 0.2),
                  },
                }}
              >
                <SearchIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

// ============ Status Component ============

const StatusIndicator = ({ isEnabled }: { isEnabled: boolean }) => {
  const translate = useTranslate();
  return (
    <Chip
      icon={isEnabled ? <EnabledIcon sx={{ fontSize: '0.85rem !important' }} /> : <DisabledIcon sx={{ fontSize: '0.85rem !important' }} />}
      label={isEnabled ? translate('resources.network/nas.status.enabled', { _: 'Enabled' }) : translate('resources.network/nas.status.disabled', { _: 'Disabled' })}
      size="small"
      color={isEnabled ? 'success' : 'default'}
      variant={isEnabled ? 'filled' : 'outlined'}
      sx={{ height: 22, fontWeight: 500, fontSize: '0.75rem' }}
    />
  );
};

// ============ Enhanced Field Components ============

const NASNameField = () => {
  const record = useRecordContext<NASDevice>();
  if (!record) return null;

  const isEnabled = record.status === 'enabled';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Avatar
        sx={{
          width: 32,
          height: 32,
          fontSize: '0.85rem',
          fontWeight: 600,
          bgcolor: isEnabled ? 'primary.main' : 'grey.400',
        }}
      >
        {record.name?.charAt(0).toUpperCase() || 'N'}
      </Avatar>
      <Box>
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, color: 'text.primary', lineHeight: 1.3 }}
        >
          {record.name || '-'}
        </Typography>
        <StatusIndicator isEnabled={isEnabled} />
      </Box>
    </Box>
  );
};

// VendorField is defined above and provides dynamic vendor name rendering

const LatencyField = () => {
  const record = useRecordContext<NASDevice>();
  if (!record || record.latency === undefined || record.latency === null) {
    return <Typography variant="body2" color="text.disabled">-</Typography>;
  }
  
  const getColor = (ms: number) => {
    if (ms < 50) return 'success';
    if (ms < 200) return 'warning';
    return 'error';
  };
  
  return (
    <Chip
      label={`${record.latency} ms`}
      size="small"
      color={getColor(record.latency)}
      sx={{ height: 22, fontSize: '0.75rem', fontWeight: 600 }}
    />
  );
};

const SNMPStatusField = () => {
  const record = useRecordContext<NASDevice>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [loading, setLoading] = useState(false);
  if (!record) return null;

  if (record.snmp_state !== 'enabled') {
    return <Typography variant="body2" color="text.disabled">-</Typography>;
  }

  const lastProbe = record.snmp_last_probe_at;
  const lastResult = (record.snmp_last_result || '').toLowerCase();

  const handleProbe = async () => {
    if (!record || !record.id) return;
    setLoading(true);
    try {
      await apiRequest(`/network/nas/${record.id}/probe-snmp`, { method: 'POST' });
      notify('SNMP probe triggered', { type: 'info' });
      // refresh list to show updated status
      refresh();
    } catch (err) {
      const msg = (err as Error)?.message || 'Probe failed';
      notify(msg, { type: 'warning' });
    } finally {
      setLoading(false);
    }
  };

  const label = !lastProbe ? 'SNMP: -' : (lastResult === 'ok' ? `SNMP OK (${formatTimestamp(lastProbe)})` : `SNMP Failed (${formatTimestamp(lastProbe)})`);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Chip label={label} size="small" color={lastResult === 'ok' ? 'success' : undefined} variant={lastResult === 'ok' ? 'filled' : 'outlined'} />
      <Tooltip title="Probe SNMP now">
        <span>
          <IconButton size="small" onClick={handleProbe} disabled={loading}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      {/* If API is enabled, show API probe button and status */}
      {record.api_state === 'enabled' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <FunctionField
            render={() => {
              const apiLast = record.api_last_probe_at ? formatTimestamp(record.api_last_probe_at) : '-';
              const apiRes = (record.api_last_result || '').toLowerCase();
              const apiLabel = apiLast === '-' ? `API: -` : (apiRes === 'ok' ? `API OK (${apiLast})` : `API ${apiRes.toUpperCase()} (${apiLast})`);
              return <Chip label={apiLabel} size="small" variant={apiRes === 'ok' ? 'filled' : 'outlined'} color={apiRes === 'ok' ? 'success' : undefined} />;
            }}
          />
          <Tooltip title="Probe API now">
            <span>
              <IconButton
                size="small"
                onClick={async () => {
                  if (!record || !record.id) return;
                  setLoading(true);
                  try {
                    await apiRequest(`/network/nas/${record.id}/probe-api`, { method: 'POST' });
                    notify('API probe triggered', { type: 'info' });
                    refresh();
                  } catch (err) {
                    notify((err as Error)?.message || 'API probe failed', { type: 'warning' });
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
              >
                <NetworkIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
};

const IPAddressField = () => {
  const record = useRecordContext<NASDevice>();
  if (!record?.ipaddr) return <EmptyValue />;
  
  return (
    <Typography
      variant="body2"
      sx={{
        fontFamily: 'monospace',
        fontSize: '0.85rem',
        bgcolor: theme => alpha(theme.palette.info.main, 0.1),
        px: 1,
        py: 0.25,
        borderRadius: 1,
        display: 'inline-block',
      }}
    >
      {record.ipaddr}
    </Typography>
  );
};

// Tags display component
const TagsDisplay = ({ tags }: { tags?: string }) => {
  if (!tags) return <EmptyValue />;

  const tagList = tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag);
  
  if (tagList.length === 0) {
    return <EmptyValue />;
  }

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {tagList.map((tag: string, index: number) => (
        <Chip
          key={index}
          label={tag}
          size="small"
          variant="outlined"
          color="primary"
          sx={{ height: 22, fontSize: '0.7rem' }}
        />
      ))}
    </Box>
  );
};

// ============ Form Toolbar ============

const NASFormToolbar = (props: ToolbarProps) => (
  <Toolbar {...props}>
    <SaveButton />
    <DeleteButton mutationMode="pessimistic" />
  </Toolbar>
);

// ============ List Actions Bar Component ============

const NASListActions = () => {
  const translate = useTranslate();
  return (
    <TopToolbar>
      <SortButton
        fields={['created_at', 'name', 'ipaddr']}
        label={translate('ra.action.sort', { _: 'Sort' })}
      />
      <CreateButton />
      <ExportButton />
    </TopToolbar>
  );
};

// ============ Internal List Content Component ============

const NASListContent = () => {
  const translate = useTranslate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { data, isLoading, total } = useListContext<NASDevice>();

  const fieldLabels = useMemo(
    () => ({
      name: translate('resources.network/nas.fields.name', { _: 'Device Name' }),
      ipaddr: translate('resources.network/nas.fields.ipaddr', { _: 'IP Address' }),
      identifier: translate('resources.network/nas.fields.identifier', { _: 'Identifier' }),
      status: translate('resources.network/nas.fields.status', { _: 'Status' }),
    }),
    [translate],
  );

  const statusLabels = useMemo(
    () => ({
      enabled: translate('resources.network/nas.status.enabled', { _: 'Enabled' }),
      disabled: translate('resources.network/nas.status.disabled', { _: 'Disabled' }),
    }),
    [translate],
  );

  if (isLoading) {
    return <NASListSkeleton />;
  }

  if (!data || data.length === 0) {
    return (
      <Box>
        <NASSearchHeaderCard />
        <Card
          elevation={0}
          sx={{
            borderRadius: 2,
            border: theme => `1px solid ${theme.palette.divider}`,
          }}
        >
          <NASEmptyState />
        </Card>
      </Box>
    );
  }

  return (
    <Box>
      {/* Search section */}
      <NASSearchHeaderCard />

      {/* Active filter tags */}
      <ActiveFilters fieldLabels={fieldLabels} valueLabels={{ status: statusLabels }} />

      {/* Table container */}
      <Card
        elevation={0}
        sx={{
          borderRadius: 2,
          border: theme => `1px solid ${theme.palette.divider}`,
          overflow: 'hidden',
        }}
      >
        {/* Table statistics */}
        <Box
          sx={{
            px: 2,
            py: 1,
            bgcolor: theme =>
              theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
            borderBottom: theme => `1px solid ${theme.palette.divider}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Total: <strong>{total?.toLocaleString() || 0}</strong> NAS devices
          </Typography>
        </Box>

        {/* Responsive table */}
        <Box
          sx={{
            overflowX: 'auto',
            '& .RaDatagrid-root': {
              minWidth: isMobile ? 900 : 'auto',
            },
            '& .RaDatagrid-thead': {
              position: 'sticky',
              top: 0,
              zIndex: 1,
              bgcolor: theme =>
                theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
              '& th': {
                fontWeight: 600,
                fontSize: '0.8rem',
                color: 'text.secondary',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                py: 1.5,
                borderBottom: theme => `2px solid ${theme.palette.divider}`,
              },
            },
            '& .RaDatagrid-tbody': {
              '& tr': {
                transition: 'background-color 0.15s ease',
                cursor: 'pointer',
                '&:hover': {
                  bgcolor: theme =>
                    theme.palette.mode === 'dark'
                      ? 'rgba(255,255,255,0.05)'
                      : 'rgba(25, 118, 210, 0.04)',
                },
                '&:nth-of-type(odd)': {
                  bgcolor: theme =>
                    theme.palette.mode === 'dark'
                      ? 'rgba(255,255,255,0.01)'
                      : 'rgba(0,0,0,0.01)',
                },
              },
              '& td': {
                py: 1.5,
                fontSize: '0.875rem',
                borderBottom: theme => `1px solid ${alpha(theme.palette.divider, 0.5)}`,
              },
            },
          }}
        >
          <Datagrid rowClick="show" bulkActionButtons={false}>
            <FunctionField
              source="name"
              label={translate('resources.network/nas.fields.name', { _: 'Device Name' })}
              render={() => <NASNameField />}
            />
            <FunctionField
              source="ipaddr"
              label={translate('resources.network/nas.fields.ipaddr', { _: 'IP Address' })}
              render={() => <IPAddressField />}
            />
            <TextField
              source="identifier"
              label={translate('resources.network/nas.fields.identifier', { _: 'Identifier' })}
            />
            <FunctionField
              source="vendor_code"
              label={translate('resources.network/nas.fields.vendor_code', { _: 'Vendor' })}
              render={() => <VendorField />}
            />
            <TextField
              source="model"
              label={translate('resources.network/nas.fields.model', { _: 'Model' })}
            />
            <FunctionField
              source="snmp_last_probe_at"
              label={translate('resources.network/nas.fields.snmp_status', { _: 'SNMP Status' })}
              render={() => <SNMPStatusField />}
            />
            <FunctionField
              source="latency"
              label={translate('resources.network/nas.fields.latency', { _: 'Latency' })}
              render={() => <LatencyField />}
            />
            <ReferenceField source="node_id" reference="network/nodes" label={translate('resources.network/nas.fields.node_id', { _: 'Node' })} link="show">
              <TextField source="name" />
            </ReferenceField>
            <DateField
              source="created_at"
              label={translate('resources.network/nas.fields.created_at', { _: 'Created At' })}
              showTime
            />
          </Datagrid>
        </Box>
      </Card>
    </Box>
  );
};

// NAS device list
export const NASList = () => {
  return (
    <List
      actions={<NASListActions />}
      sort={{ field: 'created_at', order: 'DESC' }}
      perPage={LARGE_LIST_PER_PAGE}
      pagination={<ServerPagination />}
      empty={false}
    >
      <NASListContent />
    </List>
  );
};

// ============ Edit Page ============

export const NASEdit = () => {
  const translate = useTranslate();
  
  return (
    <Edit>
      <SimpleForm toolbar={<NASFormToolbar />} sx={formLayoutSx}>
        <FormSection
          title={translate('resources.network/nas.sections.basic.title', { _: 'Basic Information' })}
          description={translate('resources.network/nas.sections.basic.description', { _: 'Basic configuration of the NAS device' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2, md: 3 }}>
            <FieldGridItem>
              <TextInput
                source="id"
                disabled
                label={translate('resources.network/nas.fields.id', { _: 'Device ID' })}
                helperText={translate('resources.network/nas.helpers.id', { _: 'Auto-generated unique identifier' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="name"
                label={translate('resources.network/nas.fields.name', { _: 'Device Name' })}
                validate={[required(), minLength(1), maxLength(100)]}
                helperText={translate('resources.network/nas.helpers.name', { _: 'Device name with 1-100 characters' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="identifier"
                label={translate('resources.network/nas.fields.identifier', { _: 'Identifier' })}
                validate={[required(), minLength(1), maxLength(100)]}
                helperText={translate('resources.network/nas.helpers.identifier', { _: 'NAS-Identifier attribute value' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <VendorSelectInput
                source="vendor_code"
                label={translate('resources.network/nas.fields.vendor_code', { _: 'Vendor Code' })}
                validate={[required()]}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="model"
                label={translate('resources.network/nas.fields.model', { _: 'Device Model' })}
                validate={[maxLength(100)]}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <SelectInput
                source="status"
                label={translate('resources.network/nas.fields.status', { _: 'Status' })}
                validate={[required()]}
                choices={STATUS_CHOICES}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.network/nas.sections.network.title', { _: 'Network Configuration' })}
          description={translate('resources.network/nas.sections.network.description', { _: 'IP address and hostname configuration' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2, md: 3 }}>
            <FieldGridItem>
              <TextInput
                source="ipaddr"
                label={translate('resources.network/nas.fields.ipaddr', { _: 'IP Address' })}
                validate={[required()]}
                helperText={translate('resources.network/nas.helpers.ipaddr', { _: 'IP address of NAS device' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="hostname"
                label={translate('resources.network/nas.fields.hostname', { _: 'Hostname' })}
                validate={[maxLength(200)]}
                helperText={translate('resources.network/nas.helpers.hostname', { _: 'Hostname of NAS device' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <NumberInput
                source="coa_port"
                label={translate('resources.network/nas.fields.coa_port', { _: 'CoA Port' })}
                validate={[number(), minValue(1), maxValue(65535)]}
                helperText={translate('resources.network/nas.helpers.coa_port', { _: 'CoA/DM port number (1-65535)' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.network/nas.sections.radius.title', { _: 'RADIUS Configuration' })}
          description={translate('resources.network/nas.sections.radius.description', { _: 'RADIUS authentication configuration' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <PasswordInput
                source="secret"
                label={translate('resources.network/nas.fields.secret', { _: 'Shared Secret' })}
                validate={[required(), minLength(6)]}
                helperText={translate('resources.network/nas.helpers.secret', { _: 'RADIUS shared secret, at least 6 characters' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <ReferenceInput source="node_id" reference="network/nodes" label={translate('resources.network/nas.fields.node_id', { _: 'Node' })}>
                <SelectInput optionText="name" fullWidth size="small" />
              </ReferenceInput>
            </FieldGridItem>
            <FieldGridItem span={{ xs: 1, sm: 2 }}>
              <TextInput
                source="tags"
                label={translate('resources.network/nas.fields.tags', { _: 'Tags' })}
                validate={[maxLength(200)]}
                helperText={translate('resources.network/nas.helpers.tags', { _: 'Multiple tags separated by commas' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.network/nas.sections.api.title', { _: 'API Configuration' })}
          description={translate('resources.network/nas.sections.api.description', { _: 'Device API access configuration' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2, md: 3 }}>
            <FieldGridItem>
              <SelectInput
                source="api_state"
                label={translate('resources.network/nas.fields.api_state', { _: 'API State' })}
                choices={STATUS_CHOICES}
                defaultValue="disabled"
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <NumberInput
                source="api_port"
                label={translate('resources.network/nas.fields.api_port', { _: 'API Port' })}
                validate={[number(), minValue(1), maxValue(65535)]}
                helperText={translate('resources.network/nas.helpers.api_port', { _: 'API port number (1-65535)' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="username"
                label={translate('resources.network/nas.fields.username', { _: 'Username' })}
                validate={[maxLength(100)]}
                helperText={translate('resources.network/nas.helpers.username', { _: 'Device login username' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <PasswordInput
                source="password"
                label={translate('resources.network/nas.fields.password', { _: 'Password' })}
                validate={[maxLength(100)]}
                helperText={translate('resources.network/nas.helpers.password', { _: 'Device login password' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.network/nas.sections.snmp.title', { _: 'SNMP Configuration' })}
          description={translate('resources.network/nas.sections.snmp.description', { _: 'SNMP monitoring configuration' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2, md: 3 }}>
            <FieldGridItem>
              <SelectInput
                source="snmp_state"
                label={translate('resources.network/nas.fields.snmp_state', { _: 'SNMP State' })}
                choices={STATUS_CHOICES}
                defaultValue="disabled"
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <NumberInput
                source="snmp_port"
                label={translate('resources.network/nas.fields.snmp_port', { _: 'SNMP Port' })}
                validate={[number(), minValue(1), maxValue(65535)]}
                helperText={translate('resources.network/nas.helpers.snmp_port', { _: 'SNMP port number (default: 161)' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="snmp_community"
                label={translate('resources.network/nas.fields.snmp_community', { _: 'SNMP Community' })}
                validate={[maxLength(100)]}
                helperText={translate('resources.network/nas.helpers.snmp_community', { _: 'SNMP community string' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.network/nas.sections.remark.title', { _: 'Remark Information' })}
          description={translate('resources.network/nas.sections.remark.description', { _: 'Additional notes and remarks' })}
        >
          <FieldGrid columns={{ xs: 1 }}>
            <FieldGridItem>
              <TextInput
                source="remark"
                label={translate('resources.network/nas.fields.remark', { _: 'Remark' })}
                validate={[maxLength(500)]}
                multiline
                minRows={3}
                fullWidth
                size="small"
                helperText={translate('resources.network/nas.helpers.remark', { _: 'Optional remark information' })}
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>
      </SimpleForm>
    </Edit>
  );
};

// ============ Create Page ============

export const NASCreate = () => {
  const translate = useTranslate();
  
  return (
    <Create>
      <SimpleForm sx={formLayoutSx}>
        <FormSection
          title={translate('resources.network/nas.sections.basic.title', { _: 'Basic Information' })}
          description={translate('resources.network/nas.sections.basic.description', { _: 'Basic configuration of the NAS device' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2, md: 3 }}>
            <FieldGridItem>
              <TextInput
                source="name"
                label={translate('resources.network/nas.fields.name', { _: 'Device Name' })}
                validate={[required(), minLength(1), maxLength(100)]}
                helperText={translate('resources.network/nas.helpers.name', { _: 'Device name with 1-100 characters' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="identifier"
                label={translate('resources.network/nas.fields.identifier', { _: 'Identifier' })}
                validate={[required(), minLength(1), maxLength(100)]}
                helperText={translate('resources.network/nas.helpers.identifier', { _: 'NAS-Identifier attribute value' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <VendorSelectInput
                source="vendor_code"
                label={translate('resources.network/nas.fields.vendor_code', { _: 'Vendor Code' })}
                validate={[required()]}
                defaultValue="0"
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="model"
                label={translate('resources.network/nas.fields.model', { _: 'Device Model' })}
                validate={[maxLength(100)]}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <SelectInput
                source="status"
                label={translate('resources.network/nas.fields.status', { _: 'Status' })}
                validate={[required()]}
                choices={STATUS_CHOICES}
                defaultValue="enabled"
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.network/nas.sections.network.title', { _: 'Network Configuration' })}
          description={translate('resources.network/nas.sections.network.description', { _: 'IP address and hostname configuration' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2, md: 3 }}>
            <FieldGridItem>
              <TextInput
                source="ipaddr"
                label={translate('resources.network/nas.fields.ipaddr', { _: 'IP Address' })}
                validate={[required()]}
                helperText={translate('resources.network/nas.helpers.ipaddr', { _: 'IP address of NAS device' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="hostname"
                label={translate('resources.network/nas.fields.hostname', { _: 'Hostname' })}
                validate={[maxLength(200)]}
                helperText={translate('resources.network/nas.helpers.hostname', { _: 'Hostname of NAS device' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <NumberInput
                source="coa_port"
                label={translate('resources.network/nas.fields.coa_port', { _: 'CoA Port' })}
                validate={[number(), minValue(1), maxValue(65535)]}
                helperText={translate('resources.network/nas.helpers.coa_port', { _: 'CoA/DM port number (1-65535)' })}
                defaultValue={3799}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.network/nas.sections.radius.title', { _: 'RADIUS Configuration' })}
          description={translate('resources.network/nas.sections.radius.description', { _: 'RADIUS authentication configuration' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <PasswordInput
                source="secret"
                label={translate('resources.network/nas.fields.secret', { _: 'Shared Secret' })}
                validate={[required(), minLength(6)]}
                helperText={translate('resources.network/nas.helpers.secret', { _: 'RADIUS shared secret, at least 6 characters' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <ReferenceInput source="node_id" reference="network/nodes" label={translate('resources.network/nas.fields.node_id', { _: 'Node' })}>
                <SelectInput optionText="name" fullWidth size="small" />
              </ReferenceInput>
            </FieldGridItem>
            <FieldGridItem span={{ xs: 1, sm: 2 }}>
              <TextInput
                source="tags"
                label={translate('resources.network/nas.fields.tags', { _: 'Tags' })}
                validate={[maxLength(200)]}
                helperText={translate('resources.network/nas.helpers.tags', { _: 'Multiple tags separated by commas' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.network/nas.sections.api.title', { _: 'API Configuration' })}
          description={translate('resources.network/nas.sections.api.description', { _: 'Device API access configuration' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2, md: 3 }}>
            <FieldGridItem>
              <SelectInput
                source="api_state"
                label={translate('resources.network/nas.fields.api_state', { _: 'API State' })}
                choices={STATUS_CHOICES}
                defaultValue="disabled"
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <NumberInput
                source="api_port"
                label={translate('resources.network/nas.fields.api_port', { _: 'API Port' })}
                validate={[number(), minValue(1), maxValue(65535)]}
                helperText={translate('resources.network/nas.helpers.api_port', { _: 'API port number (1-65535)' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="username"
                label={translate('resources.network/nas.fields.username', { _: 'Username' })}
                validate={[maxLength(100)]}
                helperText={translate('resources.network/nas.helpers.username', { _: 'Device login username' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <PasswordInput
                source="password"
                label={translate('resources.network/nas.fields.password', { _: 'Password' })}
                validate={[maxLength(100)]}
                helperText={translate('resources.network/nas.helpers.password', { _: 'Device login password' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.network/nas.sections.snmp.title', { _: 'SNMP Configuration' })}
          description={translate('resources.network/nas.sections.snmp.description', { _: 'SNMP monitoring configuration' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2, md: 3 }}>
            <FieldGridItem>
              <SelectInput
                source="snmp_state"
                label={translate('resources.network/nas.fields.snmp_state', { _: 'SNMP State' })}
                choices={STATUS_CHOICES}
                defaultValue="disabled"
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <NumberInput
                source="snmp_port"
                label={translate('resources.network/nas.fields.snmp_port', { _: 'SNMP Port' })}
                validate={[number(), minValue(1), maxValue(65535)]}
                helperText={translate('resources.network/nas.helpers.snmp_port', { _: 'SNMP port number (default: 161)' })}
                defaultValue={161}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="snmp_community"
                label={translate('resources.network/nas.fields.snmp_community', { _: 'SNMP Community' })}
                validate={[maxLength(100)]}
                helperText={translate('resources.network/nas.helpers.snmp_community', { _: 'SNMP community string' })}
                defaultValue="public"
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.network/nas.sections.remark.title', { _: 'Remark Information' })}
          description={translate('resources.network/nas.sections.remark.description', { _: 'Additional notes and remarks' })}
        >
          <FieldGrid columns={{ xs: 1 }}>
            <FieldGridItem>
              <TextInput
                source="remark"
                label={translate('resources.network/nas.fields.remark', { _: 'Remark' })}
                validate={[maxLength(500)]}
                multiline
                minRows={3}
                fullWidth
                size="small"
                helperText={translate('resources.network/nas.helpers.remark', { _: 'Optional remark information' })}
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>
      </SimpleForm>
    </Create>
  );
};

// ============ Detail Page Header Card ============

const NASHeaderCard = () => {
  const record = useRecordContext<NASDevice>();
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefresh();

  const handleCopy = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    notify(`${label} copied to clipboard`, { type: 'info' });
  }, [notify]);

  const handleRefresh = useCallback(() => {
    refresh();
    notify('Data refreshed', { type: 'info' });
  }, [refresh, notify]);

  if (!record) return null;

  const isEnabled = record.status === 'enabled';

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 4,
        background: theme =>
          theme.palette.mode === 'dark'
            ? isEnabled
              ? `linear-gradient(135deg, ${alpha(theme.palette.primary.dark, 0.4)} 0%, ${alpha(theme.palette.success.dark, 0.3)} 100%)`
              : `linear-gradient(135deg, ${alpha(theme.palette.grey[800], 0.5)} 0%, ${alpha(theme.palette.grey[700], 0.3)} 100%)`
            : isEnabled
            ? `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.success.main, 0.08)} 100%)`
            : `linear-gradient(135deg, ${alpha(theme.palette.grey[400], 0.15)} 0%, ${alpha(theme.palette.grey[300], 0.1)} 100%)`,
        border: theme => `1px solid ${alpha(isEnabled ? theme.palette.primary.main : theme.palette.grey[500], 0.2)}`,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Decorative background */}
      <Box
        sx={{
          position: 'absolute',
          top: -50,
          right: -50,
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: theme => alpha(isEnabled ? theme.palette.primary.main : theme.palette.grey[500], 0.1),
          pointerEvents: 'none',
        }}
      />

      <CardContent sx={{ p: 3, position: 'relative', zIndex: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
          {/* Left: Device information */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar
              sx={{
                width: 64,
                height: 64,
                bgcolor: isEnabled ? 'primary.main' : 'grey.500',
                fontSize: '1.5rem',
                fontWeight: 700,
                boxShadow: theme => `0 4px 14px ${alpha(isEnabled ? theme.palette.primary.main : theme.palette.grey[500], 0.4)}`,
              }}
            >
              {record.name?.charAt(0).toUpperCase() || 'N'}
            </Avatar>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  {record.name || <EmptyValue message="Unknown Device" />}
                </Typography>
                <StatusIndicator isEnabled={isEnabled} />
              </Box>
              {record.ipaddr && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontFamily: 'monospace' }}
                  >
                    {record.ipaddr}
                  </Typography>
                  <Tooltip title="Copy IP address">
                    <IconButton
                      size="small"
                      onClick={() => handleCopy(record.ipaddr!, 'IP address')}
                      sx={{ p: 0.5 }}
                    >
                      <CopyIcon sx={{ fontSize: '0.75rem' }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
            </Box>
          </Box>

          {/* Right: Action buttons */}
          <Box className="no-print" sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Print details">
              <IconButton
                onClick={() => window.print()}
                sx={{
                  bgcolor: theme => alpha(theme.palette.info.main, 0.1),
                  '&:hover': {
                    bgcolor: theme => alpha(theme.palette.info.main, 0.2),
                  },
                }}
              >
                <PrintIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Refresh data">
              <IconButton
                onClick={handleRefresh}
                sx={{
                  bgcolor: theme => alpha(theme.palette.primary.main, 0.1),
                  '&:hover': {
                    bgcolor: theme => alpha(theme.palette.primary.main, 0.2),
                  },
                }}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <ListButton
              label=""
              icon={<BackIcon />}
              sx={{
                minWidth: 'auto',
                bgcolor: theme => alpha(theme.palette.grey[500], 0.1),
                '&:hover': {
                  bgcolor: theme => alpha(theme.palette.grey[500], 0.2),
                },
              }}
            />
          </Box>
        </Box>

        {/* Quick statistics */}
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: {
              xs: 'repeat(2, 1fr)',
              sm: 'repeat(4, 1fr)',
            },
          }}
        >
          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: theme => alpha(theme.palette.background.paper, 0.8),
              backdropFilter: 'blur(8px)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <VendorIcon sx={{ fontSize: '1.1rem', color: 'info.main' }} />
              <Typography variant="caption" color="text.secondary">
                {translate('resources.network/nas.fields.vendor_code', { _: 'Vendor' })}
              </Typography>
            </Box>
            <VendorName code={record.vendor_code} />
          </Box>

          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: theme => alpha(theme.palette.background.paper, 0.8),
              backdropFilter: 'blur(8px)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <ServerIcon sx={{ fontSize: '1.1rem', color: 'success.main' }} />
              <Typography variant="caption" color="text.secondary">
                {translate('resources.network/nas.fields.identifier', { _: 'Identifier' })}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
              {record.identifier || '-'}
            </Typography>
          </Box>

          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: theme => alpha(theme.palette.background.paper, 0.8),
              backdropFilter: 'blur(8px)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <NasIcon sx={{ fontSize: '1.1rem', color: 'warning.main' }} />
              <Typography variant="caption" color="text.secondary">
                {translate('resources.network/nas.fields.model', { _: 'Model' })}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {record.model || '-'}
            </Typography>
          </Box>

          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: theme => alpha(theme.palette.background.paper, 0.8),
              backdropFilter: 'blur(8px)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <NetworkIcon sx={{ fontSize: '1.1rem', color: 'primary.main' }} />
              <Typography variant="caption" color="text.secondary">
                {translate('resources.network/nas.fields.coa_port', { _: 'CoA Port' })}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {record.coa_port || '-'}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

// Print styles
const printStyles = `
  @media print {
    body * {
      visibility: hidden;
    }
    .printable-content, .printable-content * {
      visibility: visible;
    }
    .printable-content {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      padding: 20px !important;
    }
    .no-print {
      display: none !important;
    }
  }
`;

// ============ NAS Details Content ============

const NASDetails = () => {
  const record = useRecordContext<NASDevice>();
  const translate = useTranslate();
  
  if (!record) {
    return null;
  }

  return (
    <>
      <style>{printStyles}</style>
      <Box className="printable-content" sx={{ width: '100%', p: { xs: 2, sm: 3, md: 4 } }}>
        <Stack spacing={3}>
          {/* Top overview card */}
          <NASHeaderCard />

          {/* Network configuration */}
          <DetailSectionCard
            title={translate('resources.network/nas.sections.network.title', { _: 'Network Configuration' })}
            description={translate('resources.network/nas.sections.network.description', { _: 'Hostname configuration' })}
            icon={<NetworkIcon />}
            color="success"
          >
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: {
                  xs: 'repeat(1, 1fr)',
                  sm: 'repeat(2, 1fr)',
                },
              }}
            >
              <DetailItem
                label={translate('resources.network/nas.fields.hostname', { _: 'Hostname' })}
                value={record.hostname || <EmptyValue />}
              />
              <DetailItem
                label={translate('resources.network/nas.fields.latency', { _: 'Latency' })}
                value={record.latency !== undefined && record.latency !== null ? (
                  <Chip
                    label={`${record.latency} ms`}
                    size="small"
                    color={record.latency < 50 ? 'success' : record.latency < 200 ? 'warning' : 'error'}
                  />
                ) : <EmptyValue />}
              />
            </Box>
          </DetailSectionCard>

          {/* RADIUS configuration */}
          <DetailSectionCard
            title={translate('resources.network/nas.sections.radius.title', { _: 'RADIUS Configuration' })}
            description={translate('resources.network/nas.sections.radius.description', { _: 'RADIUS authentication configuration' })}
            icon={<SecretIcon />}
            color="warning"
          >
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: {
                  xs: 'repeat(1, 1fr)',
                  sm: 'repeat(2, 1fr)',
                },
              }}
            >
              <DetailItem
                label={translate('resources.network/nas.fields.node_id', { _: 'Node' })}
                value={
                  record.node_id ? (
                    <ReferenceField source="node_id" reference="network/nodes" link="show">
                      <TextField source="name" />
                    </ReferenceField>
                  ) : <EmptyValue />
                }
              />
              <DetailItem
                label={translate('resources.network/nas.fields.tags', { _: 'Tags' })}
                value={<TagsDisplay tags={record.tags} />}
              />
            </Box>
          </DetailSectionCard>

          {/* API configuration */}
          <DetailSectionCard
            title={translate('resources.network/nas.sections.api.title', { _: 'API Configuration' })}
            description={translate('resources.network/nas.sections.api.description', { _: 'Device API access configuration' })}
            icon={<ServerIcon />}
            color="primary"
          >
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: {
                  xs: 'repeat(1, 1fr)',
                  sm: 'repeat(2, 1fr)',
                  md: 'repeat(4, 1fr)',
                },
              }}
            >
              <DetailItem
                label={translate('resources.network/nas.fields.api_state', { _: 'API State' })}
                value={
                  <Chip
                    icon={record.api_state === 'enabled' ? <EnabledIcon /> : <DisabledIcon />}
                    label={record.api_state === 'enabled' ? 'Enabled' : 'Disabled'}
                    size="small"
                    color={record.api_state === 'enabled' ? 'success' : 'default'}
                  />
                }
              />
              <DetailItem
                label={translate('resources.network/nas.fields.api_port', { _: 'API Port' })}
                value={record.api_port || <EmptyValue />}
              />
              <DetailItem
                label={translate('resources.network/nas.fields.username', { _: 'Username' })}
                value={record.username || <EmptyValue />}
              />
              <DetailItem
                label={translate('resources.network/nas.fields.password', { _: 'Password' })}
                value={record.password ? '••••••••' : <EmptyValue />}
              />
            </Box>
          </DetailSectionCard>

          {/* SNMP configuration */}
          <DetailSectionCard
            title={translate('resources.network/nas.sections.snmp.title', { _: 'SNMP Configuration' })}
            description={translate('resources.network/nas.sections.snmp.description', { _: 'SNMP monitoring configuration' })}
            icon={<NetworkIcon />}
            color="success"
          >
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: {
                  xs: 'repeat(1, 1fr)',
                  sm: 'repeat(3, 1fr)',
                },
              }}
            >
              <DetailItem
                label={translate('resources.network/nas.fields.snmp_state', { _: 'SNMP State' })}
                value={
                  <Chip
                    icon={record.snmp_state === 'enabled' ? <EnabledIcon /> : <DisabledIcon />}
                    label={record.snmp_state === 'enabled' ? 'Enabled' : 'Disabled'}
                    size="small"
                    color={record.snmp_state === 'enabled' ? 'success' : 'default'}
                  />
                }
              />
              <DetailItem
                label={translate('resources.network/nas.fields.snmp_port', { _: 'SNMP Port' })}
                value={record.snmp_port || <EmptyValue />}
              />
              <DetailItem
                label={translate('resources.network/nas.fields.snmp_community', { _: 'SNMP Community' })}
                value={record.snmp_community || <EmptyValue />}
              />
            </Box>
          </DetailSectionCard>

          {/* Time information */}
          <DetailSectionCard
            title={translate('resources.network/nas.sections.timestamps.title', { _: 'Time Information' })}
            description={translate('resources.network/nas.sections.timestamps.description', { _: 'Creation and update time' })}
            icon={<TimeIcon />}
            color="info"
          >
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: {
                  xs: 'repeat(1, 1fr)',
                  sm: 'repeat(2, 1fr)',
                },
              }}
            >
              <DetailItem
                label={translate('resources.network/nas.fields.created_at', { _: 'Created At' })}
                value={formatTimestamp(record.created_at)}
              />
              <DetailItem
                label={translate('resources.network/nas.fields.updated_at', { _: 'Updated At' })}
                value={formatTimestamp(record.updated_at)}
              />
            </Box>
          </DetailSectionCard>

          {/* Remark information */}
          <DetailSectionCard
            title={translate('resources.network/nas.sections.remark.title', { _: 'Remarks' })}
            description={translate('resources.network/nas.sections.remark.description', { _: 'Additional notes and remarks' })}
            icon={<NoteIcon />}
            color="primary"
          >
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: theme =>
                  theme.palette.mode === 'dark'
                    ? 'rgba(255, 255, 255, 0.02)'
                    : 'rgba(0, 0, 0, 0.02)',
                border: theme => `1px solid ${theme.palette.divider}`,
                minHeight: 80,
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: record.remark ? 'text.primary' : 'text.disabled',
                  fontStyle: record.remark ? 'normal' : 'italic',
                }}
              >
                {record.remark || translate('resources.network/nas.helpers.no_remark', { _: 'No remarks' })}
              </Typography>
            </Box>
          </DetailSectionCard>
        </Stack>
      </Box>
    </>
  );
};

// NAS Device Details
export const NASShow = () => {
  return (
    <Show>
      <NASDetails />
    </Show>
  );
};
