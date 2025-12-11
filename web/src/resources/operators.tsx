import {
  List,
  Datagrid,
  TextField,
  EmailField,
  DateField,
  Edit,
  SimpleForm,
  TextInput,
  SelectInput,
  PasswordInput,
  Create,
  Show,
  TopToolbar,
  ExportButton,
  ListButton,
  SortButton,
  required,
  minLength,
  maxLength,
  email,
  regex,
  useRecordContext,
  useGetIdentity,
  useTranslate,
  useRefresh,
  useNotify,
  useListContext,
  RaRecord,
  FunctionField,
  ReferenceField,
  ReferenceInput,
  AutocompleteInput,
  CreateButton,
  downloadCSV,
} from 'react-admin';
import {
  Box,
  Chip,
  Typography,
  Card,
  CardContent,
  Stack,
  Avatar,
  IconButton,
  Tooltip,
  Skeleton,
  useTheme,
  useMediaQuery,
  TextField as MuiTextField,
  Autocomplete,
  alpha
} from '@mui/material';
import { apiRequest } from '../utils/apiClient';
import { useMemo, useCallback, useState, useEffect } from 'react';
import {
  Security as SecurityIcon,
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
  Email as EmailIcon,
  Phone as PhoneIcon,
  AdminPanelSettings as AdminIcon
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

interface Operator extends RaRecord {
  username?: string;
  realname?: string;
  email?: string;
  mobile?: string;
  partner_id?: number;
  level?: 'super' | 'admin' | 'operator';
  status?: 'enabled' | 'disabled';
  remark?: string;
  last_login?: string;
  created_at?: string;
  updated_at?: string;
}

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

// ============ Validation Rules ============

const useValidationRules = () => {
  const translate = useTranslate();

  return {
    validateUsername: [
      required(translate('resources.system/operators.validation.username_required', { _: 'Username is required' })),
      minLength(3, translate('resources.system/operators.validation.username_min', { _: 'Username must be at least 3 characters' })),
      maxLength(30, translate('resources.system/operators.validation.username_max', { _: 'Username cannot exceed 30 characters' })),
      regex(/^[a-zA-Z0-9_]+$/, translate('resources.system/operators.validation.username_format', { _: 'Username can only contain letters, numbers and underscores' })),
    ],
    validatePassword: [
      required(translate('resources.system/operators.validation.password_required', { _: 'Password is required' })),
      minLength(6, translate('resources.system/operators.validation.password_min', { _: 'Password must be at least 6 characters' })),
      maxLength(50, translate('resources.system/operators.validation.password_max', { _: 'Password cannot exceed 50 characters' })),
      regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, translate('resources.system/operators.validation.password_format', { _: 'Password must contain letters and numbers' })),
    ],
    validatePasswordOptional: [
      minLength(6, translate('resources.system/operators.validation.password_min', { _: 'Password must be at least 6 characters' })),
      maxLength(50, translate('resources.system/operators.validation.password_max', { _: 'Password cannot exceed 50 characters' })),
      regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, translate('resources.system/operators.validation.password_format', { _: 'Password must contain letters and numbers' })),
    ],
    validateEmail: [email(translate('resources.system/operators.validation.email_invalid', { _: 'Invalid email format' }))],
    validateMobile: [
      regex(
        /^(0|\+?86)?(13[0-9]|14[57]|15[0-35-9]|17[0678]|18[0-9])[0-9]{8}$/,
        translate('resources.system/operators.validation.mobile_invalid', { _: 'Invalid mobile number format' })
      ),
    ],
    validateRealname: [required(translate('resources.system/operators.validation.realname_required', { _: 'Real name is required' }))],
    validateLevel: [required(translate('resources.system/operators.validation.level_required', { _: 'Permission level is required' }))],
    validateStatus: [required(translate('resources.system/operators.validation.status_required', { _: 'Status is required' }))],
  };
};

// ============ List Loading Skeleton ============

