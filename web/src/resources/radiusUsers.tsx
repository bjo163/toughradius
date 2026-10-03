import {
  List,
  Datagrid,
  TextField,
  DateField,
  Edit,
  TextInput,
  SelectInput,
  Create,
  Show,
  EmailField,
  BooleanInput,
  required,
  minLength,
  maxLength,
  email,
  useRecordContext,
  Toolbar,
  SaveButton,
  DeleteButton,
  SimpleForm,
  ToolbarProps,
  ReferenceInput,
  ReferenceField,
  TopToolbar,
  ListButton,
  CreateButton,
  ExportButton,
  useTranslate,
  useRefresh,
  useNotify,
  useListContext,
  SortButton,
  Button,
  RaRecord,
  FunctionField
} from 'react-admin';
import {
  Box,
  Chip,
  Typography,
  Paper,
  Card,
  CardContent,
  Stack,
  alpha,
  Avatar,
  IconButton,
  Tooltip,
  Skeleton,
  useTheme,
  useMediaQuery,
  TextField as MuiTextField
} from '@mui/material';
import { Theme } from '@mui/material/styles';
import { ReactNode, useMemo, useCallback, useState, useEffect, useRef } from 'react';
import {
  Person as PersonIcon,
  ContactPhone as ContactIcon,
  Settings as SettingsIcon,
  Wifi as NetworkIcon,
  Schedule as TimeIcon,
  Note as NoteIcon,
  CheckCircle as EnabledIcon,
  Cancel as DisabledIcon,
  ContentCopy as CopyIcon,
  Refresh as RefreshIcon,
  ArrowBack as BackIcon,
  Print as PrintIcon,
  FilterList as FilterIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  CalendarToday as CalendarIcon,
  UploadFile as UploadIcon
} from '@mui/icons-material';
import { ServerPagination, ActiveFilters } from '../components';
import { API_BASE } from '../utils/apiClient';

const LARGE_LIST_PER_PAGE = 50;

// ============ Type定义 ============

interface RadiusUser extends RaRecord {
  username?: string;
  password?: string;
  realname?: string;
  email?: string;
  mobile?: string;
  address?: string;
  status?: 'enabled' | 'disabled';
  profile_id?: string | number;
  expire_time?: string;
  ip_addr?: string;
  ipv6_addr?: string;
  ipv6_prefix_pool?: string;
  delegated_ipv6_prefix?: string;
  delegated_ipv6_prefix_pool?: string;
  radius_class?: string;
  remark?: string;
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

const formatExpireTime = (expireTime?: string): { text: string; color: 'success' | 'warning' | 'error' | 'default' } => {
  if (!expireTime) {
    return { text: 'Never expires', color: 'success' };
  }
  const expireDate = new Date(expireTime);
  const now = new Date();
  const diffDays = Math.ceil((expireDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return { text: `Expired ${Math.abs(diffDays)} days ago`, color: 'error' };
  } else if (diffDays <= 7) {
    return { text: `Expires in ${diffDays} days`, color: 'warning' };
  } else if (diffDays <= 30) {
    return { text: `Expires in ${diffDays} days`, color: 'default' };
  }
  return { text: expireDate.toLocaleDateString(), color: 'success' };
};

// ============ 美化的详情组件 ============

interface DetailItemProps {
  label: string;
  value?: ReactNode;
  highlight?: boolean;
}

const DetailItem = ({ label, value, highlight = false }: DetailItemProps) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      gap: 0.5,
      p: 1.5,
      borderRadius: 0.5,
      backgroundColor: theme =>
        highlight
          ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.15 : 0.06)
          : theme.palette.mode === 'dark'
          ? 'rgba(255, 255, 255, 0.02)'
          : 'rgba(0, 0, 0, 0.02)',
      border: theme =>
        highlight
          ? `1px solid ${alpha(theme.palette.primary.main, 0.3)}`
          : `1px solid ${theme.palette.divider}`,
      transition: 'all 0.2s ease',
      '&:hover': {
        backgroundColor: theme =>
          highlight
            ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.2 : 0.08)
            : theme.palette.mode === 'dark'
            ? 'rgba(255, 255, 255, 0.04)'
            : 'rgba(0, 0, 0, 0.03)',
      },
    }}
  >
    <Typography
      variant="caption"
      sx={{
        color: 'text.secondary',
        fontWeight: 500,
        fontSize: '0.85rem',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}
    >
      {label}
    </Typography>
    <Typography
      variant="body2"
      sx={{
        fontWeight: highlight ? 600 : 500,
        color: highlight ? 'primary.main' : 'text.primary',
        wordBreak: 'break-word',
        fontSize: '1rem',
        lineHeight: 1.5,
      }}
    >
      {value ?? <span style={{ color: 'inherit', opacity: 0.4 }}>-</span>}
    </Typography>
  </Box>
);

