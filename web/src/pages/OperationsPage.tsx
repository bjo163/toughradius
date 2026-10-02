import React, { useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, Divider, FormControlLabel,
  LinearProgress, MenuItem, Stack, Switch, Tab, Tabs, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { Add, DeleteOutline, NetworkCheck, NotificationsActive, QrCode2, Refresh, Send } from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotify } from 'react-admin';
import { apiRequest } from '../utils/apiClient';

type Target = { id: string; name: string; kind: string; address: string; probe_type: string; port: number; interval_seconds: number; timeout_milliseconds: number; failure_threshold: number; enabled: boolean; last_status: string; last_latency_milliseconds: number; last_packet_loss_percent: number; last_checked_at?: string; last_error?: string; snmp_secret_configured?: boolean };
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
  const [form, setForm] = useState({ name: '', kind: 'router', address: '', probe_type: 'icmp', port: 161, interval_seconds: 60, timeout_milliseconds: 1500, failure_threshold: 2, enabled: true, snmp_version: 'v3', snmp_username: '', snmp_auth_protocol: 'SHA256', snmp_privacy_protocol: 'AES', snmp_community: '', snmp_auth_password: '', snmp_privacy_password: '' });
  const [selectedTarget, setSelectedTarget] = useState('');
  const [recipientsText, setRecipientsText] = useState('');
  const [events, setEvents] = useState<string[]>(['network.down', 'network.recovered']);
  const [enabled, setEnabled] = useState(false);
  const [riskAck, setRiskAck] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState('');
  const queryClient = useQueryClient();
  const notify = useNotify();
  const targetsQuery = useQuery({ queryKey: ['network', 'monitor-targets'], queryFn: () => apiRequest<Target[]>('/network/monitor-targets?perPage=100') });
  const incidentsQuery = useQuery({ queryKey: ['network', 'monitor-incidents'], queryFn: () => apiRequest<Array<Record<string, unknown>>>('/network/monitor-incidents?perPage=20') });
  const samplesQuery = useQuery({ queryKey: ['network', 'samples', selectedTarget], queryFn: () => apiRequest<Sample[]>(`/network/monitor-targets/${selectedTarget}/samples?perPage=12`), enabled: Boolean(selectedTarget) });
  const waQuery = useQuery({ queryKey: ['notifications', 'whatsapp'], queryFn: () => apiRequest<NotifySettings>('/system/notifications/whatsapp'), enabled: tab === 1, refetchInterval: tab === 1 ? 3000 : false });
  const outboxQuery = useQuery({ queryKey: ['notifications', 'outbox'], queryFn: () => apiRequest<OutboxItem[]>('/system/notifications/outbox?perPage=10'), enabled: tab === 1, refetchInterval: tab === 1 ? 10000 : false });
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
  const mutation = useMutation({ mutationFn: ({ path, method, body }: { path: string; method: string; body?: unknown }) => apiRequest(path, { method, body: body === undefined ? undefined : JSON.stringify(body) }), onSuccess: async () => { await refresh(); notify('Operation completed', { type: 'success' }); }, onError: (error: Error) => notify(error.message || 'Operation failed', { type: 'error' }) });
  const saveNotify = () => mutation.mutate({ path: '/system/notifications/whatsapp', method: 'PUT', body: { whatsapp_enabled: enabled, risk_acknowledged: riskAck, recipients: recipientsText.split(/[\s,;]+/).filter(Boolean), events } });
  const addTarget = () => mutation.mutate({ path: '/network/monitor-targets', method: 'POST', body: form });
  const statusColor = (status: string) => status === 'up' ? 'success' : status === 'down' ? 'error' : 'default';

  return <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1440, mx: 'auto' }}>
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}><NetworkCheck color="primary"/><Typography variant="h4" fontWeight={800}>Operations</Typography><Chip size="small" label="NETWORK · ALERTS" color="success" variant="outlined"/></Stack>
    <Typography color="text.secondary" sx={{ mb: 2 }}>Bounded network health checks and opt-in operator alerts.</Typography>
    <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}><Tab icon={<NetworkCheck/>} iconPosition="start" label="Network monitoring"/><Tab icon={<NotificationsActive/>} iconPosition="start" label="WhatsApp alerts"/></Tabs>

    {tab === 0 && <Stack spacing={2}>
      {(targetsQuery.isError || incidentsQuery.isError) && <Alert severity="error">Network monitoring data could not be loaded. Check the server connection and try again.</Alert>}
      <Card variant="outlined"><CardContent><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="h6">Monitored targets</Typography><Typography variant="body2" color="text.secondary">Only explicitly configured unicast IP addresses are checked. Probes are read-only.</Typography></Box><Button startIcon={<Refresh/>} onClick={() => void refresh()}>Refresh</Button></Stack>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ my: 2 }}>
        <Chip label={`${targets.length} targets`} color="success" variant="outlined"/><Chip label={`${targets.filter(x => x.last_status === 'up').length} online`} color="success"/><Chip label={`${targets.filter(x => x.last_status === 'down').length} down`} color="error"/><Chip label={`${incidents.length} recent incidents`}/>
      </Stack>
      {targetsQuery.isLoading && <LinearProgress />}
      {!targetsQuery.isLoading && targets.length === 0 && <Alert severity="info">No network targets are registered. Add an explicitly approved device below to begin monitoring.</Alert>}
      <Stack spacing={1}>{targets.map(target => <Box key={target.id} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.25 }}>
        <Box sx={{ flex: '1 1 190px' }}><Typography fontWeight={700}>{target.name}</Typography><Typography variant="caption" color="text.secondary">{target.address} · {target.kind} · {target.probe_type.toUpperCase()}{target.probe_type !== 'icmp' ? `:${target.port}` : ''}</Typography></Box>
        <Chip size="small" color={statusColor(target.last_status)} label={target.last_status.toUpperCase()}/><Chip size="small" variant="outlined" label={`${target.last_latency_milliseconds} ms`}/><Chip size="small" variant="outlined" label={`${target.last_packet_loss_percent.toFixed(0)}% loss`}/>
        <Typography variant="caption" color="text.secondary">{target.last_checked_at ? new Date(target.last_checked_at).toLocaleString() : 'Not checked'}</Typography>
        <Button size="small" onClick={() => mutation.mutate({ path: `/network/monitor-targets/${target.id}/check`, method: 'POST' })}>Check now</Button>
        <Button size="small" onClick={() => setSelectedTarget(selectedTarget === target.id ? '' : target.id)}>{selectedTarget === target.id ? 'Hide history' : 'History'}</Button>
        <Button size="small" color="error" startIcon={<DeleteOutline/>} onClick={() => { if (window.confirm(`Remove ${target.name} and its history?`)) mutation.mutate({ path: `/network/monitor-targets/${target.id}`, method: 'DELETE' }); }}>Remove</Button>
      </Box>)}</Stack>
      {selectedTarget && <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
        <Typography variant="subtitle2">Latency and packet-loss history</Typography>
        <Typography variant="caption" color="text.secondary">Recent checks · bars are colored by reachability; hover for exact values.</Typography>
        {samplesQuery.isLoading ? <LinearProgress sx={{ mt: 1 }} /> : null}
        {samplesQuery.isError && <Alert severity="error" sx={{ mt: 1 }}>History could not be loaded.</Alert>}
        {!samplesQuery.isLoading && samples.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No checks have been recorded yet.</Typography>}
        {samples.length > 0 && <SampleTrend samples={samples} />}
        {samples.slice(0, 1).map(sample => {
          const ifaces = parseInterfaces(sample.interface_metrics_json).slice(0, 24);
          return ifaces.length ? <Box sx={{ mt: 2 }} key={sample.id}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Interface counters · latest SNMP poll</Typography>
            <Box sx={{ overflowX: 'auto' }}><Table size="small" aria-label="Latest interface counters">
              <TableHead><TableRow><TableCell>Interface</TableCell><TableCell>Status</TableCell><TableCell align="right">Received</TableCell><TableCell align="right">Sent</TableCell></TableRow></TableHead>
              <TableBody>{ifaces.map(iface => <TableRow key={iface.index} hover>
                <TableCell>{iface.name || `if${iface.index}`}</TableCell>
                <TableCell><Chip size="small" label={iface.operational || 'unknown'} color={iface.operational === 'up' ? 'success' : 'default'} /></TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatBytes(iface.in_octets)}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatBytes(iface.out_octets)}</TableCell>
              </TableRow>)}</TableBody>
            </Table></Box>
          </Box> : null;
        })}
      </Box>}
      </CardContent></Card>
      <Card variant="outlined"><CardContent><Typography variant="h6" sx={{ mb: 1.5 }}>Add target</Typography><Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" alignItems="center">
        <TextField size="small" label="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/><TextField size="small" label="Explicit IP address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}/>
        <TextField size="small" select label="Type" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>{['router','switch','server','nas','other'].map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField>
        <TextField size="small" select label="Probe" value={form.probe_type} onChange={e => setForm({ ...form, probe_type: e.target.value })}>{['icmp','tcp','snmp'].map(x => <MenuItem key={x} value={x}>{x.toUpperCase()}</MenuItem>)}</TextField>
        {form.probe_type === 'tcp' && <TextField size="small" type="number" label="TCP port" value={form.port} onChange={e => setForm({ ...form, port: Number(e.target.value) })}/>}
        {form.probe_type === 'snmp' && <>
          <TextField size="small" select label="SNMP version" value={form.snmp_version} onChange={e => setForm({ ...form, snmp_version: e.target.value })}><MenuItem value="v3">SNMPv3 authPriv</MenuItem><MenuItem value="v2c">SNMPv2c</MenuItem></TextField>
          <TextField size="small" type="number" label="UDP port" value={form.port || 161} onChange={e => setForm({ ...form, port: Number(e.target.value) })}/>
          {form.snmp_version === 'v2c' ? <TextField size="small" type="password" label="Community" value={form.snmp_community} onChange={e => setForm({ ...form, snmp_community: e.target.value })}/> : <>
            <TextField size="small" label="Username" value={form.snmp_username} onChange={e => setForm({ ...form, snmp_username: e.target.value })}/>
            <TextField size="small" select label="Auth" value={form.snmp_auth_protocol} onChange={e => setForm({ ...form, snmp_auth_protocol: e.target.value })}>{['SHA256','SHA','SHA384','SHA512','MD5'].map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField>
            <TextField size="small" type="password" label="Auth password" value={form.snmp_auth_password} onChange={e => setForm({ ...form, snmp_auth_password: e.target.value })}/>
            <TextField size="small" select label="Privacy" value={form.snmp_privacy_protocol} onChange={e => setForm({ ...form, snmp_privacy_protocol: e.target.value })}>{['AES','AES192','AES256','DES'].map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField>
            <TextField size="small" type="password" label="Privacy password" value={form.snmp_privacy_password} onChange={e => setForm({ ...form, snmp_privacy_password: e.target.value })}/>
          </>}
        </>}
        <TextField size="small" type="number" label="Interval (sec)" value={form.interval_seconds} inputProps={{ min: 30, max: 3600 }} onChange={e => setForm({ ...form, interval_seconds: Number(e.target.value) })}/>
        <Button variant="contained" startIcon={<Add/>} onClick={addTarget} disabled={!form.name || !form.address}>Add target</Button>
      </Stack></CardContent></Card>
      <Alert severity="info">SNMP checks are read-only. Credentials are encrypted at rest with the application secret and are write-only in this interface; changing that secret makes existing encrypted SNMP credentials unreadable.</Alert>
      <Card variant="outlined"><CardContent><Typography variant="h6" sx={{ mb: 1 }}>Recent incidents</Typography>{incidentsQuery.isLoading ? <LinearProgress /> : incidents.length === 0 ? <Typography color="text.secondary">No incidents recorded.</Typography> : incidents.map((incident, i) => <Box key={String(incident.id ?? i)} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}><Typography>{String(incident.summary ?? '')}</Typography><Typography variant="caption" color="text.secondary">{new Date(String(incident.started_at)).toLocaleString()} · {incident.resolved_at ? `Resolved ${new Date(String(incident.resolved_at)).toLocaleString()}` : 'Open'}</Typography></Box>)}</CardContent></Card>
    </Stack>}

    {tab === 1 && <Stack spacing={2}>
      <Alert severity="warning">WhatsApp Web automation uses the unofficial whatsmeow library. Use only an operator-controlled account, keep this optional, and review WhatsApp terms and operational risks before pairing. Official Cloud API can be preferred for production messaging.</Alert>
      <Card variant="outlined"><CardContent><Stack direction="row" alignItems="center" spacing={1}><NotificationsActive color="primary"/><Typography variant="h6">Operator delivery settings</Typography></Stack>
        <FormControlLabel sx={{ mt: 1 }} control={<Switch checked={enabled} onChange={e => setEnabled(e.target.checked)}/>} label="Enable WhatsApp alerts"/>
        <FormControlLabel control={<Switch checked={riskAck} onChange={e => setRiskAck(e.target.checked)}/>} label="I understand this uses an unofficial WhatsApp Web integration and accept account/policy risks"/>
        <TextField fullWidth sx={{ mt: 1 }} label="Allowlisted operator numbers (international format)" helperText="Comma or space separated; only these individual numbers receive alerts." value={recipientsText} onChange={e => setRecipientsText(e.target.value)}/>
        <Typography variant="subtitle2" sx={{ mt: 2 }}>Alert events</Typography><Stack direction="row" useFlexGap flexWrap="wrap">{eventOptions.map(([value, label]) => <FormControlLabel key={value} control={<Switch size="small" checked={events.includes(value)} onChange={e => setEvents(prev => e.target.checked ? [...prev, value] : prev.filter(x => x !== value))}/>} label={label}/>)}</Stack>
        <Button variant="contained" onClick={saveNotify} disabled={mutation.isPending}>Save settings</Button>
      </CardContent></Card>
      <Card variant="outlined"><CardContent><Stack direction="row" spacing={1} alignItems="center"><QrCode2 color="primary"/><Typography variant="h6">Device pairing</Typography><Chip size="small" label={settings?.whatsapp.state ?? 'loading'} color={settings?.whatsapp.logged_in ? 'success' : 'default'}/></Stack>
        {settings?.whatsapp.account && <Typography variant="body2" sx={{ mt: 1 }}>Linked account: {settings.whatsapp.account}</Typography>}
        {settings?.whatsapp.qr_image && <Box component="img" src={settings.whatsapp.qr_image} alt="WhatsApp pairing QR code" sx={{ display: 'block', width: 260, maxWidth: '100%', my: 2, bgcolor: 'white', p: 1, borderRadius: 1 }}/ >}
        {settings?.whatsapp.qr_expires && <Typography variant="caption">QR expires {new Date(settings.whatsapp.qr_expires).toLocaleTimeString()}</Typography>}
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}><Button variant="outlined" startIcon={<QrCode2/>} disabled={!enabled || !riskAck || mutation.isPending} onClick={() => mutation.mutate({ path: '/system/notifications/whatsapp/pair', method: 'POST' })}>Start pairing</Button><Button color="error" onClick={() => mutation.mutate({ path: '/system/notifications/whatsapp/disconnect', method: 'POST' })}>Unlink device</Button><Button startIcon={<Send/>} disabled={!selectedRecipient} onClick={() => mutation.mutate({ path: '/system/notifications/whatsapp/test', method: 'POST', body: { recipient: selectedRecipient } })}>Send test</Button></Stack>
        {settings?.recipients?.length ? <TextField select size="small" sx={{ mt: 2, minWidth: 260 }} label="Test recipient" value={selectedRecipient} onChange={e => setSelectedRecipient(e.target.value)}>{settings.recipients.map(number => <MenuItem key={number} value={number}>{number}</MenuItem>)}</TextField> : <Alert severity="info" sx={{ mt: 2 }}>Save at least one allowlisted operator number before pairing.</Alert>}
      </CardContent></Card>
      <Card variant="outlined"><CardContent><Typography variant="h6" sx={{ mb: 1 }}>Recent delivery history</Typography>{outboxItems.length === 0 ? <Typography color="text.secondary">No alert deliveries yet.</Typography> : <Stack spacing={0.75}>{outboxItems.map(item => <Box key={item.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}><Chip size="small" label={item.status.toUpperCase()} color={item.status === 'sent' ? 'success' : item.status === 'failed' ? 'error' : 'default'}/><Typography variant="body2" sx={{ flex: '1 1 160px' }}>{item.event_type} → {item.recipient}</Typography><Typography variant="caption" color="text.secondary">{item.sent_at ? `Sent ${new Date(item.sent_at).toLocaleString()}` : `${item.attempts} attempts · ${new Date(item.created_at).toLocaleString()}`}</Typography>{item.last_error && <Typography variant="caption" color="error.main">{item.last_error}</Typography>}</Box>)}</Stack>}</CardContent></Card>
      <Divider/><Typography variant="caption" color="text.secondary">Delivery queue is persistent, deduplicated, and retried with bounded backoff. Messages include operational metadata only.</Typography>
    </Stack>}
  </Box>;
};

export default OperationsPage;
