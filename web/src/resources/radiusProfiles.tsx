import {
  List,
  Datagrid,
  TextField,
  DateField,
  Edit,
  TextInput,
  Create,
  Show,
  BooleanInput,
  NumberInput,
  required,
  minLength,
  maxLength,
  useRecordContext,
  Toolbar,
  SaveButton,
  DeleteButton,
  SimpleForm,
  ToolbarProps,
  TopToolbar,
  ListButton,
  ExportButton,
  SortButton,
  useTranslate,
  useRefresh,
  useNotify,
  useListContext,
  RaRecord,
  FunctionField
} from 'react-admin';
import { CreateButton } from 'react-admin';
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
  alpha
} from '@mui/material';
import { useMemo, useCallback, useState, useEffect } from 'react';
import {
  Settings as ProfileIcon,
  Speed as SpeedIcon,
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
  Wifi as NetworkIcon,
  Link as BindingIcon
} from '@mui/icons-material';
import {
  ServerPagination,
  ActiveFilters,
  FormSection,
  FieldGrid,
  FieldGridItem,
  formLayoutSx,
  controlWrapperSx,
  DetailItem,
  DetailSectionCard,
  EmptyValue
} from '../components';

const LARGE_LIST_PER_PAGE = 50;

// ============ Type Definitions ============