const OperatorListSkeleton = ({ rows = 10 }: { rows?: number }) => (
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
          gridTemplateColumns: 'repeat(8, 1fr)',
          gap: 1,
          p: 2,
          bgcolor: theme =>
            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
          borderBottom: theme => `1px solid ${theme.palette.divider}`,
        }}
      >
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} variant="text" height={20} width="80%" />
        ))}
      </Box>

      {/* Table rows */}
      {[...Array(rows)].map((_, rowIndex) => (
        <Box
          key={rowIndex}
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(8, 1fr)',
            gap: 1,
            p: 2,
            borderBottom: theme => `1px solid ${theme.palette.divider}`,
          }}
        >
          {[...Array(8)].map((_, colIndex) => (
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

const OperatorEmptyState = () => {
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
      <AdminIcon sx={{ fontSize: 64, opacity: 0.3, mb: 2 }} />
      <Typography variant="h6" sx={{ opacity: 0.6, mb: 1 }}>
        {translate('resources.system/operators.empty.title', { _: 'No Operators' })}
      </Typography>
      <Typography variant="body2" sx={{ opacity: 0.5 }}>
        {translate('resources.system/operators.empty.description', { _: 'Click "Create" button to add the first operator' })}
      </Typography>
    </Box>
  );
};

// ============ Search Header Card Component ============

const OperatorSearchHeaderCard = () => {
  const translate = useTranslate();
  const { filterValues, setFilters, displayedFilters } = useListContext();
  const [localFilters, setLocalFilters] = useState<Record<string, string>>({});
  const [partners, setPartners] = useState<Array<{ id: number; name: string }>>([]);

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

  useEffect(() => {
    // fetch partner list for autocomplete
    let mounted = true;
    (async () => {
      try {
        const res = await apiRequest(`/system/partners?perPage=200`);
        let items: Array<Record<string, unknown>> = [];
        if (Array.isArray(res)) items = res as Array<Record<string, unknown>>;
        else if (res && typeof res === 'object') {
          const r = res as Record<string, unknown>;
          items = (Array.isArray(r.data) ? (r.data as Array<Record<string, unknown>>) : Array.isArray(r.items) ? (r.items as Array<Record<string, unknown>>) : []);
        }
        if (mounted) setPartners(items.map(i => ({ id: Number(i['id']), name: String(i['name'] || '') })));
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

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
    { key: 'username', label: translate('resources.system/operators.fields.username', { _: 'Username' }) },
    { key: 'realname', label: translate('resources.system/operators.fields.realname', { _: 'Real Name' }) },
    { key: 'email', label: translate('resources.system/operators.fields.email', { _: 'Email' }) },
    { key: 'partner_id', label: translate('resources.system/operators.fields.partner', { _: 'Partner' }) },
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
          {translate('resources.system/operators.filter.title', { _: 'Filter Conditions' })}
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
          {filterFields.map(field => {
            if (field.key === 'partner_id') {
              return (
                <Autocomplete
                  key={field.key}
                  options={partners}
                  getOptionLabel={(opt: { id: number; name: string } | null) => opt?.name || ''}
                  value={partners.find(p => String(p.id) === String(localFilters['partner_id'])) || null}
                  onChange={(_, v: { id: number; name: string } | null) => handleFilterChange('partner_id', v ? String(v.id) : '')}
                  renderInput={(params) => (
                    <MuiTextField
                      {...params}
                      label={field.label}
                      size="small"
                      fullWidth
                    />
                  )}
                />
              );
            }
            return (
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
            );
          })}

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

// ============ Status and Level Components ============

const StatusIndicator = ({ isEnabled }: { isEnabled: boolean }) => {
  const translate = useTranslate();
  return (
    <Chip
      icon={isEnabled ? <EnabledIcon sx={{ fontSize: '0.85rem !important' }} /> : <DisabledIcon sx={{ fontSize: '0.85rem !important' }} />}
      label={isEnabled ? translate('resources.system/operators.status.enabled', { _: 'Enabled' }) : translate('resources.system/operators.status.disabled', { _: 'Disabled' })}
      size="small"
      color={isEnabled ? 'success' : 'default'}
      variant={isEnabled ? 'filled' : 'outlined'}
      sx={{ height: 22, fontWeight: 500, fontSize: '0.75rem' }}
    />
  );
};

const LevelChip = ({ level }: { level?: string }) => {
  const translate = useTranslate();
  
  const levelConfig: Record<string, { color: 'error' | 'warning' | 'info'; label: string }> = {
    super: { color: 'error', label: translate('resources.system/operators.levels.super', { _: 'Super Admin' }) },
    admin: { color: 'warning', label: translate('resources.system/operators.levels.admin', { _: 'Admin' }) },
    operator: { color: 'info', label: translate('resources.system/operators.levels.operator', { _: 'Operator' }) },
  };

  const config = levelConfig[level || ''] || { color: 'info', label: level || '-' };

  return (
    <Chip
      label={config.label}
      size="small"
      color={config.color}
      sx={{ height: 22, fontWeight: 500, fontSize: '0.75rem' }}
    />
  );
};

// ============ Enhanced Field Components ============

const OperatorNameField = () => {
  const record = useRecordContext<Operator>();
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
        {record.username?.charAt(0).toUpperCase() || 'O'}
      </Avatar>
      <Box>
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, color: 'text.primary', lineHeight: 1.3 }}
        >
          {record.username || '-'}
        </Typography>
        <StatusIndicator isEnabled={isEnabled} />
      </Box>
    </Box>
  );
};

const LevelField = () => {
  const record = useRecordContext<Operator>();
  if (!record) return null;
  return <LevelChip level={record.level} />;
};

// ============ List Actions Component ============

const OperatorListActions = () => {
  const translate = useTranslate();
  const exporter = (records: Record<string, unknown>[]) => {
    // include partner_id and partner_name if available on record
    const data: Array<Record<string, unknown>> = records.map(r => ({
      id: r.id,
      username: r.username,
      realname: r.realname,
      email: r.email,
      mobile: r.mobile,
  partner_id: r.partner_id ?? '',
  partner_name: ((r.partner as Record<string, unknown>)?.['name'] as string) || (r.partner_name as string) || '',
      level: r.level,
      status: r.status,
      last_login: r.last_login,
      created_at: r.created_at,
    }));

    if (!data || data.length === 0) {
      downloadCSV('', 'operators');
      return;
    }

    const keys = Object.keys(data[0]);
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = keys.join(',');
  const rows = data.map(d => keys.map(k => escape((d as Record<string, unknown>)[k])).join(','));
    const csv = [header, ...rows].join('\n');
    downloadCSV(csv, 'operators');
  };
  return (
    <TopToolbar>
      <SortButton
        fields={['created_at', 'username', 'last_login']}
        label={translate('ra.action.sort', { _: 'Sort' })}
      />
  <CreateButton />
      <ExportButton exporter={exporter} />
    </TopToolbar>
  );
};

// ============ Internal List Content Component ============

const OperatorListContent = () => {
  const translate = useTranslate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { data, isLoading, total } = useListContext<Operator>();

  const fieldLabels = useMemo(
    () => ({
      username: translate('resources.system/operators.fields.username', { _: 'Username' }),
      realname: translate('resources.system/operators.fields.realname', { _: 'Real Name' }),
      email: translate('resources.system/operators.fields.email', { _: 'Email' }),
      status: translate('resources.system/operators.fields.status', { _: 'Status' }),
      level: translate('resources.system/operators.fields.level', { _: 'Permission Level' }),
    }),
    [translate],
  );

  const statusLabels = useMemo(
    () => ({
      enabled: translate('resources.system/operators.status.enabled', { _: 'Enabled' }),
      disabled: translate('resources.system/operators.status.disabled', { _: 'Disabled' }),
    }),
    [translate],
  );

  const levelLabels = useMemo(
    () => ({
      super: translate('resources.system/operators.levels.super', { _: 'Super Admin' }),
      admin: translate('resources.system/operators.levels.admin', { _: 'Admin' }),
      operator: translate('resources.system/operators.levels.operator', { _: 'Operator' }),
    }),
    [translate],
  );

  if (isLoading) {
    return <OperatorListSkeleton />;
  }

  if (!data || data.length === 0) {
    return (
      <Box>
        <OperatorSearchHeaderCard />
        <Card
          elevation={0}
          sx={{
            borderRadius: 2,
            border: theme => `1px solid ${theme.palette.divider}`,
          }}
        >
          <OperatorEmptyState />
        </Card>
      </Box>
    );
  }

  return (
    <Box>
      {/* Search block */}
      <OperatorSearchHeaderCard />

      {/* Active filter tags */}
      <ActiveFilters fieldLabels={fieldLabels} valueLabels={{ status: statusLabels, level: levelLabels }} />

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
            Total <strong>{total?.toLocaleString() || 0}</strong> operators
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
              source="username"
              label={translate('resources.system/operators.fields.username', { _: 'Username' })}
              render={() => <OperatorNameField />}
            />
            <TextField
              source="realname"
              label={translate('resources.system/operators.fields.realname', { _: 'Real Name' })}
            />
            <EmailField
              source="email"
              label={translate('resources.system/operators.fields.email', { _: 'Email' })}
            />
              <ReferenceField
                label={translate('resources.system/operators.fields.partner', { _: 'Partner' })}
                source="partner_id"
                reference="system/partners"
                link="show"
              >
                <TextField source="name" />
              </ReferenceField>
            <TextField
              source="mobile"
              label={translate('resources.system/operators.fields.mobile', { _: 'Mobile' })}
            />
            <FunctionField
              source="level"
              label={translate('resources.system/operators.fields.level', { _: 'Permission Level' })}
              render={() => <LevelField />}
            />
            <DateField
              source="last_login"
              label={translate('resources.system/operators.fields.last_login', { _: 'Last Login' })}
              showTime
            />
            <DateField
              source="created_at"
              label={translate('resources.system/operators.fields.created_at', { _: 'Created At' })}
              showTime
            />
          </Datagrid>
        </Box>
      </Card>
    </Box>
  );
};

// Operator List
export const OperatorList = () => {
  return (
    <List
      actions={<OperatorListActions />}
      sort={{ field: 'created_at', order: 'DESC' }}
      perPage={LARGE_LIST_PER_PAGE}
      pagination={<ServerPagination />}
      empty={false}
    >
      <OperatorListContent />
    </List>
  );
};

// ============ Password Input Component ============

const PasswordInputWithRecord = () => {
  const record = useRecordContext<Operator>();
  const translate = useTranslate();
  const validation = useValidationRules();
  
  if (record?.level === 'super') {
    return null;
  }
  
  return (
    <PasswordInput 
      source="password" 
      label={translate('resources.system/operators.fields.password', { _: 'Password' })} 
      validate={validation.validatePasswordOptional}
      helperText={translate('resources.system/operators.helpers.password_optional', { _: 'Leave empty to keep current password' })} 
      fullWidth
      size="small"
    />
  );
};

// ============ Edit Page ============

export const OperatorEdit = () => {
  const { identity } = useGetIdentity();
  const record = useRecordContext<Operator>();
  const translate = useTranslate();
  const validation = useValidationRules();
  
  const isEditingSelf = identity && record && String(identity.id) === String(record.id);
  const canManagePermissions = identity?.level === 'super' || identity?.level === 'admin';
  
  return (
    <Edit>
      <SimpleForm sx={formLayoutSx}>
        <FormSection 
          title={translate('resources.system/operators.sections.basic.title', { _: 'Account Information' })} 
          description={translate('resources.system/operators.sections.basic.description', { _: 'Login credentials for the operator' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <TextInput 
                source="id" 
                label={translate('resources.system/operators.fields.id', { _: 'Operator ID' })} 
                disabled 
                fullWidth 
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput 
                source="username" 
                label={translate('resources.system/operators.fields.username', { _: 'Username' })} 
                validate={validation.validateUsername}
                helperText={translate('resources.system/operators.helpers.username', { _: '3-30 characters, letters, numbers and underscores only' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem span={{ xs: 1, sm: 2 }}>
              <PasswordInputWithRecord />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection 
          title={translate('resources.system/operators.sections.personal.title', { _: 'Personal Information' })} 
          description={translate('resources.system/operators.sections.personal.description', { _: 'Contact details and personal profile' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <TextInput 
                source="realname" 
                label={translate('resources.system/operators.fields.realname', { _: 'Real Name' })} 
                validate={validation.validateRealname}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput 
                source="email" 
                label={translate('resources.system/operators.fields.email', { _: 'Email' })} 
                type="email" 
                validate={validation.validateEmail}
                helperText={translate('resources.system/operators.helpers.email', { _: 'For receiving system notifications' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <ReferenceInput
                source="partner_id"
                reference="system/partners"
                label={translate('resources.system/operators.fields.partner', { _: 'Partner' })}
                perPage={100}
                allowEmpty
              >
                <AutocompleteInput optionText="name" size="small" />
              </ReferenceInput>
            </FieldGridItem>
            <FieldGridItem span={{ xs: 1, sm: 2 }}>
              <TextInput 
                source="mobile" 
                label={translate('resources.system/operators.fields.mobile', { _: 'Mobile' })} 
                validate={validation.validateMobile}
                helperText={translate('resources.system/operators.helpers.mobile', { _: 'China mobile phone number' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        {canManagePermissions && (
          <FormSection 
            title={translate('resources.system/operators.sections.permissions.title', { _: 'Permission Settings' })} 
            description={translate('resources.system/operators.sections.permissions.description', { _: 'Account permissions and status configuration' })}
          >
            <FieldGrid columns={{ xs: 1, sm: 2 }}>
              <FieldGridItem>
                <SelectInput
                  source="level"
                  label={translate('resources.system/operators.fields.level', { _: 'Permission Level' })}
                  validate={validation.validateLevel}
                  disabled={isEditingSelf}
                  choices={[
                    { id: 'super', name: translate('resources.system/operators.levels.super', { _: 'Super Admin' }) },
                    { id: 'admin', name: translate('resources.system/operators.levels.admin', { _: 'Admin' }) },
                    { id: 'operator', name: translate('resources.system/operators.levels.operator', { _: 'Operator' }) },
                  ]}
                  helperText={isEditingSelf ? translate('resources.system/operators.helpers.cannot_change_own_level', { _: 'Cannot change your own permission level' }) : translate('resources.system/operators.helpers.level', { _: 'Select permission level for the operator' })}
                  fullWidth
                  size="small"
                />
              </FieldGridItem>
              <FieldGridItem>
                <SelectInput
                  source="status"
                  label={translate('resources.system/operators.fields.status', { _: 'Status' })}
                  validate={validation.validateStatus}
                  disabled={isEditingSelf}
                  choices={[
                    { id: 'enabled', name: translate('resources.system/operators.status.enabled', { _: 'Enabled' }) },
                    { id: 'disabled', name: translate('resources.system/operators.status.disabled', { _: 'Disabled' }) },
                  ]}
                  helperText={isEditingSelf ? translate('resources.system/operators.helpers.cannot_change_own_status', { _: 'Cannot change your own status' }) : translate('resources.system/operators.helpers.status', { _: 'Disabled accounts cannot log in' })}
                  fullWidth
                  size="small"
                />
              </FieldGridItem>
            </FieldGrid>
          </FormSection>
        )}

        <FormSection 
          title={translate('resources.system/operators.sections.remark.title', { _: 'Remarks' })}
        >
          <FieldGrid columns={{ xs: 1 }}>
            <FieldGridItem>
              <TextInput 
                source="remark" 
                label={translate('resources.system/operators.fields.remark', { _: 'Remark' })} 
                multiline 
                minRows={3} 
                fullWidth
                size="small"
                helperText={translate('resources.system/operators.helpers.remark', { _: 'Optional remarks' })}
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>
      </SimpleForm>
    </Edit>
  );
};

// ============ Create Page ============

export const OperatorCreate = () => {
  const translate = useTranslate();
  const validation = useValidationRules();
  
  return (
    <Create>
      <SimpleForm sx={formLayoutSx}>
        <FormSection 
          title={translate('resources.system/operators.sections.basic.title', { _: 'Account Information' })} 
          description={translate('resources.system/operators.sections.basic.description', { _: 'Login credentials for the operator' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <TextInput 
                source="username" 
                label={translate('resources.system/operators.fields.username', { _: 'Username' })} 
                validate={validation.validateUsername}
                helperText={translate('resources.system/operators.helpers.username', { _: '3-30 characters, letters, numbers and underscores only' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <PasswordInput 
                source="password" 
                label={translate('resources.system/operators.fields.password', { _: 'Password' })} 
                validate={validation.validatePassword}
                helperText={translate('resources.system/operators.helpers.password', { _: '6-50 characters, must contain letters and numbers' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection 
          title={translate('resources.system/operators.sections.personal.title', { _: 'Personal Information' })} 
          description={translate('resources.system/operators.sections.personal.description', { _: 'Contact details and personal profile' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <TextInput 
                source="realname" 
                label={translate('resources.system/operators.fields.realname', { _: 'Real Name' })} 
                validate={validation.validateRealname}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput 
                source="email" 
                label={translate('resources.system/operators.fields.email', { _: 'Email' })} 
                type="email" 
                validate={validation.validateEmail}
                helperText={translate('resources.system/operators.helpers.email', { _: 'For receiving system notifications' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <ReferenceInput
                source="partner_id"
                reference="system/partners"
                label={translate('resources.system/operators.fields.partner', { _: 'Partner' })}
                perPage={100}
                allowEmpty
              >
                <AutocompleteInput optionText="name" size="small" />
              </ReferenceInput>
            </FieldGridItem>
            <FieldGridItem span={{ xs: 1, sm: 2 }}>
              <TextInput 
                source="mobile" 
                label={translate('resources.system/operators.fields.mobile', { _: 'Mobile' })} 
                validate={validation.validateMobile}
                helperText={translate('resources.system/operators.helpers.mobile', { _: 'China mobile phone number' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection 
          title={translate('resources.system/operators.sections.permissions.title', { _: 'Permission Settings' })} 
          description={translate('resources.system/operators.sections.permissions.description', { _: 'Account permissions and status configuration' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <SelectInput
                source="level"
                label={translate('resources.system/operators.fields.level', { _: 'Permission Level' })}
                validate={validation.validateLevel}
                defaultValue="operator"
                choices={[
                  { id: 'super', name: translate('resources.system/operators.levels.super', { _: 'Super Admin' }) },
                  { id: 'admin', name: translate('resources.system/operators.levels.admin', { _: 'Admin' }) },
                  { id: 'operator', name: translate('resources.system/operators.levels.operator', { _: 'Operator' }) },
                ]}
                helperText={translate('resources.system/operators.helpers.level', { _: 'Select permission level for the operator' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <SelectInput
                source="status"
                label={translate('resources.system/operators.fields.status', { _: 'Status' })}
                validate={validation.validateStatus}
                defaultValue="enabled"
                choices={[
                  { id: 'enabled', name: translate('resources.system/operators.status.enabled', { _: 'Enabled' }) },
                  { id: 'disabled', name: translate('resources.system/operators.status.disabled', { _: 'Disabled' }) },
                ]}
                helperText={translate('resources.system/operators.helpers.status', { _: 'Disabled accounts cannot log in' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection 
          title={translate('resources.system/operators.sections.remark.title', { _: 'Remarks' })}
        >
          <FieldGrid columns={{ xs: 1 }}>
            <FieldGridItem>
              <TextInput 
                source="remark" 
                label={translate('resources.system/operators.fields.remark', { _: 'Remark' })} 
                multiline 
                minRows={3} 
                fullWidth
                size="small"
                helperText={translate('resources.system/operators.helpers.remark', { _: 'Optional remarks' })}
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>
      </SimpleForm>
    </Create>
  );
};

// ============ Detail Page Header Card ============

const OperatorHeaderCard = () => {
  const record = useRecordContext<Operator>();
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
              ? `linear-gradient(135deg, ${alpha(theme.palette.primary.dark, 0.4)} 0%, ${alpha(theme.palette.info.dark, 0.3)} 100%)`
              : `linear-gradient(135deg, ${alpha(theme.palette.grey[800], 0.5)} 0%, ${alpha(theme.palette.grey[700], 0.3)} 100%)`
            : isEnabled
            ? `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.info.main, 0.08)} 100%)`
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
          {/* Left side: Operator info */}
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
              {record.username?.charAt(0).toUpperCase() || 'O'}
            </Avatar>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  {record.username || <EmptyValue message="Unknown User" />}
                </Typography>
                <StatusIndicator isEnabled={isEnabled} />
                <LevelChip level={record.level} />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {record.realname && (
                  <Typography variant="body2" color="text.secondary">
                    {record.realname}
                  </Typography>
                )}
                {record.partner_id && (
                  <ReferenceField source="partner_id" reference="system/partners" link="show">
                    <TextField source="name" />
                  </ReferenceField>
                )}
              </Box>
              {record.username && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    ID: {record.id}
                  </Typography>
                  <Tooltip title="Copy Username">
                    <IconButton
                      size="small"
                      onClick={() => handleCopy(record.username!, 'Username')}
                      sx={{ p: 0.5 }}
                    >
                      <CopyIcon sx={{ fontSize: '0.75rem' }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
            </Box>
          </Box>

          {/* Right side: Action buttons */}
          <Box className="no-print" sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Print Details">
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
            <Tooltip title="Refresh Data">
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
              <EmailIcon sx={{ fontSize: '1.1rem', color: 'info.main' }} />
              <Typography variant="caption" color="text.secondary">
                {translate('resources.system/operators.fields.email', { _: 'Email' })}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-all' }}>
              {record.email || '-'}
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
              <PhoneIcon sx={{ fontSize: '1.1rem', color: 'success.main' }} />
              <Typography variant="caption" color="text.secondary">
                {translate('resources.system/operators.fields.mobile', { _: 'Mobile' })}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {record.mobile || '-'}
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
              <SecurityIcon sx={{ fontSize: '1.1rem', color: 'warning.main' }} />
              <Typography variant="caption" color="text.secondary">
                {translate('resources.system/operators.fields.level', { _: 'Permission Level' })}
              </Typography>
            </Box>
            <LevelChip level={record.level} />
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
              <TimeIcon sx={{ fontSize: '1.1rem', color: 'primary.main' }} />
              <Typography variant="caption" color="text.secondary">
                {translate('resources.system/operators.fields.last_login', { _: 'Last Login' })}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {formatTimestamp(record.last_login)}
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

// ============ Operator Details Content ============

const OperatorDetails = () => {
  const record = useRecordContext<Operator>();
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
          <OperatorHeaderCard />

          {/* Time information */}
          <DetailSectionCard
            title={translate('resources.system/operators.sections.other.title', { _: 'Time Information' })}
            description={translate('resources.system/operators.sections.other.description', { _: 'Creation and update timestamps' })}
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
                label={translate('resources.system/operators.fields.created_at', { _: 'Created At' })}
                value={formatTimestamp(record.created_at)}
              />
              <DetailItem
                label={translate('resources.system/operators.fields.updated_at', { _: 'Updated At' })}
                value={formatTimestamp(record.updated_at)}
              />
            </Box>
          </DetailSectionCard>

          {/* Remarks information */}
          <DetailSectionCard
            title={translate('resources.system/operators.sections.remark.title', { _: 'Remarks' })}
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
                {record.remark || translate('resources.system/operators.empty.no_remark', { _: 'No remarks' })}
              </Typography>
            </Box>
          </DetailSectionCard>
        </Stack>
      </Box>
    </>
  );
};

// Operator Details
export const OperatorShow = () => {
  return (
    <Show>
      <OperatorDetails />
    </Show>
  );
};
