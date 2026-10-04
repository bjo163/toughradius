import React, { useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, Divider, FormControlLabel,
  IconButton, LinearProgress, MenuItem, Stack, Switch, Tab, Tabs, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import {
  Add, CheckCircle, DeleteOutline, Dns, ErrorOutline, NetworkCheck,
  NotificationsActive, Pause, PlayArrow, QrCode2, Refresh, Send, Sensors,
  ShowChart, Speed,
} from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotify, usePermissions } from 'react-admin';
import { apiRequest, extractData } from '../utils/apiClient';
import { MrtgTrafficGraph } from '../components/MrtgTrafficGraph';
import { KpiStrip, KpiTile, Mono, PageHeader, Panel } from '../components/Enterprise';

type Heartbeat = { id: string; checked_at: string; reachable: boolean; latency_milliseconds: number; packet_loss_percent: number };
type Target = {
  id: string; name: string; kind: string; address: string; probe_type: string; port: number;
  interval_seconds: number; timeout_milliseconds: number; failure_threshold: number; enabled: boolean;
  last_status: string; last_latency_milliseconds: number; last_packet_loss_percent: number;
  last_checked_at?: string; last_error?: string; snmp_secret_configured?: boolean;
  uptime_percent?: number; heartbeats?: Heartbeat[];
};

type Sample = { id: string; checked_at: string; reachable: boolean; latency_milliseconds: number; packet_loss_percent: number; interface_metrics_json?: string };
type InterfaceMetric = { index: number; name: string; operational: string; in_octets?: string; out_octets?: string };
type OutboxItem = { id: string; event_type: string; recipient: string; status: string; attempts: number; created_at: string; sent_at?: string; last_error?: string };
type WhatsApp = { connected: boolean; logged_in: boolean; state: string; account?: string; qr_image?: string; qr_expires?: string };
type NotifySettings = { whatsapp_enabled: boolean; risk_acknowledged_at?: string; recipients: string[]; events: string[]; whatsapp: WhatsApp };
const eventOptions = [
  ['network.down', 'Network target down'], ['network.recovered', 'Network target recovered'],
  ['billing.suspended', 'Subscription suspended'], ['billing.reactivated', 'Subscription reactivated'], ['scheduler.failure', 'Scheduler failure'],
];

const formatBytes = (raw?: string) => {
  const bytes = Number(raw ?? 0);
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = -1;
  do { value /= 1024; unit += 1; } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
};

const parseInterfaces = (raw?: string): InterfaceMetric[] => {
  try {
    const parsed: unknown = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed as InterfaceMetric[] : [];
  } catch {
    return [];
  }
};

