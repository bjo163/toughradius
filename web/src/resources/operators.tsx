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
  CreateButton,
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
  FunctionField
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
  alpha
} from '@mui/material';
import type { Theme } from '@mui/material/styles';
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

// ============ Type定义 ============

interface Operator extends RaRecord {
  username?: string;
  realname?: string;
  email?: string;
  mobile?: string;
  level?: 'super' | 'admin' | 'operator';
  status?: 'enabled' | 'disabled';
  remark?: string;
  last_login?: string;
  created_at?: string;
  updated_at?: string;
}

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

// ============ 验证规则 ============

const useValidationRules = () => {
  const translate = useTranslate();

  return {
    validateUsername: [
      required(translate('resources.system/operators.validation.username_required', { _: 'Usernameis required' })),
      minLength(3, translate('resources.system/operators.validation.username_min', { _: 'Usernameat least 3characters' })),
      maxLength(30, translate('resources.system/operators.validation.username_max', { _: 'Usernameup to30characters' })),
      regex(/^[a-zA-Z0-9_]+$/, translate('resources.system/operators.validation.username_format', { _: 'Username may contain only letters, numbers, and underscores' })),
    ],
    validatePassword: [
      required(translate('resources.system/operators.validation.password_required', { _: 'Passwordis required' })),
      minLength(6, translate('resources.system/operators.validation.password_min', { _: 'Passwordat least 6characters' })),
      maxLength(50, translate('resources.system/operators.validation.password_max', { _: 'Passwordup to50characters' })),
      regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, translate('resources.system/operators.validation.password_format', { _: 'Password must include letters and numbers' })),
    ],
    validatePasswordOptional: [
      minLength(6, translate('resources.system/operators.validation.password_min', { _: 'Passwordat least 6characters' })),
      maxLength(50, translate('resources.system/operators.validation.password_max', { _: 'Passwordup to50characters' })),
      regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, translate('resources.system/operators.validation.password_format', { _: 'Password must include letters and numbers' })),
    ],
    validateEmail: [email(translate('resources.system/operators.validation.email_invalid', { _: 'Invalid email format' }))],
    validateMobile: [
      regex(
        /^(0|\+?86)?(13[0-9]|14[57]|15[0-35-9]|17[0678]|18[0-9])[0-9]{8}$/,
        translate('resources.system/operators.validation.mobile_invalid', { _: 'Invalid mobile number format' })
      ),
    ],
    validateRealname: [required(translate('resources.system/operators.validation.realname_required', { _: 'Full nameis required' }))],
    validateLevel: [required(translate('resources.system/operators.validation.level_required', { _: 'Permission levelis required' }))],
    validateStatus: [required(translate('resources.system/operators.validation.status_required', { _: 'Statusis required' }))],
  };
};

// ============ List loading placeholder ============