interface DetailSectionCardProps {
  title: string;
  description?: string;
  icon: ReactNode;
  children: ReactNode;
  color?: 'primary' | 'success' | 'warning' | 'info' | 'error';
}

const DetailSectionCard = ({
  title,
  description,
  icon,
  children,
  color = 'primary',
}: DetailSectionCardProps) => (
  <Card
    elevation={0}
    sx={{
      borderRadius: 0.5,
      border: theme => `1px solid ${theme.palette.divider}`,
      overflow: 'hidden',
      transition: 'all 0.2s ease',
      '&:hover': {
        boxShadow: theme =>
          theme.palette.mode === 'dark'
            ? '0 4px 20px rgba(0, 0, 0, 0.3)'
            : '0 4px 20px rgba(0, 0, 0, 0.08)',
      },
    }}
  >
    <Box
      sx={{
        px: 2.5,
        py: 2,
        backgroundColor: theme =>
          alpha(
            theme.palette[color].main,
            theme.palette.mode === 'dark' ? 0.15 : 0.06
          ),
        borderBottom: theme =>
          `1px solid ${alpha(theme.palette[color].main, 0.2)}`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 0.5,
            backgroundColor: theme =>
              alpha(theme.palette[color].main, theme.palette.mode === 'dark' ? 0.3 : 0.15),
            color: `${color}.main`,
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 600,
              color: `${color}.main`,
              fontSize: '1.1rem',
            }}
          >
            {title}
          </Typography>
          {description && (
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                fontSize: '0.9rem',
                mt: 0.25,
              }}
            >
              {description}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
    <CardContent sx={{ p: 2.5 }}>{children}</CardContent>
  </Card>
);

// 空态组件
interface EmptyStateProps {
  message?: string;
}

const EmptyValue = ({ message = 'No data available' }: EmptyStateProps) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 0.5,
      color: 'text.disabled',
      fontStyle: 'italic',
      fontSize: '0.85rem',
    }}
  >
    <Typography variant="body2" sx={{ opacity: 0.6 }}>
      {message}
    </Typography>
  </Box>
);

// ============ 表单组件 ============

interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

const FormSection = ({ title, description, children }: FormSectionProps) => (
  <Paper
    elevation={0}
    sx={{
      p: 3,
      mb: 3,
      borderRadius: 0.5,
      border: theme => `1px solid ${theme.palette.divider}`,
      backgroundColor: theme => theme.palette.background.paper,
      width: '100%'
    }}
  >
    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
      {title}
    </Typography>
    {description && (
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1 }}>
        {description}
      </Typography>
    )}
    <Box sx={{ mt: 2, width: '100%' }}>
      {children}
    </Box>
  </Paper>
);

type ColumnConfig = {
  xs?: number;
  sm?: number;
  md?: number;
  lg?: number;
  xl?: number;
};

interface FieldGridProps {
  children: ReactNode;
  columns?: ColumnConfig;
  gap?: number;
}

const defaultColumns: Required<Pick<ColumnConfig, 'xs' | 'sm' | 'md' | 'lg'>> = {
  xs: 1,
  sm: 2,
  md: 3,
  lg: 3
};

const FieldGrid = ({
  children,
  columns = {},
  gap = 2
}: FieldGridProps) => {
  const resolved = {
    xs: columns.xs ?? defaultColumns.xs,
    sm: columns.sm ?? defaultColumns.sm,
    md: columns.md ?? defaultColumns.md,
    lg: columns.lg ?? defaultColumns.lg
  };

  return (
    <Box
      sx={{
        display: 'grid',
        gap,
        width: '100%',
        alignItems: 'stretch',
        justifyItems: 'stretch',
        gridTemplateColumns: {
          xs: `repeat(${resolved.xs}, minmax(0, 1fr))`,
          sm: `repeat(${resolved.sm}, minmax(0, 1fr))`,
          md: `repeat(${resolved.md}, minmax(0, 1fr))`,
          lg: `repeat(${resolved.lg}, minmax(0, 1fr))`
        }
      }}
    >
      {children}
    </Box>
  );
};

interface FieldGridItemProps {
  children: ReactNode;
  span?: ColumnConfig;
}

const FieldGridItem = ({
  children,
  span = {}
}: FieldGridItemProps) => {
  const resolved = {
    xs: span.xs ?? 1,
    sm: span.sm ?? span.xs ?? 1,
    md: span.md ?? span.sm ?? span.xs ?? 1,
    lg: span.lg ?? span.md ?? span.sm ?? span.xs ?? 1
  };

  return (
    <Box
      sx={{
        width: '100%',
        gridColumn: {
          xs: `span ${resolved.xs}`,
          sm: `span ${resolved.sm}`,
          md: `span ${resolved.md}`,
          lg: `span ${resolved.lg}`
        }
      }}
    >
      {children}
    </Box>
  );
};