const KumaHeartbeatBar = ({ heartbeats, enabled }: { heartbeats?: Heartbeat[]; enabled: boolean }) => {
  const count = 30;
  const list = heartbeats ?? [];
  const emptySlotsCount = Math.max(0, count - list.length);
  const slots: Array<{ sample?: Heartbeat; status: 'up' | 'down' | 'empty' | 'paused' }> = [];

  for (let i = 0; i < emptySlotsCount; i++) {
    slots.push({ status: 'empty' });
  }

  for (const sample of list) {
    slots.push({
      sample,
      status: !enabled ? 'paused' : sample.reachable ? 'up' : 'down',
    });
  }

  const oldestTime = list.length > 0 ? new Date(list[0].checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
  const latestTime = list.length > 0 ? new Date(list[list.length - 1].checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now';

  return (
    <Box sx={{ width: '100%', mt: 1.25 }}>
      <Stack direction="row" spacing={0.4} sx={{ width: '100%', height: 26, alignItems: 'center' }}>
        {slots.map((slot, idx) => {
          if (!slot.sample || slot.status === 'empty') {
            return (
              <Box
                key={`empty-${idx}`}
                sx={{
                  flex: 1,
                  height: 20,
                  borderRadius: '3px',
                  bgcolor: 'action.hover',
                  opacity: 0.35,
                }}
              />
            );
          }
          const s = slot.sample;
          const isUp = slot.status === 'up';
          const isPaused = slot.status === 'paused';
          const label = `${new Date(s.checked_at).toLocaleTimeString()} · ${isPaused ? 'PAUSED' : isUp ? 'UP' : 'DOWN'} · ${s.latency_milliseconds} ms · ${s.packet_loss_percent.toFixed(0)}% loss`;
          const barColor = isPaused ? '#9ca3af' : isUp ? '#22c55e' : '#ef4444';

          return (
            <Tooltip key={s.id || idx} title={label} arrow placement="top">
              <Box
                role="img"
                aria-label={label}
                sx={{
                  flex: 1,
                  height: 20,
                  borderRadius: '3px',
                  bgcolor: barColor,
                  transition: 'all 0.15s ease-in-out',
                  cursor: 'pointer',
                  '&:hover': {
                    transform: 'scaleY(1.3)',
                    opacity: 0.95,
                    boxShadow: `0 0 8px ${barColor}`,
                  },
                }}
              />
            </Tooltip>
          );
        })}
      </Stack>
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5, px: 0.25 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
          {oldestTime} ({list.length} checks)
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
          {latestTime}
        </Typography>
      </Stack>
    </Box>
  );
};

const SampleTrend = ({ samples }: { samples: Sample[] }) => {
  const chronological = [...samples].reverse();
  const maxLatency = Math.max(1, ...chronological.map(sample => sample.latency_milliseconds));
  return <Stack direction="row" spacing={0.75} alignItems="flex-end" sx={{ minHeight: 92, pt: 1 }}>
    {chronological.map(sample => {
      const height = Math.max(8, (sample.latency_milliseconds / maxLatency) * 68);
      const label = `${new Date(sample.checked_at).toLocaleString()} · ${sample.latency_milliseconds} ms · ${sample.packet_loss_percent.toFixed(0)}% loss`;
      return <Tooltip key={sample.id} title={label}>
        <Box role="img" aria-label={label} sx={{ flex: 1, minWidth: 8, maxWidth: 42, height, borderRadius: '4px 4px 1px 1px', bgcolor: sample.reachable ? 'success.main' : 'error.main', opacity: 0.82 }} />
      </Tooltip>;
    })}
  </Stack>;
};

const OperationsPage: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState({ name: '', kind: 'router', address: '', probe_type: 'icmp', port: 80, interval_seconds: 60, timeout_milliseconds: 1500, failure_threshold: 2, enabled: true, snmp_version: 'v3', snmp_username: '', snmp_auth_protocol: 'SHA256', snmp_privacy_protocol: 'AES', snmp_community: '', snmp_auth_password: '', snmp_privacy_password: '' });
  const [selectedTarget, setSelectedTarget] = useState('');
  const [mrtgTargetId, setMrtgTargetId] = useState('');
  const [syslogSeverity, setSyslogSeverity] = useState('');
  const [syslogTag, setSyslogTag] = useState('');
  const [syslogQ, setSyslogQ] = useState('');
  const [syslogAutoRefresh, setSyslogAutoRefresh] = useState(true);

  const [recipientsText, setRecipientsText] = useState('');
  const [events, setEvents] = useState<string[]>(['network.down', 'network.recovered']);
  const [enabled, setEnabled] = useState(false);
  const [riskAck, setRiskAck] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState('');
  const queryClient = useQueryClient();
  const notify = useNotify();
  const { permissions = [] } = usePermissions();
  const canControlWhatsApp = permissions.includes('platform_admin');
  const targetsQuery = useQuery({ queryKey: ['network', 'monitor-targets'], queryFn: () => apiRequest<Target[]>('/network/monitor-targets?perPage=100') });
  const incidentsQuery = useQuery({ queryKey: ['network', 'monitor-incidents'], queryFn: () => apiRequest<Array<Record<string, unknown>>>('/network/monitor-incidents?perPage=20') });
  const samplesQuery = useQuery({ queryKey: ['network', 'samples', selectedTarget], queryFn: () => apiRequest<Sample[]>(`/network/monitor-targets/${selectedTarget}/samples?perPage=12`), enabled: Boolean(selectedTarget) });
  const waQuery = useQuery({ queryKey: ['notifications', 'whatsapp'], queryFn: () => apiRequest<NotifySettings>('/system/notifications/whatsapp'), enabled: tab === 3, refetchInterval: tab === 3 ? 3000 : false });
  const outboxQuery = useQuery({ queryKey: ['notifications', 'outbox'], queryFn: () => apiRequest<OutboxItem[]>('/system/notifications/outbox?perPage=10'), enabled: tab === 3, refetchInterval: tab === 3 ? 10000 : false });
  const settings = waQuery.data;
  const settingsLoaded = settings !== undefined;
  const whatsappEnabled = settings?.whatsapp_enabled ?? false;
  const riskAcknowledgedAt = settings?.risk_acknowledged_at ?? '';
  const recipientsSignature = (settings?.recipients ?? []).join(',');
  const eventsSignature = (settings?.events ?? []).join(',');
  React.useEffect(() => {
    if (!settingsLoaded) return;
    const configuredRecipients = recipientsSignature ? recipientsSignature.split(',') : [];
    const configuredEvents = eventsSignature ? eventsSignature.split(',') : [];
    setEnabled(whatsappEnabled);
    setRiskAck(Boolean(riskAcknowledgedAt));
    setRecipientsText(configuredRecipients.join(', '));
    setEvents(configuredEvents);
    setSelectedRecipient(current => configuredRecipients.includes(current) ? current : configuredRecipients[0] ?? '');
  }, [settingsLoaded, whatsappEnabled, riskAcknowledgedAt, recipientsSignature, eventsSignature]);
  const targets = targetsQuery.data ?? [];
  const samples = samplesQuery.data ?? [];
  const incidents = incidentsQuery.data ?? [];
  const outboxItems = outboxQuery.data ?? [];
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ['network'] }); await queryClient.invalidateQueries({ queryKey: ['notifications'] }); };
  const mutation = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body?: unknown }) => apiRequest(path, { method, body: body === undefined ? undefined : JSON.stringify(body) }),
    onSuccess: async () => { await refresh(); notify('Operation completed', { type: 'success' }); },
    onError: (error: Error) => notify(error.message || 'Operation failed', { type: 'error' }),
  });
  const saveNotify = () => mutation.mutate({ path: '/system/notifications/whatsapp', method: 'PUT', body: { whatsapp_enabled: enabled, risk_acknowledged: riskAck, recipients: recipientsText.split(/[\s,;]+/).filter(Boolean), events } });
  const addTarget = () => mutation.mutate({ path: '/network/monitor-targets', method: 'POST', body: form });
  const statusColor = (status: string) => status === 'up' ? 'success' : status === 'down' ? 'error' : status === 'paused' ? 'default' : 'info';

  const upTargets = targets.filter(x => x.enabled && x.last_status === 'up');
  const downTargets = targets.filter(x => x.enabled && x.last_status === 'down');
  const pausedTargets = targets.filter(x => !x.enabled || x.last_status === 'paused');
  const anyDown = downTargets.length > 0;
  const activeTargets = targets.filter(t => t.enabled);
  const avgUptime = activeTargets.length > 0
    ? activeTargets.reduce((acc, t) => acc + (t.uptime_percent ?? 100), 0) / activeTargets.length
    : 100;

  return (
    <Box sx={{ p: { xs: 1.5, md: 2.5 }, maxWidth: 1600, mx: 'auto' }}>
      <PageHeader
        section="Network / Telemetry"
        title="Operations & Alerts"
        subtitle="Uptime monitoring, live heartbeat history, MRTG bandwidth telemetry, embedded syslog, and WhatsApp dispatch."
        actions={
          <Button
            size="small"
            variant="outlined"
            startIcon={<Refresh />}
            onClick={() => {
              void targetsQuery.refetch();
              void incidentsQuery.refetch();
            }}
            disabled={targetsQuery.isFetching}
          >
            Refresh
          </Button>
        }
      />

      <KpiStrip>
        <KpiTile label="Monitored Targets" value={targets.length} icon={<Sensors fontSize="small" />} />
        <KpiTile label="Operational (Up)" value={upTargets.length} tone="success" hint="Passing health check" />
        <KpiTile label="Failing (Down)" value={downTargets.length} tone={anyDown ? 'error' : 'success'} hint={anyDown ? 'Incidents open' : 'No alerts'} />
        <KpiTile label="Average Uptime" value={`${avgUptime.toFixed(1)}%`} tone={avgUptime < 99 ? 'warning' : 'success'} hint="Active fleet" />
        <KpiTile label="Paused" value={pausedTargets.length} tone="info" hint="Monitoring suspended" />
        <KpiTile label="Active Alerts" value={incidents.filter((i) => i.status === 'firing').length} tone={incidents.some((i) => i.status === 'firing') ? 'error' : 'success'} hint="Firing incidents" />
      </KpiStrip>

      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}>
        <Tab icon={<NetworkCheck/>} iconPosition="start" label="Network Monitoring" />
        <Tab icon={<ShowChart/>} iconPosition="start" label="Interface Traffic (MRTG)" />
        <Tab icon={<Dns/>} iconPosition="start" label="Syslog Stream" />
        <Tab icon={<NotificationsActive/>} iconPosition="start" label="WhatsApp Alerts" />
      </Tabs>

    {tab === 0 && <Stack spacing={2.5}>
      {(targetsQuery.isError || incidentsQuery.isError) && <Alert severity="error">Network monitoring data could not be loaded. Check the server connection and try again.</Alert>}

      {/* Kuma-style System Health Status Banner */}
      {targets.length > 0 && (
        <Card
          variant="outlined"
          sx={{
            p: 2.25,
            borderRadius: 1.5,
            borderLeft: 6,
            borderColor: anyDown ? 'error.main' : 'success.main',
            bgcolor: anyDown ? 'rgba(239, 68, 68, 0.08)' : 'rgba(34, 197, 94, 0.08)',
          }}
        >
          <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
            <Stack direction="row" alignItems="center" spacing={2}>
              {anyDown ? (
                <ErrorOutline color="error" sx={{ fontSize: 36 }} />
              ) : (
                <CheckCircle color="success" sx={{ fontSize: 36 }} />
              )}
              <Box>
                <Typography variant="h6" fontWeight={800}>
                  {anyDown ? `${downTargets.length} Incident(s) Detected` : 'All Monitored Targets Operational'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {anyDown
                    ? `${downTargets.map(t => t.name).join(', ')} currently failing health checks.`
                    : `All ${activeTargets.length} active devices responding within acceptable thresholds.`}
                </Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={3} alignItems="center">
              <Box textAlign="right">
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
                  Average Uptime
                </Typography>
                <Typography variant="h5" fontWeight={800} color={avgUptime < 99 ? 'warning.main' : 'success.main'}>
                  {avgUptime.toFixed(1)}%
                </Typography>
              </Box>
            </Stack>
          </Stack>
        </Card>
      )}

      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
            <Box>
              <Typography variant="h6" fontWeight={700}>Monitored Targets</Typography>
              <Typography variant="body2" color="text.secondary">
                Read-only ICMP, TCP, HTTP, and SNMP health checks with continuous heartbeat tracking.
              </Typography>
            </Box>
            <Button startIcon={<Refresh/>} variant="outlined" size="small" onClick={() => void refresh()}>
              Refresh
            </Button>
          </Stack>

          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ my: 2 }}>
            <Chip label={`${targets.length} targets`} variant="outlined" />
            <Chip label={`${upTargets.length} online`} color="success" />
            <Chip label={`${downTargets.length} down`} color={downTargets.length > 0 ? 'error' : 'default'} />
            <Chip label={`${pausedTargets.length} paused`} color={pausedTargets.length > 0 ? 'warning' : 'default'} />
            <Chip label={`${incidents.length} recent incidents`} />
          </Stack>

          {targetsQuery.isLoading && <LinearProgress sx={{ my: 2 }} />}
          {!targetsQuery.isLoading && targets.length === 0 && (
            <Alert severity="info" sx={{ mt: 1 }}>
              No network targets are registered yet. Add an explicitly approved device below to begin uptime monitoring.
            </Alert>
          )}

          {/* Kuma-style Target Cards List */}
          <Stack spacing={1.75}>
            {targets.map(target => {
              const isPaused = !target.enabled || target.last_status === 'paused';
              const isUp = target.enabled && target.last_status === 'up';
              const isDown = target.enabled && target.last_status === 'down';
              const dotColor = isPaused ? '#9ca3af' : isUp ? '#22c55e' : isDown ? '#ef4444' : '#38bdf8';

              return (
                <Card
                  key={target.id}
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 1,
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    '&:hover': { borderColor: 'primary.main', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
                  }}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5}>
                    {/* Identity & Status */}
                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 260, flex: '1 1 300px' }}>
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          bgcolor: dotColor,
                          boxShadow: `0 0 6px ${dotColor}`,
                          flexShrink: 0,
                        }}
                      />
                      <Box>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Typography fontWeight={700} variant="subtitle1">
                            {target.name}
                          </Typography>
                          <Chip
                            size="small"
                            color={statusColor(target.last_status)}
                            label={target.last_status.toUpperCase()}
                            sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }}
                          />
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {target.address} · {target.kind.toUpperCase()} · {target.probe_type.toUpperCase()}{target.probe_type !== 'icmp' ? `:${target.port}` : ''}
                        </Typography>
                      </Box>
                    </Stack>

                    {/* Performance Chips */}
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Chip
                        size="small"
                        color={target.uptime_percent !== undefined && target.uptime_percent < 99 ? 'warning' : 'success'}
                        variant={target.uptime_percent !== undefined && target.uptime_percent < 99 ? 'filled' : 'outlined'}
                        label={`${(target.uptime_percent ?? 100).toFixed(1)}% Uptime`}
                        sx={{ fontWeight: 700 }}
                      />
                      <Chip size="small" variant="outlined" label={`${target.last_latency_milliseconds} ms`} />
                      <Chip size="small" variant="outlined" label={`${target.last_packet_loss_percent.toFixed(0)}% loss`} />
                      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 100 }}>
                        {target.last_checked_at ? new Date(target.last_checked_at).toLocaleTimeString() : 'Not checked'}
                      </Typography>
                    </Stack>

                    {/* Actions */}
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Tooltip title={target.enabled ? 'Pause monitoring' : 'Resume monitoring'}>
                        <Button
                          size="small"
                          variant="outlined"
                          color={target.enabled ? 'inherit' : 'primary'}
                          startIcon={target.enabled ? <Pause sx={{ fontSize: 16 }} /> : <PlayArrow sx={{ fontSize: 16 }} />}
                          onClick={() => mutation.mutate({ path: `/network/monitor-targets/${target.id}/toggle`, method: 'POST' })}
                        >
                          {target.enabled ? 'Pause' : 'Resume'}
                        </Button>
                      </Tooltip>
                      <Button
                        size="small"
                        disabled={!target.enabled}
                        onClick={() => mutation.mutate({ path: `/network/monitor-targets/${target.id}/check`, method: 'POST' })}
                      >
                        Check now
                      </Button>
                      <Button
                        size="small"
                        color={selectedTarget === target.id ? 'primary' : 'inherit'}
                        onClick={() => setSelectedTarget(selectedTarget === target.id ? '' : target.id)}
                      >
                        {selectedTarget === target.id ? 'Hide history' : 'History'}
                      </Button>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => {
                          if (window.confirm(`Remove ${target.name} and its history?`)) {
                            mutation.mutate({ path: `/network/monitor-targets/${target.id}`, method: 'DELETE' });
                          }
                        }}
                      >
                        <DeleteOutline fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Stack>

                  {/* Kuma Horizontal Heartbeat Bar */}
                  <KumaHeartbeatBar heartbeats={target.heartbeats} enabled={target.enabled} />

                  {/* Error banner if last check failed */}
                  {target.last_error && target.enabled && (
                    <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1, fontStyle: 'italic' }}>
                      Last failure: {target.last_error}
                    </Typography>
                  )}
                </Card>
              );
            })}
          </Stack>

          {/* Expanded Target Details (History & SNMP Counters) */}
          {selectedTarget && (
            <Box sx={{ mt: 2.5, p: 2, borderRadius: 1, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle1" fontWeight={700}>Latency and Reachability History</Typography>
              <Typography variant="caption" color="text.secondary">Detailed check distribution and reachability samples.</Typography>
              {samplesQuery.isLoading ? <LinearProgress sx={{ mt: 1 }} /> : null}
              {samplesQuery.isError && <Alert severity="error" sx={{ mt: 1 }}>History could not be loaded.</Alert>}
              {!samplesQuery.isLoading && samples.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No checks recorded yet.</Typography>
              )}
              {samples.length > 0 && <SampleTrend samples={samples} />}

              {samples.slice(0, 1).map(sample => {
                const ifaces = parseInterfaces(sample.interface_metrics_json).slice(0, 24);
                return ifaces.length ? (
                  <Box sx={{ mt: 2 }} key={sample.id}>
                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Interface Counters · Latest SNMP Poll</Typography>
                    <Box sx={{ overflowX: 'auto' }}>
                      <Table size="small" aria-label="Latest interface counters">
                        <TableHead>
                          <TableRow>
                            <TableCell>Interface</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell align="right">Received</TableCell>
                            <TableCell align="right">Sent</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {ifaces.map(iface => (
                            <TableRow key={iface.index} hover>
                              <TableCell>{iface.name || `if${iface.index}`}</TableCell>
                              <TableCell>
                                <Chip size="small" label={iface.operational || 'unknown'} color={iface.operational === 'up' ? 'success' : 'default'} />
                              </TableCell>
                              <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatBytes(iface.in_octets)}</TableCell>
                              <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatBytes(iface.out_octets)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Box>
                  </Box>
                ) : null;
              })}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Add Target Form Card */}
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>Add New Monitor Target</Typography>
          <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" alignItems="center">
            <TextField size="small" label="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <TextField size="small" label="IP address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            <TextField size="small" select label="Type" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
              {['router','switch','server','nas','other'].map(x => <MenuItem key={x} value={x}>{x.toUpperCase()}</MenuItem>)}
            </TextField>
            <TextField size="small" select label="Probe" value={form.probe_type} onChange={e => setForm({ ...form, probe_type: e.target.value })}>
              {['icmp','tcp','http','snmp'].map(x => <MenuItem key={x} value={x}>{x.toUpperCase()}</MenuItem>)}
            </TextField>
            {form.probe_type === 'tcp' && (
              <TextField size="small" type="number" label="TCP Port" value={form.port} onChange={e => setForm({ ...form, port: Number(e.target.value) })} />
            )}
            {form.probe_type === 'http' && (
              <TextField size="small" type="number" label="HTTP/HTTPS Port" value={form.port || 80} onChange={e => setForm({ ...form, port: Number(e.target.value) })} helperText="80 for HTTP, 443 for HTTPS" />
            )}
            {form.probe_type === 'snmp' && <>
              <TextField size="small" select label="SNMP Version" value={form.snmp_version} onChange={e => setForm({ ...form, snmp_version: e.target.value })}>
                <MenuItem value="v3">SNMPv3 authPriv</MenuItem>
                <MenuItem value="v2c">SNMPv2c</MenuItem>
              </TextField>
              <TextField size="small" type="number" label="UDP Port" value={form.port || 161} onChange={e => setForm({ ...form, port: Number(e.target.value) })} />
              {form.snmp_version === 'v2c' ? (
                <TextField size="small" type="password" label="Community" value={form.snmp_community} onChange={e => setForm({ ...form, snmp_community: e.target.value })} />
              ) : <>
                <TextField size="small" label="Username" value={form.snmp_username} onChange={e => setForm({ ...form, snmp_username: e.target.value })} />
                <TextField size="small" select label="Auth" value={form.snmp_auth_protocol} onChange={e => setForm({ ...form, snmp_auth_protocol: e.target.value })}>
                  {['SHA256','SHA','SHA384','SHA512','MD5'].map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}
                </TextField>
                <TextField size="small" type="password" label="Auth Password" value={form.snmp_auth_password} onChange={e => setForm({ ...form, snmp_auth_password: e.target.value })} />
                <TextField size="small" select label="Privacy" value={form.snmp_privacy_protocol} onChange={e => setForm({ ...form, snmp_privacy_protocol: e.target.value })}>
                  {['AES','AES192','AES256','DES'].map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}
                </TextField>
                <TextField size="small" type="password" label="Privacy Password" value={form.snmp_privacy_password} onChange={e => setForm({ ...form, snmp_privacy_password: e.target.value })} />
              </>}
            </>}
            <TextField size="small" type="number" label="Interval (sec)" value={form.interval_seconds} inputProps={{ min: 30, max: 3600 }} onChange={e => setForm({ ...form, interval_seconds: Number(e.target.value) })} />
            <Button variant="contained" startIcon={<Add/>} onClick={addTarget} disabled={!form.name || !form.address}>
              Add Target
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Alert severity="info">
        SNMP checks are read-only. Credentials are encrypted at rest with the application secret and are write-only in this interface.
      </Alert>

      {/* Incidents Card */}
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>Recent Incident History</Typography>
          {incidentsQuery.isLoading ? (
            <LinearProgress />
          ) : incidents.length === 0 ? (
            <Typography color="text.secondary">No incidents recorded. All targets have been stable.</Typography>
          ) : (
            incidents.map((incident, i) => (
              <Box key={String(incident.id ?? i)} sx={{ py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Chip
                    size="small"
                    color={incident.resolved_at ? 'success' : 'error'}
                    label={incident.resolved_at ? 'RESOLVED' : 'ONGOING'}
                    sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }}
                  />
                  <Typography fontWeight={600}>{String(incident.summary ?? '')}</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Started: {new Date(String(incident.started_at)).toLocaleString()} · {incident.resolved_at ? `Resolved: ${new Date(String(incident.resolved_at)).toLocaleString()}` : 'Still unresolved'}
                </Typography>
              </Box>
            ))
          )}
        </CardContent>
      </Card>
    </Stack>}

    {/* Tab 1: MRTG Interface Telemetry Graph */}
    {tab === 1 && (
      <Stack spacing={2.5}>
        <Card variant="outlined" sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" justifyContent="space-between">
            <Box>
              <Typography variant="h6" fontWeight={800}>Target Router / Device</Typography>
              <Typography variant="caption" color="text.secondary">Select an SNMP-enabled target to inspect per-interface bandwidth rates.</Typography>
            </Box>
            <TextField
              select
              size="small"
              sx={{ minWidth: 260 }}
              label="Monitored Device"
              value={mrtgTargetId || (targets[0]?.id ?? '')}
              onChange={(e) => setMrtgTargetId(e.target.value)}
            >
              {targets.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name} ({t.address}) — {t.probe_type.toUpperCase()}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </Card>

        {targets.length > 0 ? (
          <MrtgTrafficGraph
            endpoint={`/network/monitor-targets/${mrtgTargetId || targets[0].id}/traffic`}
            showInterfaceSelector
            title={`Router Interface MRTG: ${targets.find(t => t.id === (mrtgTargetId || targets[0].id))?.name || 'Device'}`}
          />
        ) : (
          <Alert severity="info">No monitored targets available. Add a target with probe type SNMP in the Network Monitoring tab first.</Alert>
        )}
      </Stack>
    )}

    {/* Tab 2: Syslog Stream */}
    {tab === 2 && (
      <SyslogPanel
        severity={syslogSeverity}
        setSeverity={setSyslogSeverity}
        tag={syslogTag}
        setTag={setSyslogTag}
        q={syslogQ}
        setQ={setSyslogQ}
        autoRefresh={syslogAutoRefresh}
        setAutoRefresh={setSyslogAutoRefresh}
      />
    )}

    {/* Tab 3: WhatsApp Alerts */}
    {tab === 3 && <Stack spacing={2}>
      <Alert severity="warning">WhatsApp Web automation uses the unofficial whatsmeow library. Use only an operator-controlled account, keep this optional, and review WhatsApp terms and operational risks before pairing. Official Cloud API can be preferred for production messaging.</Alert>
      <Card variant="outlined"><CardContent><Stack direction="row" alignItems="center" spacing={1}><NotificationsActive color="primary"/><Typography variant="h6">Operator delivery settings</Typography></Stack>
        <FormControlLabel sx={{ mt: 1 }} control={<Switch checked={enabled} onChange={e => setEnabled(e.target.checked)}/>} label="Enable WhatsApp alerts"/>
        <FormControlLabel control={<Switch checked={riskAck} onChange={e => setRiskAck(e.target.checked)}/>} label="I understand this uses an unofficial WhatsApp Web integration and accept account/policy risks"/>
        <TextField fullWidth sx={{ mt: 1 }} label="Allowlisted operator numbers (international format)" helperText="Comma or space separated; only these individual numbers receive alerts." value={recipientsText} onChange={e => setRecipientsText(e.target.value)}/>
        <Typography variant="subtitle2" sx={{ mt: 2 }}>Alert events</Typography><Stack direction="row" useFlexGap flexWrap="wrap">{eventOptions.map(([value, label]) => <FormControlLabel key={value} control={<Switch size="small" checked={events.includes(value)} onChange={e => setEvents(prev => e.target.checked ? [...prev, value] : prev.filter(x => x !== value))}/>} label={label}/>)}</Stack>
        <Button variant="contained" onClick={saveNotify} disabled={mutation.isPending}>Save settings</Button>
      </CardContent></Card>
      <Card variant="outlined"><CardContent><Stack direction="row" spacing={1} alignItems="center"><QrCode2 color="primary"/><Typography variant="h6">Device pairing</Typography><Chip size="small" label={settings?.whatsapp.state ?? 'loading'} color={settings?.whatsapp.logged_in ? 'success' : 'default'}/></Stack>
        {!canControlWhatsApp && <Alert severity="info" sx={{ mt: 1 }}>WhatsApp device pairing is managed by the platform administrator. Tenant notification recipients and events remain configured here.</Alert>}
        {settings?.whatsapp.account && <Typography variant="body2" sx={{ mt: 1 }}>Linked account: {settings.whatsapp.account}</Typography>}
        {settings?.whatsapp.qr_image && <Box component="img" src={settings.whatsapp.qr_image} alt="WhatsApp pairing QR code" sx={{ display: 'block', width: 260, maxWidth: '100%', my: 2, bgcolor: 'white', p: 1, borderRadius: 1 }}/ >}
        {settings?.whatsapp.qr_expires && <Typography variant="caption">QR expires {new Date(settings.whatsapp.qr_expires).toLocaleTimeString()}</Typography>}
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}><Button variant="outlined" startIcon={<QrCode2/>} disabled={!canControlWhatsApp || !enabled || !riskAck || mutation.isPending} onClick={() => mutation.mutate({ path: '/system/notifications/whatsapp/pair', method: 'POST' })}>Start pairing</Button><Button color="error" disabled={!canControlWhatsApp || mutation.isPending} onClick={() => mutation.mutate({ path: '/system/notifications/whatsapp/disconnect', method: 'POST' })}>Unlink device</Button><Button startIcon={<Send/>} disabled={!selectedRecipient} onClick={() => mutation.mutate({ path: '/system/notifications/whatsapp/test', method: 'POST', body: { recipient: selectedRecipient } })}>Send test</Button></Stack>
        {settings?.recipients?.length ? <TextField select size="small" sx={{ mt: 2, minWidth: 260 }} label="Test recipient" value={selectedRecipient} onChange={e => setSelectedRecipient(e.target.value)}>{settings.recipients.map(number => <MenuItem key={number} value={number}>{number}</MenuItem>)}</TextField> : <Alert severity="info" sx={{ mt: 2 }}>Save at least one allowlisted operator number before pairing.</Alert>}
      </CardContent></Card>
      <Card variant="outlined"><CardContent><Typography variant="h6" sx={{ mb: 1 }}>Recent delivery history</Typography>{outboxItems.length === 0 ? <Typography color="text.secondary">No alert deliveries yet.</Typography> : <Stack spacing={0.75}>{outboxItems.map(item => <Box key={item.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}><Chip size="small" label={item.status.toUpperCase()} color={item.status === 'sent' ? 'success' : item.status === 'failed' ? 'error' : 'default'}/><Typography variant="body2" sx={{ flex: '1 1 160px' }}>{item.event_type} → {item.recipient}</Typography><Typography variant="caption" color="text.secondary">{item.sent_at ? `Sent ${new Date(item.sent_at).toLocaleString()}` : `${item.attempts} attempts · ${new Date(item.created_at).toLocaleString()}`}</Typography>{item.last_error && <Typography variant="caption" color="error.main">{item.last_error}</Typography>}</Box>)}</Stack>}</CardContent></Card>
      <Divider/><Typography variant="caption" color="text.secondary">Delivery queue is persistent, deduplicated, and retried with bounded backoff. Messages include operational metadata only.</Typography>
    </Stack>}
  </Box>
  );
};