const OperatorListSkeleton = ({ rows = 10 }: { rows?: number }) => (
  <Box sx={{ width: '100%' }}>
    {/* Search loading placeholder */}
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

    {/* 表格骨架屏 */}
    <Card
      elevation={0}
      sx={{
        borderRadius: 2,
        border: theme => `1px solid ${theme.palette.divider}`,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
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

      {/* Table row */}
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
        {translate('resources.system/operators.empty.title', { _: 'No Operator' })}
      </Typography>
      <Typography variant="body2" sx={{ opacity: 0.5 }}>
        {translate('resources.system/operators.empty.description', { _: 'Click"Create"buttonAdd the firstOperator' })}
      </Typography>
    </Box>
  );
};

// ============ Search header section ============

const OperatorSearchHeaderCard = () => {
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
    { key: 'username', label: translate('resources.system/operators.fields.username', { _: 'Username' }) },
    { key: 'realname', label: translate('resources.system/operators.fields.realname', { _: 'Full name' }) },
    { key: 'email', label: translate('resources.system/operators.fields.email', { _: 'Email' }) },
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
          {translate('resources.system/operators.filter.title', { _: 'Filters' })}
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

// ============ Status和级别组件 ============

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
    super: { color: 'error', label: translate('resources.system/operators.levels.super', { _: 'Super admin' }) },
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

// ============ 增强版字段组件 ============

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

// ============ List action toolbar ============

const OperatorListActions = () => {
  const translate = useTranslate();
  return (
    <TopToolbar>
      <SortButton
        fields={['created_at', 'username', 'last_login']}
        label={translate('ra.action.sort', { _: 'Sort' })}
      />
      <CreateButton />
      <ExportButton />
    </TopToolbar>
  );
};

// ============ List content ============

const OperatorListContent = () => {
  const translate = useTranslate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { data, isLoading, total } = useListContext<Operator>();

  const fieldLabels = useMemo(
    () => ({
      username: translate('resources.system/operators.fields.username', { _: 'Username' }),
      realname: translate('resources.system/operators.fields.realname', { _: 'Full name' }),
      email: translate('resources.system/operators.fields.email', { _: 'Email' }),
      status: translate('resources.system/operators.fields.status', { _: 'Status' }),
      level: translate('resources.system/operators.fields.level', { _: 'Permission level' }),
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
      super: translate('resources.system/operators.levels.super', { _: 'Super admin' }),
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
      {/* Search区块 */}
      <OperatorSearchHeaderCard />

      {/* 活动筛选Tags */}
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
            Total <strong>{total?.toLocaleString() || 0}</strong> Operator
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
              label={translate('resources.system/operators.fields.realname', { _: 'Full name' })}
            />
            <EmailField
              source="email"
              label={translate('resources.system/operators.fields.email', { _: 'Email' })}
            />
            <TextField
              source="mobile"
              label={translate('resources.system/operators.fields.mobile', { _: 'Mobile number' })}
            />
            <FunctionField
              source="level"
              label={translate('resources.system/operators.fields.level', { _: 'Permission level' })}
              render={() => <LevelField />}
            />
            <DateField
              source="last_login"
              label={translate('resources.system/operators.fields.last_login', { _: 'Last sign-in' })}
              showTime
            />
            <DateField
              source="created_at"
              label={translate('resources.system/operators.fields.created_at', { _: 'Created at' })}
              showTime
            />
          </Datagrid>
        </Box>
      </Card>
    </Box>
  );
};

// Operator列表
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

// ============ PasswordInput field component ============

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
      helperText={translate('resources.system/operators.helpers.password_optional', { _: 'Leave blank to keep the current password' })}
      fullWidth
      size="small"
    />
  );
};

// ============ Edit页面 ============

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
          title={translate('resources.system/operators.sections.basic.title', { _: 'Account information' })}
          description={translate('resources.system/operators.sections.basic.description', { _: 'Operator login account and password' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <TextInput
                source="id"
                label={translate('resources.system/operators.fields.id', { _: 'OperatorID' })}
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
                helperText={translate('resources.system/operators.helpers.username', { _: '3–30 characters; letters, numbers, and underscores only' })}
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
          title={translate('resources.system/operators.sections.personal.title', { _: 'Personal information' })}
          description={translate('resources.system/operators.sections.personal.description', { _: 'Contact details and profile' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <TextInput
                source="realname"
                label={translate('resources.system/operators.fields.realname', { _: 'Full name' })}
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
                helperText={translate('resources.system/operators.helpers.email', { _: 'Use this page toreceive system notifications' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem span={{ xs: 1, sm: 2 }}>
              <TextInput
                source="mobile"
                label={translate('resources.system/operators.fields.mobile', { _: 'Mobile number' })}
                validate={validation.validateMobile}
                helperText={translate('resources.system/operators.helpers.mobile', { _: 'Mainland China mobile number' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        {canManagePermissions && (
          <FormSection
            title={translate('resources.system/operators.sections.permissions.title', { _: 'Permission settings' })}
            description={translate('resources.system/operators.sections.permissions.description', { _: 'Account permissions and status settings' })}
          >
            <FieldGrid columns={{ xs: 1, sm: 2 }}>
              <FieldGridItem>
                <SelectInput
                  source="level"
                  label={translate('resources.system/operators.fields.level', { _: 'Permission level' })}
                  validate={validation.validateLevel}
                  disabled={isEditingSelf}
                  choices={[
                    { id: 'super', name: translate('resources.system/operators.levels.super', { _: 'Super admin' }) },
                    { id: 'admin', name: translate('resources.system/operators.levels.admin', { _: 'Admin' }) },
                    { id: 'operator', name: translate('resources.system/operators.levels.operator', { _: 'Operator' }) },
                  ]}
                  helperText={isEditingSelf ? translate('resources.system/operators.helpers.cannot_change_own_level', { _: 'You cannot change your own Permission level' }) : translate('resources.system/operators.helpers.level', { _: 'Select the operator permission level' })}
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
                  helperText={isEditingSelf ? translate('resources.system/operators.helpers.cannot_change_own_status', { _: 'You cannot change your own Status' }) : translate('resources.system/operators.helpers.status', { _: 'Disabled accounts cannot sign in' })}
                  fullWidth
                  size="small"
                />
              </FieldGridItem>
            </FieldGrid>
          </FormSection>
        )}

        <FormSection
          title={translate('resources.system/operators.sections.remark.title', { _: 'Notes' })}
        >
          <FieldGrid columns={{ xs: 1 }}>
            <FieldGridItem>
              <TextInput
                source="remark"
                label={translate('resources.system/operators.fields.remark', { _: 'Notes' })}
                multiline
                minRows={3}
                fullWidth
                size="small"
                helperText={translate('resources.system/operators.helpers.remark', { _: 'Optional notes' })}
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>
      </SimpleForm>
    </Edit>
  );
};

// ============ Create页面 ============

export const OperatorCreate = () => {
  const translate = useTranslate();
  const validation = useValidationRules();

  return (
    <Create>
      <SimpleForm sx={formLayoutSx}>
        <FormSection
          title={translate('resources.system/operators.sections.basic.title', { _: 'Account information' })}
          description={translate('resources.system/operators.sections.basic.description', { _: 'Operator login account and password' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <TextInput
                source="username"
                label={translate('resources.system/operators.fields.username', { _: 'Username' })}
                validate={validation.validateUsername}
                helperText={translate('resources.system/operators.helpers.username', { _: '3–30 characters; letters, numbers, and underscores only' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <PasswordInput
                source="password"
                label={translate('resources.system/operators.fields.password', { _: 'Password' })}
                validate={validation.validatePassword}
                helperText={translate('resources.system/operators.helpers.password', { _: '6–50 characters; must include letters and numbers' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.system/operators.sections.personal.title', { _: 'Personal information' })}
          description={translate('resources.system/operators.sections.personal.description', { _: 'Contact details and profile' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <TextInput
                source="realname"
                label={translate('resources.system/operators.fields.realname', { _: 'Full name' })}
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
                helperText={translate('resources.system/operators.helpers.email', { _: 'Use this page toreceive system notifications' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem span={{ xs: 1, sm: 2 }}>
              <TextInput
                source="mobile"
                label={translate('resources.system/operators.fields.mobile', { _: 'Mobile number' })}
                validate={validation.validateMobile}
                helperText={translate('resources.system/operators.helpers.mobile', { _: 'Mainland China mobile number' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.system/operators.sections.permissions.title', { _: 'Permission settings' })}
          description={translate('resources.system/operators.sections.permissions.description', { _: 'Account permissions and status settings' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <SelectInput
                source="level"
                label={translate('resources.system/operators.fields.level', { _: 'Permission level' })}
                validate={validation.validateLevel}
                defaultValue="operator"
                choices={[
                  { id: 'super', name: translate('resources.system/operators.levels.super', { _: 'Super admin' }) },
                  { id: 'admin', name: translate('resources.system/operators.levels.admin', { _: 'Admin' }) },
                  { id: 'operator', name: translate('resources.system/operators.levels.operator', { _: 'Operator' }) },
                ]}
                helperText={translate('resources.system/operators.helpers.level', { _: 'Select the operator permission level' })}
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
                helperText={translate('resources.system/operators.helpers.status', { _: 'Disabled accounts cannot sign in' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.system/operators.sections.remark.title', { _: 'Notes' })}
        >
          <FieldGrid columns={{ xs: 1 }}>
            <FieldGridItem>
              <TextInput
                source="remark"
                label={translate('resources.system/operators.fields.remark', { _: 'Notes' })}
                multiline
                minRows={3}
                fullWidth
                size="small"
                helperText={translate('resources.system/operators.helpers.remark', { _: 'Optional notes' })}
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>
      </SimpleForm>
    </Create>
  );
};

// ============ 详情页Overview card ============

const OperatorHeaderCard = () => {
  const record = useRecordContext<Operator>();
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
          {/* Left side：Operator信息 */}
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
                  {record.username || <EmptyValue message="Unknown user" />}
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
              </Box>
              {record.username && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    ID: {record.id}
                  </Typography>
                  <Tooltip title="CopyUsername">
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
                {translate('resources.system/operators.fields.mobile', { _: 'Mobile number' })}
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
                {translate('resources.system/operators.fields.level', { _: 'Permission level' })}
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
                {translate('resources.system/operators.fields.last_login', { _: 'Last sign-in' })}
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

// ============ OperatorDetails ============

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
          {/* Overview card */}
          <OperatorHeaderCard />

          {/* Timestamps */}
          <DetailSectionCard
            title={translate('resources.system/operators.sections.other.title', { _: 'Timestamps' })}
            description={translate('resources.system/operators.sections.other.description', { _: 'Created and updated timestamps' })}
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
                label={translate('resources.system/operators.fields.created_at', { _: 'Created at' })}
                value={formatTimestamp(record.created_at)}
              />
              <DetailItem
                label={translate('resources.system/operators.fields.updated_at', { _: 'Updated at' })}
                value={formatTimestamp(record.updated_at)}
              />
            </Box>
          </DetailSectionCard>

          {/* Notes */}
          <DetailSectionCard
            title={translate('resources.system/operators.sections.remark.title', { _: 'Notes' })}
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
                {record.remark || translate('resources.system/operators.empty.no_remark', { _: 'No notes' })}
              </Typography>
            </Box>
          </DetailSectionCard>
        </Stack>
      </Box>
    </>
  );
};

// Operator详情
export const OperatorShow = () => {
  return (
    <Show>
      <OperatorDetails />
    </Show>
  );
};
