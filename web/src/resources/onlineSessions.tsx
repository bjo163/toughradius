import {
  List,
  Datagrid,
  TextField,
  DateField,
  FunctionField,
  Show,
  useRecordContext,
  useTranslate,
  ExportButton,
  TopToolbar,
  ListButton,
  useRefresh,
  useNotify,
  useListContext,
  SortButton,
  RaRecord,
  useDelete,
  useRedirect,
} from 'react-admin';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Stack,
  alpha,
  Tooltip,
  Avatar,
  LinearProgress,
  IconButton,
  Skeleton,
  useTheme,
  useMediaQuery,
  TextField as MuiTextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material';
import {
  Router as DeviceIcon,
  AccessTime as TimeIcon,
  DataUsage as TrafficIcon,
  Wifi as OnlineIcon,
  WifiOff as DisconnectIcon,
  ContentCopy as CopyIcon,
  Refresh as RefreshIcon,
  ArrowBack as BackIcon,
  CloudUpload as UploadIcon,
  CloudDownload as DownloadIcon,
  Speed as SpeedIcon,
  SignalCellularAlt as SignalIcon,
  Print as PrintIcon,
  FilterList as FilterIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import { ReactNode, useMemo, useCallback, useState, useEffect } from 'react';
import { ServerPagination, ActiveFilters } from '../components';

const LARGE_LIST_PER_PAGE = 50;

interface OnlineSession extends RaRecord {
  acct_session_id?: string;
  username?: string;
  nas_addr?: string;
  framed_ipaddr?: string;
  framed_ipv6addr?: string;
  mac_addr?: string;
  nas_port?: string | number;
  service_type?: string;
  framed_netmask?: string;
  session_timeout?: number;
  acct_start_time?: string | number;
  acct_session_time?: number;
  acct_input_octets?: number;
  acct_output_octets?: number;
  acct_input_packets?: number;
  acct_output_packets?: number;
}

const formatDuration = (seconds?: number): string => {
  if (seconds === undefined || seconds === null) {
    return '-';
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts = [];
  if (hours) {
    parts.push(`${hours}h`);
  }
  if (minutes) {
    parts.push(`${minutes}m`);
  }
  parts.push(`${secs}s`);
  return parts.join(' ');
};

const formatBytes = (bytes?: number): string => {
  if (bytes === undefined || bytes === null) {
    return '-';
  }
  if (bytes === 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${parseFloat(value.toFixed(2))} ${units[index]}`;
};

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

const NasPortField = ({ label }: { label?: string }) => {
  const translate = useTranslate();
  return (
    <FunctionField
      source="nas_port"
      label={label || translate('resources.radius/online.fields.nas_port')}
      render={(record: OnlineSession) => {
        if (!record?.nas_port) {
          return '-';
        }
        return <Chip label={String(record.nas_port)} size="small" variant="outlined" />;
      }}
    />
  );
};

const TimeoutField = ({ label }: { label?: string }) => {
  const translate = useTranslate();
  return (
    <FunctionField
      source="session_timeout"
      label={label || translate('resources.radius/online.fields.session_timeout')}
      render={(record: OnlineSession) => {
        if (record?.session_timeout === undefined || record?.session_timeout === null) {
          return '-';
        }
        return `${record.session_timeout}s`;
      }}
    />
  );
};

const SessionDurationField = ({ label }: { label?: string }) => {
  const translate = useTranslate();
  return (
    <FunctionField
      source="acct_session_time"
      label={label || translate('resources.radius/online.fields.session_time')}
      render={(record: OnlineSession) => formatDuration(record.acct_session_time)}
    />
  );
};

// ============ Enhanced Detail Components ============

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
      borderRadius: 1.5,
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
      borderRadius: 3,
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
            borderRadius: 2,
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

// Traffic statistics card - displayed with special styling
interface TrafficStatProps {
  label: string;
  value: string;
  icon?: ReactNode;
  color?: 'primary' | 'success' | 'warning' | 'info' | 'error';
  subValue?: string;
}

const TrafficStat = ({ label, value, icon, color = 'primary', subValue }: TrafficStatProps) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      p: 2.5,
      borderRadius: 3,
      backgroundColor: theme =>
        alpha(theme.palette[color].main, theme.palette.mode === 'dark' ? 0.15 : 0.08),
      border: theme => `1px solid ${alpha(theme.palette[color].main, 0.2)}`,
      minWidth: 140,
      flex: 1,
      transition: 'all 0.2s ease',
      '&:hover': {
        transform: 'translateY(-2px)',
        boxShadow: theme =>
          `0 8px 24px ${alpha(theme.palette[color].main, 0.2)}`,
      },
    }}
  >
    {icon && (
      <Box
        sx={{
          mb: 1,
          color: `${color}.main`,
          opacity: 0.8,
        }}
      >
        {icon}
      </Box>
    )}
    <Typography
      variant="caption"
      sx={{
        color: 'text.secondary',
        fontWeight: 500,
        fontSize: '0.8rem',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        mb: 0.5,
        textAlign: 'center',
      }}
    >
      {label}
    </Typography>
    <Typography
      variant="h5"
      sx={{
        fontWeight: 700,
        color: `${color}.main`,
        fontSize: '1.4rem',
      }}
    >
      {value}
    </Typography>
    {subValue && (
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
          fontSize: '0.8rem',
          mt: 0.5,
        }}
      >
        {subValue}
      </Typography>
    )}
  </Box>
);

// Empty state component
interface EmptyStateProps {
  icon?: ReactNode;
  message?: string;
}

const EmptyValue = ({ message = 'No Data' }: EmptyStateProps) => (
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

// Top overview card
const SessionHeaderCard = () => {
  const record = useRecordContext<OnlineSession>();
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefresh();
  const redirect = useRedirect();
  const [deleteOne, { isPending: isDeleting }] = useDelete();
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);

  const handleCopy = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    notify(`${label} copied to clipboard`, { type: 'info' });
  }, [notify]);

  const handleRefresh = useCallback(() => {
    refresh();
    notify('Data refreshed', { type: 'info' });
  }, [refresh, notify]);

  const handleDisconnect = useCallback(() => {
    if (!record?.id) return;
    deleteOne(
      'radius/online',
      { id: record.id },
      {
        onSuccess: () => {
          notify(translate('resources.radius/online.notifications.disconnected', { _: 'User disconnected' }), { type: 'success' });
          redirect('list', 'radius/online');
        },
        onError: (error) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          notify(translate('resources.radius/online.notifications.disconnect_error', { _: 'Disconnect failed' }) + `: ${errorMessage}`, { type: 'error' });
        },
      }
    );
    setDisconnectDialogOpen(false);
  }, [record, deleteOne, notify, translate, redirect]);

  if (!record) return null;

  const totalTraffic = (record.acct_input_octets ?? 0) + (record.acct_output_octets ?? 0);
  const sessionTimePercent = record.session_timeout
    ? Math.min(((record.acct_session_time ?? 0) / record.session_timeout) * 100, 100)
    : 0;

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 4,
        background: theme =>
          theme.palette.mode === 'dark'
            ? `linear-gradient(135deg, ${alpha(theme.palette.primary.dark, 0.4)} 0%, ${alpha(theme.palette.info.dark, 0.3)} 100%)`
            : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.info.main, 0.08)} 100%)`,
        border: theme => `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
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
          background: theme => alpha(theme.palette.primary.main, 0.1),
          pointerEvents: 'none',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: -30,
          left: -30,
          width: 150,
          height: 150,
          borderRadius: '50%',
          background: theme => alpha(theme.palette.info.main, 0.08),
          pointerEvents: 'none',
        }}
      />

      <CardContent sx={{ p: 3, position: 'relative', zIndex: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
          {/* Left side: User info */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar
              sx={{
                width: 64,
                height: 64,
                bgcolor: 'primary.main',
                fontSize: '1.5rem',
                fontWeight: 700,
                boxShadow: theme => `0 4px 14px ${alpha(theme.palette.primary.main, 0.4)}`,
              }}
            >
              {record.username?.charAt(0).toUpperCase() || 'U'}
            </Avatar>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  {record.username || <EmptyValue message="Unknown User" />}
                </Typography>
                <Chip
                  icon={<OnlineIcon sx={{ fontSize: '1rem !important' }} />}
                  label="Online"
                  size="small"
                  color="success"
                  sx={{ fontWeight: 600, height: 24 }}
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {record.framed_ipaddr || 'No IP Assigned'}
                </Typography>
                {record.framed_ipaddr && (
                  <Tooltip title="Copy IP Address">
                    <IconButton
                      size="small"
                      onClick={() => handleCopy(record.framed_ipaddr!, 'IP Address')}
                      sx={{ p: 0.5 }}
                    >
                      <CopyIcon sx={{ fontSize: '0.9rem' }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
              {record.acct_session_id && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    Session: {record.acct_session_id}
                  </Typography>
                  <Tooltip title="Copy Session ID">
                    <IconButton
                      size="small"
                      onClick={() => handleCopy(record.acct_session_id!, 'Session ID')}
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
            <Tooltip title={translate('resources.radius/online.actions.disconnect', { _: 'Disconnect' })}>
              <IconButton
                onClick={() => setDisconnectDialogOpen(true)}
                disabled={isDeleting}
                sx={{
                  bgcolor: theme => alpha(theme.palette.error.main, 0.1),
                  color: 'error.main',
                  '&:hover': {
                    bgcolor: theme => alpha(theme.palette.error.main, 0.2),
                  },
                }}
              >
                <DisconnectIcon />
              </IconButton>
            </Tooltip>
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

        {/* Disconnect confirmation dialog */}
        <Dialog
          open={disconnectDialogOpen}
          onClose={() => setDisconnectDialogOpen(false)}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle sx={{ color: 'error.main', fontWeight: 600 }}>
            {translate('resources.radius/online.dialog.disconnect_title', { _: 'Confirm Disconnect' })}
          </DialogTitle>
          <DialogContent>
            <DialogContentText>
              {translate('resources.radius/online.dialog.disconnect_content', {
                _: 'Are you sure you want to disconnect user "{username}"? This will terminate their network connection.',
                username: record.username || 'Unknown User',
              })}
            </DialogContentText>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              onClick={() => setDisconnectDialogOpen(false)}
              disabled={isDeleting}
            >
              {translate('ra.action.cancel', { _: 'Cancel' })}
            </Button>
            <Button
              onClick={handleDisconnect}
              color="error"
              variant="contained"
              disabled={isDeleting}
              startIcon={<DisconnectIcon />}
            >
              {isDeleting
                ? translate('resources.radius/online.actions.disconnecting', { _: 'Disconnecting...' })
                : translate('resources.radius/online.actions.disconnect', { _: 'Disconnect' })}
            </Button>
          </DialogActions>
        </Dialog>

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
              <TimeIcon sx={{ fontSize: '1.1rem', color: 'warning.main' }} />
              <Typography variant="caption" color="text.secondary">
                {translate('resources.radius/online.fields.session_time')}
              </Typography>
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {formatDuration(record.acct_session_time)}
            </Typography>
            {record.session_timeout && (
              <Box sx={{ mt: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={sessionTimePercent}
                  sx={{
                    height: 4,
                    borderRadius: 2,
                    bgcolor: theme => alpha(theme.palette.warning.main, 0.2),
                    '& .MuiLinearProgress-bar': {
                      bgcolor: 'warning.main',
                    },
                  }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  {sessionTimePercent.toFixed(0)}% / {record.session_timeout}s
                </Typography>
              </Box>
            )}
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
              <UploadIcon sx={{ fontSize: '1.1rem', color: 'info.main' }} />
              <Typography variant="caption" color="text.secondary">
                {translate('resources.radius/online.fields.acct_input_octets')}
              </Typography>
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'info.main' }}>
              {formatBytes(record.acct_input_octets)}
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
              <DownloadIcon sx={{ fontSize: '1.1rem', color: 'warning.main' }} />
              <Typography variant="caption" color="text.secondary">
                {translate('resources.radius/online.fields.acct_output_octets')}
              </Typography>
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'warning.main' }}>
              {formatBytes(record.acct_output_octets)}
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
                {translate('resources.radius/online.fields.total_traffic')}
              </Typography>
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.main' }}>
              {formatBytes(totalTraffic)}
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

const OnlineSessionDetails = () => {
  const record = useRecordContext<OnlineSession>();
  const translate = useTranslate();
  if (!record) {
    return null;
  }

  const totalTraffic =
    (record.acct_input_octets ?? 0) + (record.acct_output_octets ?? 0);

  return (
    <>
      <style>{printStyles}</style>
      <Box className="printable-content" sx={{ width: '100%', p: { xs: 2, sm: 3, md: 4 } }}>
      <Stack spacing={3}>
        {/* Top overview card */}
        <SessionHeaderCard />

        {/* Device information */}
        <DetailSectionCard
          title={translate('resources.radius/online.sections.device')}
          description={translate('resources.radius/online.sections.device_desc')}
          icon={<DeviceIcon />}
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
              label={translate('resources.radius/online.fields.framed_ipaddr')}
              value={
                record.framed_ipaddr ? (
                  <Chip
                    label={record.framed_ipaddr}
                    size="small"
                    color="info"
                    variant="outlined"
                    sx={{ fontFamily: 'monospace' }}
                  />
                ) : (
                  <EmptyValue message="Not Assigned" />
                )
              }
              highlight
            />
            <DetailItem
              label={translate('resources.radius/online.fields.framed_netmask')}
              value={record.framed_netmask || <EmptyValue />}
            />
            <DetailItem
              label={translate('resources.radius/online.fields.mac_addr')}
              value={
                record.mac_addr ? (
                  <Chip
                    label={record.mac_addr}
                    size="small"
                    variant="outlined"
                    sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                  />
                ) : (
                  <EmptyValue message="Not Retrieved" />
                )
              }
            />
          </Box>
        </DetailSectionCard>

        {/* NAS Information */}
        <DetailSectionCard
          title={translate('resources.radius/online.sections.overview')}
          description={translate('resources.radius/online.sections.overview_desc')}
          icon={<SignalIcon />}
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
              label={translate('resources.radius/online.fields.nas_addr')}
              value={
                record.nas_addr ? (
                  <Chip
                    label={record.nas_addr}
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ fontFamily: 'monospace' }}
                  />
                ) : (
                  <EmptyValue />
                )
              }
              highlight
            />
            <DetailItem
              label={translate('resources.radius/online.fields.nas_port')}
              value={record.nas_port?.toString() || <EmptyValue />}
            />
            <DetailItem
              label={translate('resources.radius/online.fields.service_type')}
              value={record.service_type || <EmptyValue />}
            />
          </Box>
        </DetailSectionCard>

        {/* Session Time */}
        <DetailSectionCard
          title={translate('resources.radius/online.sections.timing')}
          description={translate('resources.radius/online.sections.timing_desc')}
          icon={<TimeIcon />}
          color="warning"
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
              label={translate('resources.radius/online.fields.acct_start_time')}
              value={formatTimestamp(record.acct_start_time)}
              highlight
            />
            <DetailItem
              label={translate('resources.radius/online.fields.session_time')}
              value={
                <Chip
                  label={formatDuration(record.acct_session_time)}
                  size="small"
                  color="warning"
                  sx={{ fontWeight: 600 }}
                />
              }
              highlight
            />
            <DetailItem
              label={translate('resources.radius/online.fields.session_timeout')}
              value={
                record.session_timeout !== undefined && record.session_timeout !== null
                  ? `${record.session_timeout}s`
                  : <EmptyValue message="Unlimited" />
              }
            />
          </Box>
        </DetailSectionCard>

        {/* Traffic Statistics - Special Display */}
        <DetailSectionCard
          title={translate('resources.radius/online.sections.traffic')}
          description={translate('resources.radius/online.sections.traffic_desc')}
          icon={<TrafficIcon />}
          color="success"
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Traffic statistics cards */}
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 2,
                justifyContent: 'stretch',
              }}
            >
              <TrafficStat
                label={translate('resources.radius/online.fields.acct_input_octets')}
                value={formatBytes(record.acct_input_octets)}
                icon={<UploadIcon />}
                color="info"
                subValue={`${record.acct_input_packets?.toLocaleString() ?? 0} pkts`}
              />
              <TrafficStat
                label={translate('resources.radius/online.fields.acct_output_octets')}
                value={formatBytes(record.acct_output_octets)}
                icon={<DownloadIcon />}
                color="warning"
                subValue={`${record.acct_output_packets?.toLocaleString() ?? 0} pkts`}
              />
              <TrafficStat
                label={translate('resources.radius/online.fields.total_traffic')}
                value={formatBytes(totalTraffic)}
                icon={<SpeedIcon />}
                color="success"
                subValue={`${((record.acct_input_packets ?? 0) + (record.acct_output_packets ?? 0)).toLocaleString()} pkts`}
              />
            </Box>
          </Box>
        </DetailSectionCard>
      </Stack>
    </Box>
    </>
  );
};

// ============ List Loading Skeleton ============

const OnlineSessionListSkeleton = ({ rows = 10 }: { rows?: number }) => (
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
          gridTemplateColumns: 'repeat(10, 1fr)',
          gap: 1,
          p: 2,
          bgcolor: theme =>
            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
          borderBottom: theme => `1px solid ${theme.palette.divider}`,
        }}
      >
        {[...Array(10)].map((_, i) => (
          <Skeleton key={i} variant="text" height={20} width="80%" />
        ))}
      </Box>

      {/* Table rows */}
      {[...Array(rows)].map((_, rowIndex) => (
        <Box
          key={rowIndex}
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(10, 1fr)',
            gap: 1,
            p: 2,
            borderBottom: theme => `1px solid ${theme.palette.divider}`,
          }}
        >
          {[...Array(10)].map((_, colIndex) => (
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

const EmptyListState = () => {
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
      <OnlineIcon sx={{ fontSize: 64, opacity: 0.3, mb: 2 }} />
      <Typography variant="h6" sx={{ opacity: 0.6, mb: 1 }}>
        {translate('resources.radius/online.empty.title', { _: 'No Online Sessions' })}
      </Typography>
      <Typography variant="body2" sx={{ opacity: 0.5 }}>
        {translate('resources.radius/online.empty.description', { _: 'No users currently online' })}
      </Typography>
    </Box>
  );
};

// ============ Search Header Card Component ============

const SearchHeaderCard = () => {
  const translate = useTranslate();
  const { filterValues, setFilters, displayedFilters } = useListContext();
  const [localFilters, setLocalFilters] = useState<Record<string, string>>({});

  // Sync external filter values to local state
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
    { key: 'username', label: translate('resources.radius/online.fields.username', { _: 'Username' }) },
    { key: 'acct_session_id', label: translate('resources.radius/online.fields.acct_session_id', { _: 'Session ID' }) },
    { key: 'framed_ipaddr', label: translate('resources.radius/online.fields.framed_ipaddr', { _: 'User IP' }) },
    { key: 'framed_ipv6addr', label: translate('resources.radius/online.fields.framed_ipv6addr', { _: 'IPv6 Address' }) },
    { key: 'nas_addr', label: translate('resources.radius/online.fields.nas_addr', { _: 'NAS Address' }) },
    { key: 'mac_addr', label: translate('resources.radius/online.fields.mac_addr', { _: 'MAC Address' }) },
  ];

  // Start time range filter
  const dateFields = [
    { key: 'acct_start_time_gte', label: translate('resources.radius/online.filter.start_time_from', { _: 'Start Time From' }) },
    { key: 'acct_start_time_lte', label: translate('resources.radius/online.filter.start_time_to', { _: 'Start Time To' }) },
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
          {translate('resources.radius/online.filter.title', { _: 'Filter Conditions' })}
        </Typography>
      </Box>

      <CardContent sx={{ p: 2 }}>
        {/* Use grid layout for responsive design */}
        <Box
          sx={{
            display: 'grid',
            gap: 1.5,
            gridTemplateColumns: {
              xs: 'repeat(2, 1fr)',           // Mobile: 2 columns
              sm: 'repeat(3, 1fr)',           // Tablet: 3 columns
              md: 'repeat(4, 1fr)',           // Medium: 4 columns
              lg: 'repeat(5, 1fr)',           // Large: 5 columns
              xl: 'repeat(8, 1fr) auto',      // Extra large: 8 columns + buttons
            },
            alignItems: 'end',
          }}
        >
          {/* Text filter fields */}
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

          {/* Time range filter fields */}
          {dateFields.map(field => (
            <MuiTextField
              key={field.key}
              label={field.label}
              type="datetime-local"
              value={localFilters[field.key] || ''}
              onChange={e => handleFilterChange(field.key, e.target.value)}
              size="small"
              fullWidth
              InputLabelProps={{
                shrink: true,
              }}
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

// ============ Enhanced Datagrid Field Components ============

const UsernameField = () => {
  const record = useRecordContext<OnlineSession>();
  if (!record) return null;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Avatar
        sx={{
          width: 28,
          height: 28,
          fontSize: '0.75rem',
          fontWeight: 600,
          bgcolor: 'success.main',
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
        <Chip
          icon={<OnlineIcon sx={{ fontSize: '0.85rem !important' }} />}
          label="Online"
          size="small"
          color="success"
          sx={{ height: 20, fontWeight: 500, fontSize: '0.7rem' }}
        />
      </Box>
    </Box>
  );
};

const IpAddressField = () => {
  const record = useRecordContext<OnlineSession>();
  if (!record?.framed_ipaddr) return <Typography variant="body2" color="text.secondary">-</Typography>;

  return (
    <Chip
      label={record.framed_ipaddr}
      size="small"
      color="info"
      variant="outlined"
      sx={{ fontFamily: 'monospace', fontSize: '0.8rem', height: 24 }}
    />
  );
};

const TrafficFieldCompact = ({ type }: { type: 'upload' | 'download' }) => {
  const record = useRecordContext<OnlineSession>();
  if (!record) return null;

  const value = type === 'upload' ? record.acct_input_octets : record.acct_output_octets;
  const color = type === 'upload' ? 'info.main' : 'warning.main';
  const Icon = type === 'upload' ? UploadIcon : DownloadIcon;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Icon sx={{ fontSize: 16, color }} />
      <Typography variant="body2" sx={{ fontWeight: 500, color }}>
        {formatBytes(value)}
      </Typography>
    </Box>
  );
};

const SessionIdField = () => {
  const record = useRecordContext<OnlineSession>();
  if (!record?.acct_session_id) return <Typography variant="body2" color="text.secondary">-</Typography>;

  return (
    <Tooltip title={record.acct_session_id}>
      <Typography
        variant="body2"
        sx={{
          fontFamily: 'monospace',
          fontSize: '0.8rem',
          maxWidth: 120,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {record.acct_session_id}
      </Typography>
    </Tooltip>
  );
};

// ============ List Actions Bar Component ============

const OnlineSessionActions = () => {
  const translate = useTranslate();
  return (
    <TopToolbar>
      <SortButton
        fields={['acct_start_time', 'acct_session_time', 'username']}
        label={translate('ra.action.sort', { _: 'Sort' })}
      />
      <ExportButton />
    </TopToolbar>
  );
};

// ============ Internal List Content Component ============

const OnlineSessionListContent = () => {
  const translate = useTranslate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { data, isLoading, total } = useListContext<OnlineSession>();

  // Active filter labels configuration
  const fieldLabels = useMemo(
    () => ({
      username: translate('resources.radius/online.fields.username'),
      acct_session_id: translate('resources.radius/online.fields.acct_session_id'),
      framed_ipaddr: translate('resources.radius/online.fields.framed_ipaddr'),
      framed_ipv6addr: translate('resources.radius/online.fields.framed_ipv6addr'),
      nas_addr: translate('resources.radius/online.fields.nas_addr'),
      mac_addr: translate('resources.radius/online.fields.mac_addr'),
      acct_start_time_gte: translate('resources.radius/online.fields.acct_start_time_gte'),
      acct_start_time_lte: translate('resources.radius/online.fields.acct_start_time_lte'),
    }),
    [translate],
  );

  if (isLoading) {
    return <OnlineSessionListSkeleton />;
  }

  if (!data || data.length === 0) {
    return (
      <Box>
        <SearchHeaderCard />
        <Card
          elevation={0}
          sx={{
            borderRadius: 2,
            border: theme => `1px solid ${theme.palette.divider}`,
          }}
        >
          <EmptyListState />
        </Card>
      </Box>
    );
  }

  return (
    <Box>
      {/* Search section */}
      <SearchHeaderCard />

      {/* Active filter tags */}
      <ActiveFilters fieldLabels={fieldLabels} />

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
            Total: <strong>{total?.toLocaleString() || 0}</strong> online sessions
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
                  '& .row-actions': {
                    opacity: 1,
                  },
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
          <Datagrid
            rowClick="show"
            bulkActionButtons={false}
          >
            <FunctionField
              source="username"
              label={translate('resources.radius/online.fields.username')}
              render={() => <UsernameField />}
            />
            <FunctionField
              source="acct_session_id"
              label={translate('resources.radius/online.fields.acct_session_id')}
              render={() => <SessionIdField />}
            />
            <FunctionField
              source="framed_ipaddr"
              label={translate('resources.radius/online.fields.framed_ipaddr')}
              render={() => <IpAddressField />}
            />
            <TextField
              source="nas_addr"
              label={translate('resources.radius/online.fields.nas_addr')}
            />
            <NasPortField label={translate('resources.radius/online.fields.nas_port')} />
            <DateField
              source="acct_start_time"
              label={translate('resources.radius/online.fields.acct_start_time')}
              showTime
            />
            <SessionDurationField label={translate('resources.radius/online.fields.session_time')} />
            <TimeoutField label={translate('resources.radius/online.fields.session_timeout')} />
            <FunctionField
              source="acct_input_octets"
              label={translate('resources.radius/online.fields.acct_input_octets')}
              render={() => <TrafficFieldCompact type="upload" />}
            />
            <FunctionField
              source="acct_output_octets"
              label={translate('resources.radius/online.fields.acct_output_octets')}
              render={() => <TrafficFieldCompact type="download" />}
            />
          </Datagrid>
        </Box>
      </Card>
    </Box>
  );
};

// ============ Main List Component ============

export const OnlineSessionList = () => {
  return (
    <List
      actions={<OnlineSessionActions />}
      sort={{ field: 'acct_start_time', order: 'DESC' }}
      perPage={LARGE_LIST_PER_PAGE}
      pagination={<ServerPagination />}
      empty={false}
    >
      <OnlineSessionListContent />
    </List>
  );
};

export const OnlineSessionShow = () => (
  <Show>
    <OnlineSessionDetails />
  </Show>
);