interface SyslogEventItem {
  id: string;
  nas_ip: string;
  facility: number;
  severity: number;
  severity_name: string;
  tag: string;
  message: string;
  created_at: string;
}

const SyslogPanel = ({
  severity,
  setSeverity,
  tag,
  setTag,
  q,
  setQ,
  autoRefresh,
  setAutoRefresh,
}: {
  severity: string;
  setSeverity: (s: string) => void;
  tag: string;
  setTag: (t: string) => void;
  q: string;
  setQ: (q: string) => void;
  autoRefresh: boolean;
  setAutoRefresh: (b: boolean | ((p: boolean) => boolean)) => void;
}) => {
  const notify = useNotify();
  const query = useQuery({
    queryKey: ['syslog', severity, tag, q],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (severity !== '') params.set('severity', severity);
      if (tag.trim()) params.set('tag', tag.trim());
      if (q.trim()) params.set('q', q.trim());
      params.set('perPage', '50');
      const res = await apiRequest<unknown>(`/network/syslog?${params.toString()}`);
      return extractData<SyslogEventItem[]>(res) ?? [];
    },
    refetchInterval: autoRefresh ? 5000 : false,
  });

  const sendTestLog = useMutation({
    mutationFn: () =>
      apiRequest('/network/syslog/test', {
        method: 'POST',
        body: JSON.stringify({
          nas_ip: '192.168.88.1',
          severity: 6,
          tag: 'pppoe,info',
          message: 'PPPoE session connected: user test01 authenticated via RADIUS',
        }),
      }),
    onSuccess: () => {
      notify('Test syslog event dispatched to UDP collector', { type: 'success' });
      void query.refetch();
    },
    onError: (err: any) => notify(err.message || 'Failed to dispatch test syslog', { type: 'error' }),
  });

  const logs = query.data ?? [];

  const getSeverityChip = (sev: number, name: string) => {
    let color: 'error' | 'warning' | 'info' | 'default' = 'default';
    if (sev <= 3) color = 'error';
    else if (sev === 4) color = 'warning';
    else if (sev <= 6) color = 'info';
    return (
      <Chip
        size="small"
        color={color}
        label={name.toUpperCase()}
        sx={{ fontWeight: 700, fontSize: '0.68rem', height: 20 }}
      />
    );
  };

  return (
    <Stack spacing={2}>
      <Card variant="outlined">
        <CardContent sx={{ p: 2 }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.5}
            alignItems={{ xs: 'stretch', md: 'center' }}
            justifyContent="space-between"
          >
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
              <TextField
                size="small"
                label="Search Messages"
                placeholder="e.g. pppoe, disconnected, timeout..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                sx={{ minWidth: 200 }}
              />
              <TextField
                size="small"
                label="Tag / App"
                placeholder="e.g. pppoe, system"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                sx={{ width: 140 }}
              />
              <TextField
                select
                size="small"
                label="Severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                sx={{ width: 130 }}
              >
                <MenuItem value="">All Severities</MenuItem>
                <MenuItem value="3">Error (3)</MenuItem>
                <MenuItem value="4">Warning (4)</MenuItem>
                <MenuItem value="5">Notice (5)</MenuItem>
                <MenuItem value="6">Info (6)</MenuItem>
                <MenuItem value="7">Debug (7)</MenuItem>
              </TextField>
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
              <Tooltip title={autoRefresh ? 'Live stream active (5s)' : 'Auto-refresh paused'}>
                <Button
                  size="small"
                  variant={autoRefresh ? 'contained' : 'outlined'}
                  color={autoRefresh ? 'primary' : 'inherit'}
                  startIcon={<Speed />}
                  onClick={() => setAutoRefresh((prev) => !prev)}
                >
                  {autoRefresh ? 'Live (5s)' : 'Paused'}
                </Button>
              </Tooltip>

              <Button
                size="small"
                variant="outlined"
                startIcon={<Refresh />}
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
              >
                Refresh
              </Button>

              <Button
                size="small"
                variant="outlined"
                color="secondary"
                startIcon={<Send />}
                onClick={() => sendTestLog.mutate()}
                disabled={sendTestLog.isPending}
              >
                Test Syslog
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Panel
        title="Live Syslog Stream"
        subtitle={`${logs.length} events (UDP collector: 1514)`}
        dense
      >
        {query.isLoading ? (
          <LinearProgress />
        ) : logs.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body1" fontWeight={600}>No syslog events received yet.</Typography>
            <Typography variant="caption">
              Configure your MikroTik router: /system logging add action=remote topics=pppoe,account remote=&lt;server-ip&gt;:1514
            </Typography>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 140 }}>Timestamp</TableCell>
                <TableCell sx={{ width: 130 }}>Device IP</TableCell>
                <TableCell sx={{ width: 100 }}>Severity</TableCell>
                <TableCell sx={{ width: 120 }}>Tag</TableCell>
                <TableCell>Message</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id} hover>
                  <TableCell sx={{ fontSize: '0.78rem' }}>
                    <Mono>{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</Mono>
                  </TableCell>
                  <TableCell>
                    <Mono>{log.nas_ip || '127.0.0.1'}</Mono>
                  </TableCell>
                  <TableCell>
                    {getSeverityChip(log.severity, log.severity_name)}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" variant="outlined" label={log.tag} sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }} />
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}>
                    {log.message}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </Stack>
  );
};

export default OperationsPage;
