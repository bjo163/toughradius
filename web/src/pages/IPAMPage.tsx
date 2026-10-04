import React, { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {
  AccountTree,
  Add,
  History,
  NetworkCheck,
  PlayArrow,
  Search,
} from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotify } from 'react-admin';
import { apiRequest, extractData } from '../utils/apiClient';
import { ConsoleBox, KpiStrip, KpiTile, Mono, PageHeader, Panel, StatusChip } from '../components/Enterprise';

interface IPAMPool {
  id: string;
  name: string;
  cidr: string;
  ip_version: number;
  pool_type: string;
  gateway: string;
  dns_primary: string;
  dns_secondary: string;
  total_ips: number;
  used_ips: number;
  description: string;
  created_at: string;
}

interface AuditRecord {
  type: string;
  username: string;
  acct_session_id: string;
  nas_addr: string;
  framed_ip: string;
  mac_addr: string;
  start_time: string;
  stop_time?: string;
  session_time?: number;
  status: string;
}

interface AuditResponse {
  queried_ip: string;
  queried_time: string;
  total_found: number;
  results: AuditRecord[];
}

interface PingResponse {
  host: string;
  sent: number;
  received: number;
  loss_percent: number;
  min_rtt_ms: number;
  avg_rtt_ms: number;
  max_rtt_ms: number;
  details: Array<{ seq: number; rtt_ms: number; success: boolean; error?: string }>;
}

