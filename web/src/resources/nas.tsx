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
import type { Theme } from '@mui/material/styles';
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

// ============ Type定义 ============

interface NASDevice extends RaRecord {
  name?: string;
  identifier?: string;
  ipaddr?: string;
  hostname?: string;
  secret?: string;
  vendor_code?: string;
  model?: string;
  coa_port?: number;
  status?: 'enabled' | 'disabled';
  node_id?: string;
  tags?: string;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

// ============ 常量定义 ============

// Vendor code选项
const VENDOR_CHOICES = [
  { id: '9', name: 'Cisco' },
  { id: '2011', name: 'Huawei' },
  { id: '14988', name: 'Mikrotik' },
  { id: '25506', name: 'H3C' },
  { id: '3902', name: 'ZTE' },
  { id: '10055', name: 'Ikuai' },
  { id: '0', name: 'Standard' },
];

// Status选项
const STATUS_CHOICES = [
  { id: 'enabled', name: 'Enabled' },
  { id: 'disabled', name: 'Disabled' },
];

// 获取VendorName
const getVendorName = (code?: string): string => {
  if (!code) return '-';
  const vendor = VENDOR_CHOICES.find(v => v.id === String(code));
  return vendor ? vendor.name : code;
};

// ============ 工具函数 ============

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

// ============ List loading placeholder ============

const NASListSkeleton = ({ rows = 10 }: { rows?: number }) => (
  <Box sx={{ width: '100%' }}>
    {/* Search loading placeholder */}
    <Card
      elevation={0}
      sx={{
        mb: 2,
        borderRadius: 0.5,
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

    {/* 表格骨架屏 */}
    <Card
      elevation={0}
      sx={{
        borderRadius: 0.5,
        border: theme => `1px solid ${theme.palette.divider}`,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
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

      {/* Table row */}
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

      {/* 分页骨架屏 */}
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

// ============ Empty-state component ============

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
        {translate('resources.network/nas.empty.title', { _: 'No NAS devices' })}
      </Typography>
      <Typography variant="body2" sx={{ opacity: 0.5 }}>
        {translate('resources.network/nas.empty.description', { _: 'Click"Create"buttonAdd the first NAS Device' })}
      </Typography>
    </Box>
  );
};

// ============ Search header section ============

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
    { key: 'name', label: translate('resources.network/nas.fields.name', { _: 'Device name' }) },
    { key: 'ipaddr', label: translate('resources.network/nas.fields.ipaddr', { _: 'IPAddress' }) },
    { key: 'identifier', label: translate('resources.network/nas.fields.identifier', { _: 'Identifier' }) },
  ];

  return (
    <Card
      elevation={0}
      sx={{
        mb: 2,
        borderRadius: 0.5,
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
          {translate('resources.network/nas.filter.title', { _: 'Filters' })}
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
                  borderRadius: 0.5,
                },
              }}
            />
          ))}

          {/* Action buttons */}
          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
            <Tooltip title={translate('ra.action.clear_filters', { _: 'Clear filters' })}>
              <IconButton
                onClick={handleClear}
                size="small"
                sx={{
                  bgcolor: (theme: Theme) => alpha(theme.palette.grey[500], 0.1),
                  '&:hover': {
                    bgcolor: (theme: Theme) => alpha(theme.palette.grey[500], 0.2),
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

// ============ Status组件 ============

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

// ============ 增强版字段组件 ============

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

const VendorField = () => {
  const record = useRecordContext<NASDevice>();
  if (!record) return null;
  
  const vendorName = getVendorName(record.vendor_code);
  return (
    <Chip
      label={vendorName}
      size="small"
      color="info"
      variant="outlined"
      sx={{ height: 22, fontSize: '0.75rem' }}
    />
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

// Tags显示组件
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

// ============ 表单工具栏 ============

const NASFormToolbar = (props: ToolbarProps) => (
  <Toolbar {...props}>
    <SaveButton />
    <DeleteButton mutationMode="pessimistic" />
  </Toolbar>
);

// ============ List action toolbar ============

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

// ============ List content ============

const NASListContent = () => {
  const translate = useTranslate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { data, isLoading, total } = useListContext<NASDevice>();

  const fieldLabels = useMemo(
    () => ({
      name: translate('resources.network/nas.fields.name', { _: 'Device name' }),
      ipaddr: translate('resources.network/nas.fields.ipaddr', { _: 'IPAddress' }),
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
            borderRadius: 0.5,
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
      {/* Search区块 */}
      <NASSearchHeaderCard />

      {/* 活动筛选Tags */}
      <ActiveFilters fieldLabels={fieldLabels} valueLabels={{ status: statusLabels }} />

      {/* Table container */}
      <Card
        elevation={0}
        sx={{
          borderRadius: 0.5,
          border: theme => `1px solid ${theme.palette.divider}`,
          overflow: 'hidden',
        }}
      >
        {/* 表格Statistics */}
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
            Total <strong>{total?.toLocaleString() || 0}</strong> NAS devices
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
                      : alpha(theme.palette.primary.main, 0.04),
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
              label={translate('resources.network/nas.fields.name', { _: 'Device name' })}
              render={() => <NASNameField />}
            />
            <FunctionField
              source="ipaddr"
              label={translate('resources.network/nas.fields.ipaddr', { _: 'IPAddress' })}
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
            <ReferenceField source="node_id" reference="network/nodes" label={translate('resources.network/nas.fields.node_id', { _: 'Associated node' })} link="show">
              <TextField source="name" />
            </ReferenceField>
            <DateField
              source="created_at"
              label={translate('resources.network/nas.fields.created_at', { _: 'Created at' })}
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

// ============ Edit页面 ============

export const NASEdit = () => {
  const translate = useTranslate();
  
  return (
    <Edit>
      <SimpleForm toolbar={<NASFormToolbar />} sx={formLayoutSx}>
        <FormSection
          title={translate('resources.network/nas.sections.basic.title', { _: 'Basic information' })}
          description={translate('resources.network/nas.sections.basic.description', { _: 'Basic NAS device settings' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2, md: 3 }}>
            <FieldGridItem>
              <TextInput
                source="id"
                disabled
                label={translate('resources.network/nas.fields.id', { _: 'DeviceID' })}
                helperText={translate('resources.network/nas.helpers.id', { _: 'Unique ID generated automatically' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="name"
                label={translate('resources.network/nas.fields.name', { _: 'Device name' })}
                validate={[required(), minLength(1), maxLength(100)]}
                helperText={translate('resources.network/nas.helpers.name', { _: 'Device name, 1–100 characters' })}
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
              <SelectInput
                source="vendor_code"
                label={translate('resources.network/nas.fields.vendor_code', { _: 'Vendor code' })}
                validate={[required()]}
                choices={VENDOR_CHOICES}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="model"
                label={translate('resources.network/nas.fields.model', { _: 'Device model' })}
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
          title={translate('resources.network/nas.sections.network.title', { _: 'Network configuration' })}
          description={translate('resources.network/nas.sections.network.description', { _: 'IP address and hostname settings' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2, md: 3 }}>
            <FieldGridItem>
              <TextInput
                source="ipaddr"
                label={translate('resources.network/nas.fields.ipaddr', { _: 'IPAddress' })}
                validate={[required()]}
                helperText={translate('resources.network/nas.helpers.ipaddr', { _: 'NAS device IP address' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="hostname"
                label={translate('resources.network/nas.fields.hostname', { _: 'Hostname' })}
                validate={[maxLength(200)]}
                helperText={translate('resources.network/nas.helpers.hostname', { _: 'NAS device hostname' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <NumberInput
                source="coa_port"
                label={translate('resources.network/nas.fields.coa_port', { _: 'CoA port' })}
                validate={[number(), minValue(1), maxValue(65535)]}
                helperText={translate('resources.network/nas.helpers.coa_port', { _: 'CoA/DM port number (1-65535)' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.network/nas.sections.radius.title', { _: 'RADIUS configuration' })}
          description={translate('resources.network/nas.sections.radius.description', { _: 'RADIUS authentication settings' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <PasswordInput
                source="secret"
                  label={translate('resources.network/nas.fields.secret', { _: 'Shared secret' })}
                validate={[required(), minLength(6)]}
                helperText={translate('resources.network/nas.helpers.secret', { _: 'RADIUS shared secret，at least 6 characters' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <ReferenceInput source="node_id" reference="network/nodes" label={translate('resources.network/nas.fields.node_id', { _: 'Associated node' })}>
                <SelectInput optionText="name" fullWidth size="small" />
              </ReferenceInput>
            </FieldGridItem>
            <FieldGridItem span={{ xs: 1, sm: 2 }}>
              <TextInput
                source="tags"
                label={translate('resources.network/nas.fields.tags', { _: 'Tags' })}
                validate={[maxLength(200)]}
                helperText={translate('resources.network/nas.helpers.tags', { _: 'MultipleTagsseparated by commas' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.network/nas.sections.remark.title', { _: 'Notes' })}
          description={translate('resources.network/nas.sections.remark.description', { _: 'Additional details and notes' })}
        >
          <FieldGrid columns={{ xs: 1 }}>
            <FieldGridItem>
              <TextInput
                source="remark"
                label={translate('resources.network/nas.fields.remark', { _: 'Notes' })}
                validate={[maxLength(500)]}
                multiline
                minRows={3}
                fullWidth
                size="small"
                helperText={translate('resources.network/nas.helpers.remark', { _: 'Optional notes' })}
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>
      </SimpleForm>
    </Edit>
  );
};

// ============ Create页面 ============

export const NASCreate = () => {
  const translate = useTranslate();
  
  return (
    <Create>
      <SimpleForm sx={formLayoutSx}>
        <FormSection
          title={translate('resources.network/nas.sections.basic.title', { _: 'Basic information' })}
          description={translate('resources.network/nas.sections.basic.description', { _: 'Basic NAS device settings' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2, md: 3 }}>
            <FieldGridItem>
              <TextInput
                source="name"
                label={translate('resources.network/nas.fields.name', { _: 'Device name' })}
                validate={[required(), minLength(1), maxLength(100)]}
                helperText={translate('resources.network/nas.helpers.name', { _: 'Device name, 1–100 characters' })}
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
              <SelectInput
                source="vendor_code"
                label={translate('resources.network/nas.fields.vendor_code', { _: 'Vendor code' })}
                validate={[required()]}
                choices={VENDOR_CHOICES}
                defaultValue="0"
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="model"
                label={translate('resources.network/nas.fields.model', { _: 'Device model' })}
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
          title={translate('resources.network/nas.sections.network.title', { _: 'Network configuration' })}
          description={translate('resources.network/nas.sections.network.description', { _: 'IP address and hostname settings' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2, md: 3 }}>
            <FieldGridItem>
              <TextInput
                source="ipaddr"
                label={translate('resources.network/nas.fields.ipaddr', { _: 'IPAddress' })}
                validate={[required()]}
                helperText={translate('resources.network/nas.helpers.ipaddr', { _: 'NAS device IP address' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="hostname"
                label={translate('resources.network/nas.fields.hostname', { _: 'Hostname' })}
                validate={[maxLength(200)]}
                helperText={translate('resources.network/nas.helpers.hostname', { _: 'NAS device hostname' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <NumberInput
                source="coa_port"
                label={translate('resources.network/nas.fields.coa_port', { _: 'CoA port' })}
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
          title={translate('resources.network/nas.sections.radius.title', { _: 'RADIUS configuration' })}
          description={translate('resources.network/nas.sections.radius.description', { _: 'RADIUS authentication settings' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <PasswordInput
                source="secret"
                  label={translate('resources.network/nas.fields.secret', { _: 'Shared secret' })}
                validate={[required(), minLength(6)]}
                helperText={translate('resources.network/nas.helpers.secret', { _: 'RADIUS shared secret，at least 6 characters' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <ReferenceInput source="node_id" reference="network/nodes" label={translate('resources.network/nas.fields.node_id', { _: 'Associated node' })}>
                <SelectInput optionText="name" fullWidth size="small" />
              </ReferenceInput>
            </FieldGridItem>
            <FieldGridItem span={{ xs: 1, sm: 2 }}>
              <TextInput
                source="tags"
                label={translate('resources.network/nas.fields.tags', { _: 'Tags' })}
                validate={[maxLength(200)]}
                helperText={translate('resources.network/nas.helpers.tags', { _: 'MultipleTagsseparated by commas' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.network/nas.sections.remark.title', { _: 'Notes' })}
          description={translate('resources.network/nas.sections.remark.description', { _: 'Additional details and notes' })}
        >
          <FieldGrid columns={{ xs: 1 }}>
            <FieldGridItem>
              <TextInput
                source="remark"
                label={translate('resources.network/nas.fields.remark', { _: 'Notes' })}
                validate={[maxLength(500)]}
                multiline
                minRows={3}
                fullWidth
                size="small"
                helperText={translate('resources.network/nas.helpers.remark', { _: 'Optional notes' })}
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>
      </SimpleForm>
    </Create>
  );
};

// ============ 详情页Overview card ============

const NASHeaderCard = () => {
  const record = useRecordContext<NASDevice>();
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefresh();

  const handleCopy = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    notify(`${label} Copied to clipboard`, { type: 'info' });
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
        borderRadius: 0.5,
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
          {/* Left side：Device信息 */}
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
                  {record.name || <EmptyValue message="Unknown device" />}
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
                  <Tooltip title="CopyIPAddress">
                    <IconButton
                      size="small"
                      onClick={() => handleCopy(record.ipaddr!, 'IPAddress')}
                      sx={{ p: 0.5 }}
                    >
                      <CopyIcon sx={{ fontSize: '0.75rem' }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
            </Box>
          </Box>

          {/* Right side：Action buttons */}
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
                bgcolor: (theme: Theme) => alpha(theme.palette.grey[500], 0.1),
                '&:hover': {
                  bgcolor: (theme: Theme) => alpha(theme.palette.grey[500], 0.2),
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
              borderRadius: 0.5,
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
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {getVendorName(record.vendor_code)}
            </Typography>
          </Box>

          <Box
            sx={{
              p: 2,
              borderRadius: 0.5,
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
              borderRadius: 0.5,
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
              borderRadius: 0.5,
              bgcolor: theme => alpha(theme.palette.background.paper, 0.8),
              backdropFilter: 'blur(8px)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <NetworkIcon sx={{ fontSize: '1.1rem', color: 'primary.main' }} />
              <Typography variant="caption" color="text.secondary">
                {translate('resources.network/nas.fields.coa_port', { _: 'CoA port' })}
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

// 打印样式
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

// ============ NAS Details ============

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
          {/* Overview card */}
          <NASHeaderCard />

          {/* Network configuration */}
          <DetailSectionCard
            title={translate('resources.network/nas.sections.network.title', { _: 'Network configuration' })}
            description={translate('resources.network/nas.sections.network.description', { _: 'HostnameSettings' })}
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
            </Box>
          </DetailSectionCard>

          {/* RADIUS Settings */}
          <DetailSectionCard
            title={translate('resources.network/nas.sections.radius.title', { _: 'RADIUS configuration' })}
            description={translate('resources.network/nas.sections.radius.description', { _: 'RADIUS authentication settings' })}
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
                label={translate('resources.network/nas.fields.node_id', { _: 'Associated node' })}
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

          {/* Timestamps */}
          <DetailSectionCard
            title={translate('resources.network/nas.sections.timestamps.title', { _: 'Timestamps' })}
            description={translate('resources.network/nas.sections.timestamps.description', { _: 'Created and updated timestamps' })}
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
                label={translate('resources.network/nas.fields.created_at', { _: 'Created at' })}
                value={formatTimestamp(record.created_at)}
              />
              <DetailItem
                label={translate('resources.network/nas.fields.updated_at', { _: 'Updated at' })}
                value={formatTimestamp(record.updated_at)}
              />
            </Box>
          </DetailSectionCard>

          {/* Notes */}
          <DetailSectionCard
            title={translate('resources.network/nas.sections.remark.title', { _: 'Notes' })}
            description={translate('resources.network/nas.sections.remark.description', { _: 'Additional details and notes' })}
            icon={<NoteIcon />}
            color="primary"
          >
            <Box
              sx={{
                p: 2,
                borderRadius: 0.5,
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
                {record.remark || translate('resources.network/nas.helpers.no_remark', { _: 'No notes' })}
              </Typography>
            </Box>
          </DetailSectionCard>
        </Stack>
      </Box>
    </>
  );
};

// NAS Device详情
export const NASShow = () => {
  return (
    <Show>
      <NASDetails />
    </Show>
  );
};