interface RadiusProfile extends RaRecord {
  name?: string;
  status?: 'enabled' | 'disabled';
  active_num?: number;
  up_rate?: number;
  down_rate?: number;
  addr_pool?: string;
  ipv6_prefix?: string;
  domain?: string;
  bind_mac?: boolean;
  bind_vlan?: boolean;
  remark?: string;
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

const formatRate = (rate?: number): string => {
  if (!rate || rate === 0) return '-';
  if (rate >= 1024) {
    return `${(rate / 1024).toFixed(1)} Mbps`;
  }
  return `${rate} Kbps`;
};

// ============ List Loading Skeleton ============

const ProfileListSkeleton = ({ rows = 10 }: { rows?: number }) => (
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

const ProfileEmptyState = () => {
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
      <ProfileIcon sx={{ fontSize: 64, opacity: 0.3, mb: 2 }} />
      <Typography variant="h6" sx={{ opacity: 0.6, mb: 1 }}>
        {translate('resources.radius/profiles.empty.title', { _: 'No Profiles' })}
      </Typography>
      <Typography variant="body2" sx={{ opacity: 0.5 }}>
        {translate('resources.radius/profiles.empty.description', { _: 'Click "Create" button to add your first billing profile' })}
      </Typography>
    </Box>
  );
};

// ============ Search Header Card Component ============

const ProfileSearchHeaderCard = () => {
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
    { key: 'name', label: translate('resources.radius/profiles.fields.name', { _: 'Profile Name' }) },
    { key: 'addr_pool', label: translate('resources.radius/profiles.fields.addr_pool', { _: 'Address Pool' }) },
    { key: 'domain', label: translate('resources.radius/profiles.fields.domain', { _: 'Domain' }) },
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
          {translate('resources.radius/profiles.filter.title', { _: 'Filter Conditions' })}
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

// ============ Status Components ============

const StatusIndicator = ({ isEnabled }: { isEnabled: boolean }) => {
  const translate = useTranslate();
  return (
    <Chip
      icon={isEnabled ? <EnabledIcon sx={{ fontSize: '0.85rem !important' }} /> : <DisabledIcon sx={{ fontSize: '0.85rem !important' }} />}
      label={isEnabled ? translate('resources.radius/profiles.status.enabled', { _: 'Enabled' }) : translate('resources.radius/profiles.status.disabled', { _: 'Disabled' })}
      size="small"
      color={isEnabled ? 'success' : 'default'}
      variant={isEnabled ? 'filled' : 'outlined'}
      sx={{ height: 22, fontWeight: 500, fontSize: '0.75rem' }}
    />
  );
};

const BooleanChip = ({ value, trueLabel, falseLabel }: { value?: boolean; trueLabel?: string; falseLabel?: string }) => {
  const translate = useTranslate();
  return (
    <Chip
      label={value ? (trueLabel || translate('common.yes', { _: 'Yes' })) : (falseLabel || translate('common.no', { _: 'No' }))}
      size="small"
      color={value ? 'success' : 'default'}
      variant="outlined"
      sx={{ height: 22, fontWeight: 500, fontSize: '0.75rem' }}
    />
  );
};

// ============ Enhanced Field Components ============

const ProfileNameField = () => {
  const record = useRecordContext<RadiusProfile>();
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
        {record.name?.charAt(0).toUpperCase() || 'P'}
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

const RateField = ({ source }: { source: 'up_rate' | 'down_rate' }) => {
  const record = useRecordContext<RadiusProfile>();
  if (!record) return null;
  
  const rate = record[source];
  return (
    <Chip
      label={formatRate(rate)}
      size="small"
      color="info"
      variant="outlined"
      sx={{ fontFamily: 'monospace', fontSize: '0.8rem', height: 24 }}
    />
  );
};

// ============ Form Toolbar ============

const ProfileFormToolbar = (props: ToolbarProps) => (
  <Toolbar {...props}>
    <SaveButton />
    <DeleteButton mutationMode="pessimistic" />
  </Toolbar>
);

// ============ List Actions Component ============

const ProfileListActions = () => {
  const translate = useTranslate();
  return (
    <TopToolbar>
      <SortButton
        fields={['created_at', 'name', 'up_rate', 'down_rate']}
        label={translate('ra.action.sort', { _: 'Sort' })}
      />
  <CreateButton />
      <ExportButton />
    </TopToolbar>
  );
};

// ============ Internal List Content Component ============

const ProfileListContent = () => {
  const translate = useTranslate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { data, isLoading, total } = useListContext<RadiusProfile>();

  const fieldLabels = useMemo(
    () => ({
      name: translate('resources.radius/profiles.fields.name', { _: 'Profile Name' }),
      addr_pool: translate('resources.radius/profiles.fields.addr_pool', { _: 'Address Pool' }),
      domain: translate('resources.radius/profiles.fields.domain', { _: 'Domain' }),
      status: translate('resources.radius/profiles.fields.status', { _: 'Status' }),
    }),
    [translate],
  );

  const statusLabels = useMemo(
    () => ({
      enabled: translate('resources.radius/profiles.status.enabled', { _: 'Enabled' }),
      disabled: translate('resources.radius/profiles.status.disabled', { _: 'Disabled' }),
    }),
    [translate],
  );

  if (isLoading) {
    return <ProfileListSkeleton />;
  }

  if (!data || data.length === 0) {
    return (
      <Box>
        <ProfileSearchHeaderCard />
        <Card
          elevation={0}
          sx={{
            borderRadius: 2,
            border: theme => `1px solid ${theme.palette.divider}`,
          }}
        >
          <ProfileEmptyState />
        </Card>
      </Box>
    );
  }

  return (
    <Box>
      {/* Search section */}
      <ProfileSearchHeaderCard />

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
            Total <strong>{total?.toLocaleString() || 0}</strong> profiles
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
              label={translate('resources.radius/profiles.fields.name', { _: 'Profile Name' })}
              render={() => <ProfileNameField />}
            />
            <TextField
              source="active_num"
              label={translate('resources.radius/profiles.fields.active_num', { _: 'Concurrent' })}
            />
            <FunctionField
              source="up_rate"
              label={translate('resources.radius/profiles.fields.up_rate', { _: 'Upload Rate' })}
              render={() => <RateField source="up_rate" />}
            />
            <FunctionField
              source="down_rate"
              label={translate('resources.radius/profiles.fields.down_rate', { _: 'Download Rate' })}
              render={() => <RateField source="down_rate" />}
            />
            <TextField
              source="addr_pool"
              label={translate('resources.radius/profiles.fields.addr_pool', { _: 'Address Pool' })}
            />
            <TextField
              source="domain"
              label={translate('resources.radius/profiles.fields.domain', { _: 'Domain' })}
            />
            <DateField
              source="created_at"
              label={translate('resources.radius/profiles.fields.created_at', { _: 'Created At' })}
              showTime
            />
          </Datagrid>
        </Box>
      </Card>
    </Box>
  );
};

// RADIUS Billing Profile List
export const RadiusProfileList = () => {
  return (
    <List
      actions={<ProfileListActions />}
      sort={{ field: 'created_at', order: 'DESC' }}
      perPage={LARGE_LIST_PER_PAGE}
      pagination={<ServerPagination />}
      empty={false}
    >
      <ProfileListContent />
    </List>
  );
};

// ============ Edit Page ============

export const RadiusProfileEdit = () => {
  const translate = useTranslate();
  
  return (
    <Edit>
      <SimpleForm toolbar={<ProfileFormToolbar />} sx={formLayoutSx}>
        <FormSection
          title={translate('resources.radius/profiles.sections.basic.title', { _: 'Basic Information' })}
          description={translate('resources.radius/profiles.sections.basic.description', { _: 'Basic profile configuration' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <TextInput
                source="id"
                disabled
                label={translate('resources.radius/profiles.fields.id', { _: 'Profile ID' })}
                helperText={translate('resources.radius/profiles.helpers.id', { _: 'System generated unique identifier' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="name"
                label={translate('resources.radius/profiles.fields.name', { _: 'Profile Name' })}
                validate={[required(), minLength(2), maxLength(50)]}
                helperText={translate('resources.radius/profiles.helpers.name', { _: '2-50 character profile name' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem span={{ xs: 1, sm: 2 }}>
              <Box sx={controlWrapperSx}>
                <BooleanInput
                  source="status"
                  label={translate('resources.radius/profiles.fields.status_enabled', { _: 'Enabled Status' })}
                  helperText={translate('resources.radius/profiles.helpers.status', { _: 'Enable or disable this billing profile' })}
                />
              </Box>
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.radius/profiles.sections.rate_control.title', { _: 'Rate Control' })}
          description={translate('resources.radius/profiles.sections.rate_control.description', { _: 'Concurrent sessions and bandwidth limits' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2, md: 3 }}>
            <FieldGridItem>
              <NumberInput
                source="active_num"
                label={translate('resources.radius/profiles.fields.active_num', { _: 'Concurrent Sessions' })}
                min={0}
                helperText={translate('resources.radius/profiles.helpers.active_num', { _: 'Max concurrent online sessions allowed' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <NumberInput
                source="up_rate"
                label={translate('resources.radius/profiles.fields.up_rate', { _: 'Upload Rate (Kbps)' })}
                min={0}
                helperText={translate('resources.radius/profiles.helpers.up_rate', { _: 'Upload bandwidth limit in Kbps' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <NumberInput
                source="down_rate"
                label={translate('resources.radius/profiles.fields.down_rate', { _: 'Download Rate (Kbps)' })}
                min={0}
                helperText={translate('resources.radius/profiles.helpers.down_rate', { _: 'Download bandwidth limit in Kbps' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.radius/profiles.sections.network.title', { _: 'Network Configuration' })}
          description={translate('resources.radius/profiles.sections.network.description', { _: 'IP address pool and domain settings' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <TextInput
                source="addr_pool"
                label={translate('resources.radius/profiles.fields.addr_pool', { _: 'Address Pool' })}
                helperText={translate('resources.radius/profiles.helpers.addr_pool', { _: 'RADIUS address pool name' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="ipv6_prefix"
                label={translate('resources.radius/profiles.fields.ipv6_prefix', { _: 'IPv6 Prefix' })}
                helperText={translate('resources.radius/profiles.helpers.ipv6_prefix', { _: 'IPv6 prefix delegation' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem span={{ xs: 1, sm: 2 }}>
              <TextInput
                source="domain"
                label={translate('resources.radius/profiles.fields.domain', { _: 'Domain' })}
                helperText={translate('resources.radius/profiles.helpers.domain', { _: 'User authentication domain' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.radius/profiles.sections.binding.title', { _: 'Binding Policy' })}
          description={translate('resources.radius/profiles.sections.binding.description', { _: 'MAC and VLAN binding settings' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <Box sx={controlWrapperSx}>
                <BooleanInput
                  source="bind_mac"
                  label={translate('resources.radius/profiles.fields.bind_mac', { _: 'Bind MAC Address' })}
                  helperText={translate('resources.radius/profiles.helpers.bind_mac', { _: 'Bind user to MAC address' })}
                />
              </Box>
            </FieldGridItem>
            <FieldGridItem>
              <Box sx={controlWrapperSx}>
                <BooleanInput
                  source="bind_vlan"
                  label={translate('resources.radius/profiles.fields.bind_vlan', { _: 'Bind VLAN' })}
                  helperText={translate('resources.radius/profiles.helpers.bind_vlan', { _: 'Bind user to VLAN' })}
                />
              </Box>
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.radius/profiles.sections.remark.title', { _: 'Remarks' })}
          description={translate('resources.radius/profiles.sections.remark.description', { _: 'Additional notes and comments' })}
        >
          <FieldGrid columns={{ xs: 1 }}>
            <FieldGridItem>
              <TextInput
                source="remark"
                label={translate('resources.radius/profiles.fields.remark', { _: 'Remark' })}
                multiline
                minRows={3}
                fullWidth
                size="small"
                helperText={translate('resources.radius/profiles.helpers.remark', { _: 'Optional remarks' })}
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>
      </SimpleForm>
    </Edit>
  );
};

// ============ Create Page ============

export const RadiusProfileCreate = () => {
  const translate = useTranslate();
  
  return (
    <Create>
      <SimpleForm sx={formLayoutSx}>
        <FormSection
          title={translate('resources.radius/profiles.sections.basic.title', { _: 'Basic Information' })}
          description={translate('resources.radius/profiles.sections.basic.description', { _: 'Basic profile configuration' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <TextInput
                source="name"
                label={translate('resources.radius/profiles.fields.name', { _: 'Profile Name' })}
                validate={[required(), minLength(2), maxLength(50)]}
                helperText={translate('resources.radius/profiles.helpers.name', { _: '2-50 character profile name' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <Box sx={controlWrapperSx}>
                <BooleanInput
                  source="status"
                  label={translate('resources.radius/profiles.fields.status_enabled', { _: 'Enabled Status' })}
                  defaultValue={true}
                  helperText={translate('resources.radius/profiles.helpers.status', { _: 'Enable or disable this billing profile' })}
                />
              </Box>
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.radius/profiles.sections.rate_control.title', { _: 'Rate Control' })}
          description={translate('resources.radius/profiles.sections.rate_control.description', { _: 'Concurrent sessions and bandwidth limits' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2, md: 3 }}>
            <FieldGridItem>
              <NumberInput
                source="active_num"
                label={translate('resources.radius/profiles.fields.active_num', { _: 'Concurrent Sessions' })}
                min={0}
                defaultValue={1}
                helperText={translate('resources.radius/profiles.helpers.active_num', { _: 'Max concurrent online sessions allowed' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <NumberInput
                source="up_rate"
                label={translate('resources.radius/profiles.fields.up_rate', { _: 'Upload Rate (Kbps)' })}
                min={0}
                defaultValue={1024}
                helperText={translate('resources.radius/profiles.helpers.up_rate', { _: 'Upload bandwidth limit in Kbps' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <NumberInput
                source="down_rate"
                label={translate('resources.radius/profiles.fields.down_rate', { _: 'Download Rate (Kbps)' })}
                min={0}
                defaultValue={1024}
                helperText={translate('resources.radius/profiles.helpers.down_rate', { _: 'Download bandwidth limit in Kbps' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.radius/profiles.sections.network.title', { _: 'Network Configuration' })}
          description={translate('resources.radius/profiles.sections.network.description', { _: 'IP address pool and domain settings' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <TextInput
                source="addr_pool"
                label={translate('resources.radius/profiles.fields.addr_pool', { _: 'Address Pool' })}
                helperText={translate('resources.radius/profiles.helpers.addr_pool', { _: 'RADIUS address pool name' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="ipv6_prefix"
                label={translate('resources.radius/profiles.fields.ipv6_prefix', { _: 'IPv6 Prefix' })}
                helperText={translate('resources.radius/profiles.helpers.ipv6_prefix', { _: 'IPv6 prefix delegation' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem span={{ xs: 1, sm: 2 }}>
              <TextInput
                source="domain"
                label={translate('resources.radius/profiles.fields.domain', { _: 'Domain' })}
                helperText={translate('resources.radius/profiles.helpers.domain', { _: 'User authentication domain' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.radius/profiles.sections.binding.title', { _: 'Binding Policy' })}
          description={translate('resources.radius/profiles.sections.binding.description', { _: 'MAC and VLAN binding settings' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <Box sx={controlWrapperSx}>
                <BooleanInput
                  source="bind_mac"
                  label={translate('resources.radius/profiles.fields.bind_mac', { _: 'Bind MAC Address' })}
                  defaultValue={false}
                  helperText={translate('resources.radius/profiles.helpers.bind_mac', { _: 'Bind user to MAC address' })}
                />
              </Box>
            </FieldGridItem>
            <FieldGridItem>
              <Box sx={controlWrapperSx}>
                <BooleanInput
                  source="bind_vlan"
                  label={translate('resources.radius/profiles.fields.bind_vlan', { _: 'Bind VLAN' })}
                  defaultValue={false}
                  helperText={translate('resources.radius/profiles.helpers.bind_vlan', { _: 'Bind user to VLAN' })}
                />
              </Box>
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.radius/profiles.sections.remark.title', { _: 'Remarks' })}
          description={translate('resources.radius/profiles.sections.remark.description', { _: 'Additional notes and comments' })}
        >
          <FieldGrid columns={{ xs: 1 }}>
            <FieldGridItem>
              <TextInput
                source="remark"
                label={translate('resources.radius/profiles.fields.remark', { _: 'Remark' })}
                multiline
                minRows={3}
                fullWidth
                size="small"
                helperText={translate('resources.radius/profiles.helpers.remark', { _: 'Optional remarks' })}
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>
      </SimpleForm>
    </Create>
  );
};

// ============ Detail Page Header Card ============

const ProfileHeaderCard = () => {
  const record = useRecordContext<RadiusProfile>();
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
          {/* Left side: Profile information */}
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
              {record.name?.charAt(0).toUpperCase() || 'P'}
            </Avatar>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  {record.name || <EmptyValue message="Unknown profile" />}
                </Typography>
                <StatusIndicator isEnabled={isEnabled} />
              </Box>
              {record.name && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    ID: {record.id}
                  </Typography>
                  <Tooltip title="Copy profile name">
                    <IconButton
                      size="small"
                      onClick={() => handleCopy(record.name!, 'Profile name')}
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
              <SpeedIcon sx={{ fontSize: '1.1rem', color: 'info.main' }} />
              <Typography variant="caption" color="text.secondary">
                {translate('resources.radius/profiles.fields.active_num', { _: 'Concurrent' })}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {record.active_num || 0}
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
              <SpeedIcon sx={{ fontSize: '1.1rem', color: 'success.main' }} />
              <Typography variant="caption" color="text.secondary">
                {translate('resources.radius/profiles.fields.up_rate', { _: 'Upload Rate' })}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
              {formatRate(record.up_rate)}
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
              <SpeedIcon sx={{ fontSize: '1.1rem', color: 'warning.main' }} />
              <Typography variant="caption" color="text.secondary">
                {translate('resources.radius/profiles.fields.down_rate', { _: 'Download Rate' })}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
              {formatRate(record.down_rate)}
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
                {translate('resources.radius/profiles.fields.addr_pool', { _: 'Address Pool' })}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {record.addr_pool || '-'}
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

// ============ Profile Details Content ============

const ProfileDetails = () => {
  const record = useRecordContext<RadiusProfile>();
  const translate = useTranslate();
  
  if (!record) {
    return null;
  }

  return (
    <>
      <style>{printStyles}</style>
      <Box className="printable-content" sx={{ width: '100%', p: { xs: 2, sm: 3, md: 4 } }}>
        <Stack spacing={3}>
          {/* Header overview card */}
          <ProfileHeaderCard />

          {/* Network configuration */}
          <DetailSectionCard
            title={translate('resources.radius/profiles.sections.network.title', { _: 'Network Configuration' })}
            description={translate('resources.radius/profiles.sections.network.description', { _: 'IPv6 and domain settings' })}
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
                label={translate('resources.radius/profiles.fields.ipv6_prefix', { _: 'IPv6 Prefix' })}
                value={record.ipv6_prefix || <EmptyValue />}
              />
              <DetailItem
                label={translate('resources.radius/profiles.fields.domain', { _: 'Domain' })}
                value={record.domain || <EmptyValue />}
              />
            </Box>
          </DetailSectionCard>

          {/* Binding policy */}
          <DetailSectionCard
            title={translate('resources.radius/profiles.sections.binding.title', { _: 'Binding Policy' })}
            description={translate('resources.radius/profiles.sections.binding.description', { _: 'MAC and VLAN binding settings' })}
            icon={<BindingIcon />}
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
                label={translate('resources.radius/profiles.fields.bind_mac', { _: 'Bind MAC Address' })}
                value={<BooleanChip value={record.bind_mac} />}
              />
              <DetailItem
                label={translate('resources.radius/profiles.fields.bind_vlan', { _: 'Bind VLAN' })}
                value={<BooleanChip value={record.bind_vlan} />}
              />
            </Box>
          </DetailSectionCard>

          {/* Time information */}
          <DetailSectionCard
            title={translate('resources.radius/profiles.sections.timestamps.title', { _: 'Time Information' })}
            description={translate('resources.radius/profiles.sections.timestamps.description', { _: 'Creation and update timestamps' })}
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
                label={translate('resources.radius/profiles.fields.created_at', { _: 'Created At' })}
                value={formatTimestamp(record.created_at)}
              />
              <DetailItem
                label={translate('resources.radius/profiles.fields.updated_at', { _: 'Updated At' })}
                value={formatTimestamp(record.updated_at)}
              />
            </Box>
          </DetailSectionCard>

          {/* Remarks */}
          <DetailSectionCard
            title={translate('resources.radius/profiles.sections.remark.title', { _: 'Remarks' })}
            description={translate('resources.radius/profiles.sections.remark.description', { _: 'Additional notes and comments' })}
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
                {record.remark || translate('resources.radius/profiles.empty.no_remark', { _: 'No remarks' })}
              </Typography>
            </Box>
          </DetailSectionCard>
        </Stack>
      </Box>
    </>
  );
};

// RADIUS Billing Profile Details
export const RadiusProfileShow = () => {
  return (
    <Show>
      <ProfileDetails />
    </Show>
  );
};