const controlWrapperSx = {
  border: (theme: Theme) => `1px solid ${theme.palette.divider}`,
  borderRadius: 0.5,
  px: 2,
  py: 1.5,
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  '& .MuiFormControl-root': {
    width: '100%',
    margin: 0
  },
  '& .MuiFormControlLabel-root': {
    margin: 0,
    width: '100%'
  }
};

const formLayoutSx = {
  width: '100%',
  maxWidth: 'none',
  mx: 0,
  px: { xs: 2, sm: 3, md: 4 },
  '& .RaSimpleForm-main': {
    width: '100%',
    maxWidth: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start'
  },
  '& .RaSimpleForm-content': {
    width: '100%',
    maxWidth: 'none',
    px: 0
  },
  '& .RaSimpleForm-form': {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start'
  },
  '& .RaSimpleForm-input': {
    width: '100%'
  }
};

// 简化后的自定义工具栏（仅展示保存与Delete）
const UserFormToolbar = (props: ToolbarProps) => (
  <Toolbar {...props}>
    <SaveButton />
    <DeleteButton mutationMode="pessimistic" />
  </Toolbar>
);

// ============ List loading placeholder ============

const RadiusUserListSkeleton = ({ rows = 10 }: { rows?: number }) => (
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
              md: 'repeat(3, 1fr)',
              lg: 'repeat(6, 1fr)',
            },
          }}
        >
          {[...Array(6)].map((_, i) => (
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
          gridTemplateColumns: 'repeat(9, 1fr)',
          gap: 1,
          p: 2,
          bgcolor: theme =>
            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
          borderBottom: theme => `1px solid ${theme.palette.divider}`,
        }}
      >
        {[...Array(9)].map((_, i) => (
          <Skeleton key={i} variant="text" height={20} width="80%" />
        ))}
      </Box>

      {/* Table row */}
      {[...Array(rows)].map((_, rowIndex) => (
        <Box
          key={rowIndex}
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(9, 1fr)',
            gap: 1,
            p: 2,
            borderBottom: theme => `1px solid ${theme.palette.divider}`,
          }}
        >
          {[...Array(9)].map((_, colIndex) => (
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

const UserEmptyListState = () => {
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
      <PersonIcon sx={{ fontSize: 64, opacity: 0.3, mb: 2 }} />
      <Typography variant="h6" sx={{ opacity: 0.6, mb: 1 }}>
        {translate('resources.radius/users.empty.title', { _: 'No User' })}
      </Typography>
      <Typography variant="body2" sx={{ opacity: 0.5 }}>
        {translate('resources.radius/users.empty.description', { _: 'Click"Create"buttonAdd the firstRADIUSUser' })}
      </Typography>
    </Box>
  );
};

// ============ Search header section ============

const UserSearchHeaderCard = () => {
  const translate = useTranslate();
  const { filterValues, setFilters, displayedFilters } = useListContext();
  const [localFilters, setLocalFilters] = useState<Record<string, string>>({});

  // 同步外部筛选值到本地Status
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
    { key: 'username', label: translate('resources.radius/users.fields.username', { _: 'Username' }) },
    { key: 'realname', label: translate('resources.radius/users.fields.realname', { _: 'Full name' }) },
    { key: 'email', label: translate('resources.radius/users.fields.email', { _: 'Email' }) },
    { key: 'mobile', label: translate('resources.radius/users.fields.mobile', { _: 'Mobile number' }) },
    { key: 'ip_addr', label: translate('resources.radius/users.fields.ip_addr', { _: 'IPAddress' }) },
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
          {translate('resources.radius/users.filter.title', { _: 'Filters' })}
        </Typography>
      </Box>

      <CardContent sx={{ p: 2 }}>
        <Box
          sx={{
            display: 'grid',
            gap: 1.5,
            gridTemplateColumns: {
              xs: 'repeat(2, 1fr)',
              sm: 'repeat(3, 1fr)',
              md: 'repeat(4, 1fr)',
              lg: 'repeat(6, 1fr)',
            },
            alignItems: 'end',
          }}
        >
          {/* 文本筛选字段 */}
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

// ============ Status指示器组件 ============

const StatusIndicator = ({ isEnabled }: { isEnabled: boolean }) => {
  const translate = useTranslate();
  return (
    <Chip
      icon={isEnabled ? <EnabledIcon sx={{ fontSize: '0.85rem !important' }} /> : <DisabledIcon sx={{ fontSize: '0.85rem !important' }} />}
      label={isEnabled ? translate('resources.radius/users.status.enabled', { _: 'Enabled' }) : translate('resources.radius/users.status.disabled', { _: 'Disabled' })}
      size="small"
      color={isEnabled ? 'success' : 'default'}
      variant={isEnabled ? 'filled' : 'outlined'}
      sx={{ height: 22, fontWeight: 500, fontSize: '0.75rem' }}
    />
  );
};

// ============ 增强版 Datagrid 字段组件 ============

const UsernameField = () => {
  const record = useRecordContext<RadiusUser>();
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
        {record.username?.charAt(0).toUpperCase() || 'U'}
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

const ExpireTimeField = () => {
  const record = useRecordContext<RadiusUser>();
  if (!record) return null;

  const expireInfo = formatExpireTime(record.expire_time);

  return (
    <Chip
      label={expireInfo.text}
      size="small"
      color={expireInfo.color}
      variant="outlined"
      sx={{ fontWeight: 500, fontSize: '0.75rem' }}
    />
  );
};

const IpAddressField = () => {
  const record = useRecordContext<RadiusUser>();
  if (!record?.ip_addr) return <Typography variant="body2" color="text.secondary">-</Typography>;

  return (
    <Chip
      label={record.ip_addr}
      size="small"
      color="info"
      variant="outlined"
      sx={{ fontFamily: 'monospace', fontSize: '0.8rem', height: 24 }}
    />
  );
};

// ============ List action toolbar ============

// 批量导入Userbutton：支持 Excel(.xlsx)、CSV(.csv)、JSON(.json) 文件
const ImportUsersButton = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefresh();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('upload', file);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/users/import`, {
        method: 'POST',
        headers: token ? { Authorization: 'Bearer ' + token } : undefined,
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || translate('resources.radius/users.import.failed', { _: 'Import failed' }));
      }
      const result = payload?.data ?? payload;
      notify(
        translate('resources.radius/users.import.result', {
          _: 'Import complete: %{success} succeeded, %{failed} failed',
          success: result?.success ?? 0,
          failed: result?.failed ?? 0,
        }),
        { type: (result?.failed ?? 0) > 0 ? 'warning' : 'success' }
      );
      refresh();
    } catch (error) {
      notify((error as Error).message, { type: 'error' });
    } finally {
      setLoading(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  return (
    <>
      <Button
        label={translate('resources.radius/users.import.button', { _: 'Import users' })}
        onClick={() => inputRef.current?.click()}
        disabled={loading}
      >
        <UploadIcon />
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.csv,.json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </>
  );
};

const UserListActions = () => {
  const translate = useTranslate();
  return (
    <TopToolbar>
      <SortButton
        fields={['created_at', 'expire_time', 'username']}
        label={translate('ra.action.sort', { _: 'Sort' })}
      />
      <CreateButton />
      <ImportUsersButton />
      <ExportButton />
    </TopToolbar>
  );
};

// ============ List content ============

const RadiusUserListContent = () => {
  const translate = useTranslate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { data, isLoading, total } = useListContext<RadiusUser>();

  // Active filter tag settings
  const fieldLabels = useMemo(
    () => ({
      username: translate('resources.radius/users.fields.username', { _: 'Username' }),
      realname: translate('resources.radius/users.fields.realname', { _: 'Full name' }),
      email: translate('resources.radius/users.fields.email', { _: 'Email' }),
      mobile: translate('resources.radius/users.fields.mobile', { _: 'Mobile number' }),
      ip_addr: translate('resources.radius/users.fields.ip_addr', { _: 'IPAddress' }),
      status: translate('resources.radius/users.fields.status', { _: 'Status' }),
    }),
    [translate],
  );

  const statusLabels = useMemo(
    () => ({
      enabled: translate('resources.radius/users.status.enabled', { _: 'Enabled' }),
      disabled: translate('resources.radius/users.status.disabled', { _: 'Disabled' }),
    }),
    [translate],
  );

  if (isLoading) {
    return <RadiusUserListSkeleton />;
  }

  if (!data || data.length === 0) {
    return (
      <Box>
        <UserSearchHeaderCard />
        <Card
          elevation={0}
          sx={{
            borderRadius: 0.5,
            border: theme => `1px solid ${theme.palette.divider}`,
          }}
        >
          <UserEmptyListState />
        </Card>
      </Box>
    );
  }

  return (
    <Box>
      {/* Search区块 */}
      <UserSearchHeaderCard />

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
            Total <strong>{total?.toLocaleString() || 0}</strong> User
          </Typography>
        </Box>

        {/* Responsive table */}
        <Box
          sx={{
            overflowX: 'auto',
            '& .RaDatagrid-root': {
              minWidth: isMobile ? 1000 : 'auto',
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
              label={translate('resources.radius/users.fields.username', { _: 'Username' })}
              render={() => <UsernameField />}
            />
            <TextField
              source="realname"
              label={translate('resources.radius/users.fields.realname', { _: 'Full name' })}
            />
            <EmailField
              source="email"
              label={translate('resources.radius/users.fields.email', { _: 'Email' })}
            />
            <TextField
              source="mobile"
              label={translate('resources.radius/users.fields.mobile', { _: 'Mobile number' })}
            />
            <FunctionField
              source="ip_addr"
              label={translate('resources.radius/users.fields.ip_addr', { _: 'IPAddress' })}
              render={() => <IpAddressField />}
            />
            <ReferenceField
              source="profile_id"
              reference="radius/profiles"
              label={translate('resources.radius/users.fields.profile_id', { _: 'RADIUS profile' })}
            >
              <TextField source="name" />
            </ReferenceField>
            <FunctionField
              source="expire_time"
              label={translate('resources.radius/users.fields.expire_time', { _: 'Expiration time' })}
              render={() => <ExpireTimeField />}
            />
            <DateField
              source="created_at"
              label={translate('resources.radius/users.fields.created_at', { _: 'Created at' })}
              showTime
            />
          </Datagrid>
        </Box>
      </Card>
    </Box>
  );
};

// RADIUS User列表
export const RadiusUserList = () => {
  return (
    <List
      actions={<UserListActions />}
      sort={{ field: 'created_at', order: 'DESC' }}
      perPage={LARGE_LIST_PER_PAGE}
      pagination={<ServerPagination />}
      empty={false}
    >
      <RadiusUserListContent />
    </List>
  );
};

// RADIUS UserEdit
export const RadiusUserEdit = () => {
  return (
    <Edit>
      <SimpleForm toolbar={<UserFormToolbar />} sx={formLayoutSx}>
        <FormSection
          title="Authentication"
          description="Basic user authentication details"
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <TextInput
                source="id"
                disabled
                label="UserID"
                helperText="Unique ID generated automatically"
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="username"
                label="Username"
                validate={[required(), minLength(3), maxLength(50)]}
                helperText="3–50 characters; use letters, numbers, or underscores"
                autoComplete="username"
                readOnly
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="password"
                label="Password"
                type="password"
                validate={[minLength(6), maxLength(128)]}
                helperText="Leave blank to keep the current password"
                autoComplete="new-password"
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="realname"
                label="Full name"
                validate={[maxLength(100)]}
                helperText="User's full name"
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title="Contact details"
          description="Contact information and address"
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <TextInput
                source="email"
                label="Email"
                type="email"
                validate={[email(), maxLength(100)]}
                helperText="Used for notifications and password recovery"
                autoComplete="email"
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="mobile"
                label="Mobile number"
                validate={[maxLength(20)]}
                helperText="Optional mobile number, up to 20 characters"
                autoComplete="tel"
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem span={{ xs: 1, sm: 2 }}>
              <TextInput
                source="address"
                label="Address"
                multiline
                minRows={2}
                helperText="Full street address"
                autoComplete="street-address"
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title="Service settings"
          description="RADIUS service and access settings"
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <Box sx={controlWrapperSx}>
                <BooleanInput
                  source="status"
                  label="Enabled"
                  helperText="Allow this user to authenticate through RADIUS"
                />
              </Box>
            </FieldGridItem>
            <FieldGridItem>
              <ReferenceInput source="profile_id" reference="radius/profiles">
                <SelectInput
                  label="RADIUS profile"
                  optionText="name"
                  helperText="Select the user's RADIUS profile"
                  fullWidth
                  size="small"
                />
              </ReferenceInput>
            </FieldGridItem>
            <FieldGridItem span={{ xs: 1, sm: 2 }}>
              <TextInput
                source="expire_time"
                label="Expiration time"
                type="datetime-local"
                helperText="Service expiration time; leave blank for no expiration"
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title="Network configuration"
          description="IP address assignment settings"
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <TextInput
                source="ip_addr"
                label="IPv4 address"
                helperText="Static IPv4 address, for example 192.168.1.100"
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="ipv6_addr"
                label="IPv6 address"
                helperText="Static IPv6 address, for example 2001:db8::1"
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="ipv6_prefix_pool"
                label="IPv6 prefix pool"
                helperText="Framed-IPv6-Pool name for SLAAC address assignment"
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="delegated_ipv6_prefix"
                label="Delegated IPv6 prefix"
                helperText="Static Delegated-IPv6-Prefix, for example 2001:db8:1234::/48"
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="delegated_ipv6_prefix_pool"
                label="Delegated IPv6 prefix pool"
                helperText="DHCPv6-PD pool name (RFC 6911 §2.4); separate from the IPv6 prefix pool"
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem span={{ xs: 1, sm: 2 }}>
              <TextInput
                source="radius_class"
                label="RADIUS Class"
                helperText="RFC 2865 Class sent as-is in Access-Accept. For ocserv groups, use OU=group1;group2"
                validate={[maxLength(253)]}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title="Notes"
          description="Additional details and notes"
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem span={{ xs: 1, sm: 2 }}>
              <TextInput
                source="remark"
                label="Notes"
                multiline
                minRows={3}
                fullWidth
                size="small"
                helperText="Optional notes，up to1000characters"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>
      </SimpleForm>
    </Edit>
  );
};

// RADIUS UserCreate
export const RadiusUserCreate = () => (
  <Create>
    <SimpleForm sx={formLayoutSx}>
      <FormSection
        title="Authentication"
        description="Basic user authentication details"
      >
        <FieldGrid columns={{ xs: 1, sm: 2 }}>
          <FieldGridItem>
            <TextInput
              source="username"
              label="Username"
              validate={[required(), minLength(3), maxLength(50)]}
              helperText="3–50 characters; use letters, numbers, or underscores"
              autoComplete="username"
              fullWidth
              size="small"
            />
          </FieldGridItem>
          <FieldGridItem>
            <TextInput
              source="password"
              label="Password"
              type="password"
              validate={[required(), minLength(6), maxLength(128)]}
              helperText="6–128 characters"
              autoComplete="new-password"
              fullWidth
              size="small"
            />
          </FieldGridItem>
          <FieldGridItem span={{ xs: 1, sm: 2 }}>
            <TextInput
              source="realname"
              label="Full name"
              validate={[maxLength(100)]}
              helperText="User's full name"
              autoComplete="name"
              fullWidth
              size="small"
            />
          </FieldGridItem>
        </FieldGrid>
      </FormSection>

        <FormSection
          title="Contact details"
          description="Contact information and address"
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <TextInput
                source="email"
                label="Email"
                type="email"
                validate={[email(), maxLength(100)]}
                helperText="Used for notifications and password recovery"
                autoComplete="email"
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="mobile"
                label="Mobile number"
                validate={[maxLength(20)]}
                helperText="Optional mobile number, up to 20 characters"
                autoComplete="tel"
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem span={{ xs: 1, sm: 2 }}>
              <TextInput
                source="address"
                label="Address"
                multiline
                minRows={2}
                helperText="Full street address"
                autoComplete="street-address"
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

      <FormSection
        title="Service settings"
        description="RADIUS service and access settings"
      >
        <FieldGrid columns={{ xs: 1, sm: 2 }}>
          <FieldGridItem>
            <Box sx={controlWrapperSx}>
              <BooleanInput
                source="status"
                label="Enabled"
                defaultValue={true}
                helperText="Allow this user to authenticate through RADIUS"
              />
            </Box>
          </FieldGridItem>
          <FieldGridItem>
            <ReferenceInput source="profile_id" reference="radius/profiles">
              <SelectInput
                label="RADIUS profile"
                optionText="name"
                helperText="Select the user's RADIUS profile"
                fullWidth
                size="small"
              />
            </ReferenceInput>
          </FieldGridItem>
          <FieldGridItem span={{ xs: 1, sm: 2 }}>
            <TextInput
              source="expire_time"
              label="Expiration time"
              type="datetime-local"
              helperText="Service expiration time; leave blank for no expiration"
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
            />
          </FieldGridItem>
        </FieldGrid>
      </FormSection>

      <FormSection
        title="Network configuration"
        description="IP address assignment settings"
      >
        <FieldGrid columns={{ xs: 1, sm: 2 }}>
          <FieldGridItem>
            <TextInput
              source="ip_addr"
              label="IPv4 address"
              helperText="Static IPv4 address, for example 192.168.1.100"
              fullWidth
              size="small"
            />
          </FieldGridItem>
          <FieldGridItem>
            <TextInput
              source="ipv6_addr"
              label="IPv6 address"
              helperText="Static IPv6 address, for example 2001:db8::1"
              fullWidth
              size="small"
            />
          </FieldGridItem>
          <FieldGridItem span={{ xs: 1, sm: 2 }}>
            <TextInput
              source="radius_class"
              label="RADIUS Class"
              helperText="RFC 2865 Class sent as-is in Access-Accept. For ocserv groups, use OU=group1;group2. Leave blank to inherit from the RADIUS profile."
              validate={[maxLength(253)]}
              fullWidth
              size="small"
            />
          </FieldGridItem>
        </FieldGrid>
      </FormSection>

      <FormSection
        title="Notes"
        description="Additional details and notes"
      >
        <FieldGrid columns={{ xs: 1, sm: 2 }}>
          <FieldGridItem span={{ xs: 1, sm: 2 }}>
            <TextInput
              source="remark"
              label="Notes"
              multiline
              minRows={3}
              fullWidth
              size="small"
              helperText="Optional notes，up to1000characters"
            />
          </FieldGridItem>
        </FieldGrid>
      </FormSection>
    </SimpleForm>
  </Create>
);

// ============ Overview card ============

const UserHeaderCard = () => {
  const record = useRecordContext<RadiusUser>();
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
  const expireInfo = formatExpireTime(record.expire_time);

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 0.5,
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
          {/* Left side：User information */}
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
              {record.username?.charAt(0).toUpperCase() || 'U'}
            </Avatar>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  {record.username || <EmptyValue message="Unknown user" />}
                </Typography>
                {isEnabled ? (
                  <Chip
                    icon={<EnabledIcon sx={{ fontSize: '1rem !important' }} />}
                    label={translate('resources.radius/users.status.enabled', { _: 'Enabled' })}
                    size="small"
                    color="success"
                    sx={{ fontWeight: 600, height: 24 }}
                  />
                ) : (
                  <Chip
                    icon={<DisabledIcon sx={{ fontSize: '1rem !important' }} />}
                    label={translate('resources.radius/users.status.disabled', { _: 'Disabled' })}
                    size="small"
                    color="default"
                    variant="outlined"
                    sx={{ fontWeight: 600, height: 24 }}
                  />
                )}
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
                    UserID: {record.id}
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
              borderRadius: 0.5,
              bgcolor: theme => alpha(theme.palette.background.paper, 0.8),
              backdropFilter: 'blur(8px)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <EmailIcon sx={{ fontSize: '1.1rem', color: 'info.main' }} />
              <Typography variant="caption" color="text.secondary">
                {translate('resources.radius/users.fields.email', { _: 'Email' })}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-all' }}>
              {record.email || '-'}
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
              <PhoneIcon sx={{ fontSize: '1.1rem', color: 'success.main' }} />
              <Typography variant="caption" color="text.secondary">
                {translate('resources.radius/users.fields.mobile', { _: 'Mobile number' })}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {record.mobile || '-'}
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
              <NetworkIcon sx={{ fontSize: '1.1rem', color: 'warning.main' }} />
              <Typography variant="caption" color="text.secondary">
                {translate('resources.radius/users.fields.ip_addr', { _: 'IPAddress' })}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
              {record.ip_addr || '-'}
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
              <CalendarIcon sx={{ fontSize: '1.1rem', color: expireInfo.color === 'error' ? 'error.main' : expireInfo.color === 'warning' ? 'warning.main' : 'success.main' }} />
              <Typography variant="caption" color="text.secondary">
                {translate('resources.radius/users.fields.expire_time', { _: 'Expiration time' })}
              </Typography>
            </Box>
            <Chip
              label={expireInfo.text}
              size="small"
              color={expireInfo.color}
              sx={{ fontWeight: 600 }}
            />
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

// ============ UserDetails ============

const UserDetails = () => {
  const record = useRecordContext<RadiusUser>();
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
          <UserHeaderCard />

          {/* Basic information */}
          <DetailSectionCard
            title={translate('resources.radius/users.sections.basic', { _: 'Basic information' })}
            description={translate('resources.radius/users.sections.basic_desc', { _: 'Basic user authentication details' })}
            icon={<PersonIcon />}
            color="primary"
          >
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: {
                  xs: 'repeat(1, 1fr)',
                  sm: 'repeat(2, 1fr)',
                  md: 'repeat(3, 1fr)',
                },
              }}
            >
              <DetailItem
                label={translate('resources.radius/users.fields.username', { _: 'Username' })}
                value={record.username}
                highlight
              />
              <DetailItem
                label={translate('resources.radius/users.fields.realname', { _: 'Full name' })}
                value={record.realname || <EmptyValue />}
              />
              <DetailItem
                label={translate('resources.radius/users.fields.status', { _: 'Status' })}
                value={
                  <Chip
                    icon={record.status === 'enabled' ? <EnabledIcon sx={{ fontSize: '0.9rem !important' }} /> : <DisabledIcon sx={{ fontSize: '0.9rem !important' }} />}
                    label={record.status === 'enabled' ? translate('resources.radius/users.status.enabled', { _: 'Enabled' }) : translate('resources.radius/users.status.disabled', { _: 'Disabled' })}
                    size="small"
                    color={record.status === 'enabled' ? 'success' : 'default'}
                    sx={{ fontWeight: 600 }}
                  />
                }
                highlight
              />
            </Box>
          </DetailSectionCard>

          {/* contact方式 */}
          <DetailSectionCard
            title={translate('resources.radius/users.sections.contact', { _: 'Contact details' })}
            description={translate('resources.radius/users.sections.contact_desc', { _: 'Contact information and address' })}
            icon={<ContactIcon />}
            color="info"
          >
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: {
                  xs: 'repeat(1, 1fr)',
                  sm: 'repeat(2, 1fr)',
                  md: 'repeat(3, 1fr)',
                },
              }}
            >
              <DetailItem
                label={translate('resources.radius/users.fields.email', { _: 'Email' })}
                value={record.email || <EmptyValue />}
              />
              <DetailItem
                label={translate('resources.radius/users.fields.mobile', { _: 'Mobile number' })}
                value={record.mobile || <EmptyValue />}
              />
              <DetailItem
                label={translate('resources.radius/users.fields.address', { _: 'Address' })}
                value={record.address || <EmptyValue />}
              />
            </Box>
          </DetailSectionCard>

          {/* 服务Settings */}
          <DetailSectionCard
            title={translate('resources.radius/users.sections.service', { _: 'Service settings' })}
            description={translate('resources.radius/users.sections.service_desc', { _: 'RADIUS service and access settings' })}
            icon={<SettingsIcon />}
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
                label={translate('resources.radius/users.fields.profile_id', { _: 'RADIUS profile' })}
                value={
                  record.profile_id ? (
                    <ReferenceField source="profile_id" reference="radius/profiles" link="show">
                      <TextField source="name" />
                    </ReferenceField>
                  ) : (
                    <EmptyValue message="Unassigned" />
                  )
                }
                highlight
              />
              <DetailItem
                label={translate('resources.radius/users.fields.expire_time', { _: 'Expiration time' })}
                value={
                  (() => {
                    const info = formatExpireTime(record.expire_time);
                    return (
                      <Chip
                        label={info.text}
                        size="small"
                        color={info.color}
                        sx={{ fontWeight: 600 }}
                      />
                    );
                  })()
                }
                highlight
              />
            </Box>
          </DetailSectionCard>

          {/* Network configuration */}
          <DetailSectionCard
            title={translate('resources.radius/users.sections.network', { _: 'Network configuration' })}
            description={translate('resources.radius/users.sections.network_desc', { _: 'IP address assignment settings' })}
            icon={<NetworkIcon />}
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
                label={translate('resources.radius/users.fields.ip_addr', { _: 'IPv4Address' })}
                value={
                  record.ip_addr ? (
                    <Chip
                      label={record.ip_addr}
                      size="small"
                      color="info"
                      variant="outlined"
                      sx={{ fontFamily: 'monospace' }}
                    />
                  ) : (
                    <EmptyValue message="Unassigned" />
                  )
                }
              />
              <DetailItem
                label={translate('resources.radius/users.fields.ipv6_addr', { _: 'IPv6 address' })}
                value={
                  record.ipv6_addr ? (
                    <Chip
                      label={record.ipv6_addr}
                      size="small"
                      color="info"
                      variant="outlined"
                      sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                    />
                  ) : (
                    <EmptyValue message="Unassigned" />
                  )
                }
              />
              <DetailItem
                label={translate('resources.radius/users.fields.ipv6_prefix_pool', { _: 'IPv6 prefixpool' })}
                value={
                  record.ipv6_prefix_pool ? (
                    <Chip
                      label={record.ipv6_prefix_pool}
                      size="small"
                      color="info"
                      variant="outlined"
                      sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                    />
                  ) : (
                    <EmptyValue message="Unassigned" />
                  )
                }
              />
              <DetailItem
                label={translate('resources.radius/users.fields.delegated_ipv6_prefix', { _: 'Delegated IPv6 prefix' })}
                value={
                  record.delegated_ipv6_prefix ? (
                    <Chip
                      label={record.delegated_ipv6_prefix}
                      size="small"
                      color="info"
                      variant="outlined"
                      sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                    />
                  ) : (
                    <EmptyValue message="Unassigned" />
                  )
                }
              />
              <DetailItem
                label={translate('resources.radius/users.fields.delegated_ipv6_prefix_pool', { _: 'Delegated IPv6 prefixpool' })}
                value={
                  record.delegated_ipv6_prefix_pool ? (
                    <Chip
                      label={record.delegated_ipv6_prefix_pool}
                      size="small"
                      color="info"
                      variant="outlined"
                      sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                    />
                  ) : (
                    <EmptyValue message="Unassigned" />
                  )
                }
              />
              <DetailItem
                label={translate('resources.radius/users.fields.radius_class', { _: 'RADIUS Class' })}
                value={
                  record.radius_class ? (
                    <Chip
                      label={record.radius_class}
                      size="small"
                      color="info"
                      variant="outlined"
                      sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                    />
                  ) : (
                    <EmptyValue message="Not set" />
                  )
                }
              />
            </Box>
          </DetailSectionCard>

          {/* Timestamps */}
          <DetailSectionCard
            title={translate('resources.radius/users.sections.timing', { _: 'Timestamps' })}
            description={translate('resources.radius/users.sections.timing_desc', { _: 'Created and updated timestamps' })}
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
                label={translate('resources.radius/users.fields.created_at', { _: 'Created at' })}
                value={formatTimestamp(record.created_at)}
              />
              <DetailItem
                label={translate('resources.radius/users.fields.updated_at', { _: 'Updated at' })}
                value={formatTimestamp(record.updated_at)}
              />
            </Box>
          </DetailSectionCard>

          {/* Notes */}
          <DetailSectionCard
            title={translate('resources.radius/users.sections.remark', { _: 'Notes' })}
            description={translate('resources.radius/users.sections.remark_desc', { _: 'Additional details and notes' })}
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
                {record.remark || translate('resources.radius/users.empty.no_remark', { _: 'No notes' })}
              </Typography>
            </Box>
          </DetailSectionCard>
        </Stack>
      </Box>
    </>
  );
};

// RADIUS User详情
export const RadiusUserShow = () => {
  return (
    <Show>
      <UserDetails />
    </Show>
  );
};