export const IPAMPage: React.FC = () => {
  const notify = useNotify();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<number>(0);
  const [createOpen, setCreateOpen] = useState<boolean>(false);

  // Pool form
  const [poolForm, setPoolForm] = useState({
    name: 'PPPoE Client Subnet 1',
    cidr: '100.64.0.0/22',
    pool_type: 'cgnat',
    gateway: '100.64.0.1',
    dns_primary: '1.1.1.1',
    dns_secondary: '8.8.8.8',
    description: 'CGNAT allocation pool for residential subscribers',
  });

  // Audit state
  const [auditIP, setAuditIP] = useState<string>('100.64.0.15');
  const [auditTime, setAuditTime] = useState<string>(new Date().toISOString().slice(0, 16));

  // Ping state
  const [pingHost, setPingHost] = useState<string>('8.8.8.8');
  const [pingCount, setPingCount] = useState<number>(4);

  const poolsQuery = useQuery({
    queryKey: ['network', 'ipam', 'pools'],
    queryFn: async () => {
      const res = await apiRequest<unknown>('/network/ipam/pools');
      return extractData<IPAMPool[]>(res) ?? [];
    },
  });

  const createPoolMutation = useMutation({
    mutationFn: () =>
      apiRequest('/network/ipam/pools', {
        method: 'POST',
        body: JSON.stringify(poolForm),
      }),
    onSuccess: () => {
      notify('IPAM subnet pool created', { type: 'success' });
      setCreateOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['network', 'ipam', 'pools'] });
    },
    onError: (err: any) => notify(err.message || 'Failed to create pool', { type: 'error' }),
  });

  const auditMutation = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams();
      params.set('ip', auditIP.trim());
      if (auditTime) params.set('at', new Date(auditTime).toISOString());
      const res = await apiRequest<unknown>(`/network/ipam/audit?${params.toString()}`);
      return extractData<AuditResponse>(res);
    },
  });

  const pingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest<unknown>('/network/diagnostics/ping', {
        method: 'POST',
        body: JSON.stringify({ host: pingHost.trim(), count: Number(pingCount) }),
      });
      return extractData<PingResponse>(res);
    },
  });

  const pools = poolsQuery.data ?? [];
  const auditResults = auditMutation.data?.results ?? [];
  const pingResult = pingMutation.data;
  const totalIps = pools.reduce((acc, p) => acc + (p.total_ips || 0), 0);
  const usedIps = pools.reduce((acc, p) => acc + (p.used_ips || 0), 0);
  const overallUtil = totalIps > 0 ? Math.round((usedIps / totalIps) * 100) : 0;
  const criticalPools = pools.filter((p) => {
    const tot = p.total_ips || 1;
    return ((p.used_ips || 0) / tot) >= 0.85;
  }).length;

  return (
    <Box sx={{ p: { xs: 1.5, md: 2.5 }, maxWidth: 1600, mx: 'auto' }}>
      <PageHeader
        section="Network / Infrastructure"
        title="IPAM & Subnets"
        subtitle="Subnet pool capacity allocation, reverse IP session audit trail, and live network diagnostic tools."
        actions={
          tab === 0 ? (
            <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>
              Add Subnet Pool
            </Button>
          ) : undefined
        }
      />

      <KpiStrip>
        <KpiTile label="Subnet Pools" value={pools.length} icon={<AccountTree fontSize="small" />} />
        <KpiTile label="Total IPs" value={totalIps.toLocaleString()} tone="info" hint="Managed scope" />
        <KpiTile label="Allocated / Used" value={usedIps.toLocaleString()} tone="primary" hint="Active leases" />
        <KpiTile
          label="Overall Utilization"
          value={`${overallUtil}%`}
          tone={overallUtil > 85 ? 'error' : overallUtil > 65 ? 'warning' : 'success'}
          hint="Aggregate capacity"
        />
        <KpiTile
          label="Near Exhaustion"
          value={criticalPools}
          tone={criticalPools > 0 ? 'error' : 'success'}
          hint="Pools ≥ 85% full"
        />
        <KpiTile label="IPv4 / IPv6" value={`${pools.filter((p) => p.ip_version === 4).length} / ${pools.filter((p) => p.ip_version === 6).length}`} tone="secondary" hint="Address families" />
      </KpiStrip>

      <Tabs value={tab} onChange={(_, val) => setTab(val)} sx={{ mb: 2 }}>
        <Tab icon={<AccountTree />} iconPosition="start" label="Subnet Pools" />
        <Tab icon={<History />} iconPosition="start" label="Reverse IP Audit Trail" />
        <Tab icon={<NetworkCheck />} iconPosition="start" label="Live Diagnostic (Ping)" />
      </Tabs>

      {/* Tab 0: Subnet Pools */}
      {tab === 0 && (
        <Stack spacing={2.5}>
          {poolsQuery.isLoading ? (
            <LinearProgress />
          ) : pools.length === 0 ? (
            <Card variant="outlined">
              <CardContent sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
                <AccountTree sx={{ fontSize: 48, opacity: 0.4, mb: 1 }} />
                <Typography variant="h6">No IPAM Pools Configured</Typography>
                <Typography variant="caption">
                  Add CGNAT, Public IP, or IPv6 prefix pools to track subnet utilization.
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
                gap: 2,
              }}
            >
              {pools.map((p) => {
                const used = p.used_ips || 0;
                const total = p.total_ips || 1;
                const percent = Math.min(100, Math.round((used / total) * 100));
                return (
                  <Card key={p.id} variant="outlined">
                    <CardContent sx={{ p: 2 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                        <Typography variant="subtitle1" fontWeight={700}>
                          {p.name}
                        </Typography>
                        <StatusChip value={p.pool_type} />
                      </Stack>

                      <Typography variant="body2" sx={{ color: 'primary.main', mb: 1.5 }}>
                        <Mono>{p.cidr}</Mono>
                      </Typography>

                      <Box sx={{ mb: 1.5 }}>
                        <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">
                            Utilization
                          </Typography>
                          <Typography variant="caption" fontWeight={700}>
                            {used} / {total} IPs ({percent}%)
                          </Typography>
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={percent}
                          color={percent > 85 ? 'error' : percent > 65 ? 'warning' : 'primary'}
                          sx={{ height: 6, borderRadius: 1 }}
                        />
                      </Box>

                      <Divider sx={{ my: 1 }} />

                      <Stack spacing={0.5} sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                        <div>Gateway: <strong>{p.gateway || '—'}</strong></div>
                        <div>DNS: <strong>{p.dns_primary || '1.1.1.1'}</strong> {p.dns_secondary && `, ${p.dns_secondary}`}</div>
                        {p.description && <div>Note: {p.description}</div>}
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          )}
        </Stack>
      )}

      {/* Tab 1: Reverse IP Audit Trail */}
      {tab === 1 && (
        <Stack spacing={2.5}>
          <Card variant="outlined">
            <CardContent sx={{ p: 2 }}>
              <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 0.5 }}>
                Kominfo / Cyber Crime IP Audit Trace
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                Determine which subscriber or MAC address owned a specific IP at a historic timestamp.
              </Typography>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                <TextField
                  size="small"
                  label="Target IP Address"
                  placeholder="e.g. 100.64.0.15"
                  value={auditIP}
                  onChange={(e) => setAuditIP(e.target.value)}
                  sx={{ minWidth: 220 }}
                />
                <TextField
                  size="small"
                  type="datetime-local"
                  label="Target Timestamp"
                  value={auditTime}
                  onChange={(e) => setAuditTime(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ minWidth: 220 }}
                />
                <Button
                  variant="contained"
                  startIcon={<Search />}
                  disabled={!auditIP || auditMutation.isPending}
                  onClick={() => auditMutation.mutate()}
                >
                  {auditMutation.isPending ? 'Searching...' : 'Trace Subscriber'}
                </Button>
              </Stack>
            </CardContent>
          </Card>

          {auditMutation.isSuccess && (
            <Panel
              title={`Audit Match Results — IP ${auditIP}`}
              subtitle={`Found ${auditResults.length} matching session record(s)`}
              dense
            >
              {auditResults.length === 0 ? (
                <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
                  <Typography>No active or historical session matched this IP at the selected time.</Typography>
                </Box>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Subscriber Username</TableCell>
                      <TableCell>MAC Address</TableCell>
                      <TableCell>NAS Router IP</TableCell>
                      <TableCell>Session Start</TableCell>
                      <TableCell>Session Stop</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {auditResults.map((r, i) => (
                      <TableRow key={i} hover>
                        <TableCell sx={{ color: 'primary.main', fontWeight: 700 }}>
                          <Mono>{r.username}</Mono>
                        </TableCell>
                        <TableCell><Mono>{r.mac_addr || '—'}</Mono></TableCell>
                        <TableCell><Mono>{r.nas_addr}</Mono></TableCell>
                        <TableCell sx={{ fontSize: '0.78rem' }}>{new Date(r.start_time).toLocaleString()}</TableCell>
                        <TableCell sx={{ fontSize: '0.78rem' }}>{r.stop_time ? new Date(r.stop_time).toLocaleString() : 'Currently Active'}</TableCell>
                        <TableCell>
                          <StatusChip value={r.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Panel>
          )}
        </Stack>
      )}

      {/* Tab 2: Live Diagnostic Ping Tool */}
      {tab === 2 && (
        <Stack spacing={2.5}>
          <Card variant="outlined">
            <CardContent sx={{ p: 2 }}>
              <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 0.5 }}>
                Real-Time Reachability Probe (TCP / ICMP Ping)
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                Perform instant packet latency checks directly from the MWX-ISP server to any subscriber, router, or gateway.
              </Typography>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                <TextField
                  size="small"
                  label="Target Host or IP"
                  placeholder="e.g. 192.168.88.1 or 8.8.8.8"
                  value={pingHost}
                  onChange={(e) => setPingHost(e.target.value)}
                  sx={{ minWidth: 260 }}
                />
                <TextField
                  size="small"
                  type="number"
                  label="Count"
                  value={pingCount}
                  onChange={(e) => setPingCount(Number(e.target.value))}
                  inputProps={{ min: 1, max: 10 }}
                  sx={{ width: 90 }}
                />
                <Button
                  variant="contained"
                  startIcon={<PlayArrow />}
                  disabled={!pingHost || pingMutation.isPending}
                  onClick={() => pingMutation.mutate()}
                >
                  {pingMutation.isPending ? 'Probing...' : 'Start Ping'}
                </Button>
              </Stack>
            </CardContent>
          </Card>

          {pingResult && (
            <Panel
              title={`Ping Results — ${pingResult.host}`}
              subtitle={`${pingResult.received}/${pingResult.sent} packets received`}
              actions={
                <Stack direction="row" spacing={2} alignItems="center">
                  <Typography variant="caption" color="text.secondary">LOSS: <strong style={{ color: pingResult.loss_percent > 0 ? '#ef4444' : '#22c55e' }}>{pingResult.loss_percent.toFixed(0)}%</strong></Typography>
                  <Typography variant="caption" color="text.secondary">AVG: <strong>{pingResult.avg_rtt_ms} ms</strong></Typography>
                  <Typography variant="caption" color="text.secondary">MIN/MAX: <strong>{pingResult.min_rtt_ms}/{pingResult.max_rtt_ms} ms</strong></Typography>
                </Stack>
              }
            >
              <ConsoleBox>
                {pingResult.details.map((d) => (
                  <div key={d.seq}>
                    {d.success
                      ? `64 bytes from ${pingResult.host}: icmp_seq=${d.seq} time=${d.rtt_ms} ms`
                      : `Request timeout for icmp_seq=${d.seq}: ${d.error || 'unreachable'}`}
                  </div>
                ))}
              </ConsoleBox>
            </Panel>
          )}
        </Stack>
      )}

      {/* Add Pool Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Add IPAM Subnet Pool</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              size="small"
              label="Pool Name"
              value={poolForm.name}
              onChange={(e) => setPoolForm({ ...poolForm, name: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="CIDR Subnet"
              placeholder="e.g. 100.64.0.0/22"
              value={poolForm.cidr}
              onChange={(e) => setPoolForm({ ...poolForm, cidr: e.target.value })}
              fullWidth
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Pool Type</InputLabel>
              <Select
                label="Pool Type"
                value={poolForm.pool_type}
                onChange={(e) => setPoolForm({ ...poolForm, pool_type: e.target.value })}
              >
                <MenuItem value="cgnat">CGNAT (RFC 6598)</MenuItem>
                <MenuItem value="public">Public IP</MenuItem>
                <MenuItem value="static">Static Leases</MenuItem>
                <MenuItem value="delegated">IPv6 Delegated Prefix</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Default Gateway"
              value={poolForm.gateway}
              onChange={(e) => setPoolForm({ ...poolForm, gateway: e.target.value })}
              fullWidth
            />
            <Stack direction="row" spacing={1.5}>
              <TextField
                size="small"
                label="Primary DNS"
                value={poolForm.dns_primary}
                onChange={(e) => setPoolForm({ ...poolForm, dns_primary: e.target.value })}
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                label="Secondary DNS"
                value={poolForm.dns_secondary}
                onChange={(e) => setPoolForm({ ...poolForm, dns_secondary: e.target.value })}
                sx={{ flex: 1 }}
              />
            </Stack>
            <TextField
              size="small"
              label="Description"
              multiline
              rows={2}
              value={poolForm.description}
              onChange={(e) => setPoolForm({ ...poolForm, description: e.target.value })}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={createPoolMutation.isPending || !poolForm.cidr}
            onClick={() => createPoolMutation.mutate()}
          >
            {createPoolMutation.isPending ? 'Saving...' : 'Create Subnet Pool'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default IPAMPage;
