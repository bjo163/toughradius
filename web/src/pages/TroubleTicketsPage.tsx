import React, { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add,
  Build,
  Edit,
  Refresh,
  WhatsApp,
} from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotify } from 'react-admin';
import { apiRequest, extractData } from '../utils/apiClient';
import { KpiStrip, KpiTile, PageHeader, Panel, StatusChip } from '../components/Enterprise';

interface FlappingSubscriber {
  username: string;
  customer_no: string;
  customer_name: string;
  phone: string;
  address: string;
  odp_code: string;
  disconnect_count: number;
  last_terminate_cause: string;
  last_seen_time: string;
  severity: string;
  suggested_resolution: string;
}

interface Ticket {
  id: string;
  ticket_no: string;
  customer_id: string;
  subscription_id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  assigned_technician: string;
  technician_phone: string;
  description: string;
  resolution_notes?: string;
  created_at: string;
  resolved_at?: string;
}

export const TroubleTicketsPage: React.FC = () => {
  const notify = useNotify();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [search, setSearch] = useState('');

  // Ticket create form
  const [form, setForm] = useState({
    subject: '',
    category: 'los_red',
    priority: 'normal',
    assigned_technician: '',
    technician_phone: '',
    description: '',
  });

  const [editForm, setEditForm] = useState({
    status: 'open',
    assigned_technician: '',
    technician_phone: '',
    resolution_notes: '',
  });

  const flappingQuery = useQuery({
    queryKey: ['network-diagnostics-flapping'],
    queryFn: async () => {
      const res = await apiRequest<any>('/network/diagnostics/flapping');
      return extractData<{ flapping_count: number; subscribers: FlappingSubscriber[] }>(res) || { flapping_count: 0, subscribers: [] };
    },
  });

  const autoTicketMutation = useMutation({
    mutationFn: async (flap: FlappingSubscriber) => {
      return apiRequest('/network/diagnostics/flapping/auto-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: flap.username,
          customer_no: flap.customer_no,
          description: `Intelligent Flapping: ${flap.disconnect_count}x putus/jam. ODP: ${flap.odp_code || '-'}, Alamat: ${flap.address || '-'}. ${flap.suggested_resolution}`,
        }),
      });
    },
    onSuccess: () => {
      notify('Work order trouble ticket generated automatically!', { type: 'success' });
      void queryClient.invalidateQueries({ queryKey: ['isp', 'tickets'] });
      void queryClient.invalidateQueries({ queryKey: ['network-diagnostics-flapping'] });
    },
    onError: (err: any) => notify(err?.message || 'Failed to create auto ticket', { type: 'error' }),
  });

  const ticketsQuery = useQuery({
    queryKey: ['isp', 'tickets', statusFilter, priorityFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (search.trim()) params.set('q', search.trim());
      params.set('perPage', '50');
      const res = await apiRequest<unknown>(`/isp/tickets?${params.toString()}`);
      return extractData<Ticket[]>(res) ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest('/isp/tickets', {
        method: 'POST',
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      notify('Trouble ticket created', { type: 'success' });
      setCreateOpen(false);
      setForm({
        subject: '',
        category: 'los_red',
        priority: 'normal',
        assigned_technician: '',
        technician_phone: '',
        description: '',
      });
      void queryClient.invalidateQueries({ queryKey: ['isp', 'tickets'] });
    },
    onError: (err: any) => notify(err.message || 'Creation failed', { type: 'error' }),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/isp/tickets/${selectedTicket?.id}`, {
        method: 'PUT',
        body: JSON.stringify(editForm),
      }),
    onSuccess: () => {
      notify('Ticket updated successfully', { type: 'success' });
      setEditOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['isp', 'tickets'] });
    },
    onError: (err: any) => notify(err.message || 'Update failed', { type: 'error' }),
  });

  const dispatchMutation = useMutation({
    mutationFn: (ticketId: string) =>
      apiRequest(`/isp/tickets/${ticketId}/dispatch`, { method: 'POST' }),
    onSuccess: () => {
      notify('Dispatch notification queued to technician WhatsApp', { type: 'success' });
    },
    onError: (err: any) => notify(err.message || 'Dispatch failed', { type: 'error' }),
  });

  const tickets = ticketsQuery.data ?? [];

  const getPriorityChip = (p: string) => {
    let color: 'error' | 'warning' | 'info' | 'default' = 'default';
    if (p === 'urgent') color = 'error';
    else if (p === 'high') color = 'warning';
    else if (p === 'normal') color = 'info';
    return <Chip size="small" color={color} label={p.toUpperCase()} sx={{ fontWeight: 700, fontSize: '0.68rem', height: 20 }} />;
  };


  const count = (pred: (t: Ticket) => boolean) => tickets.filter(pred).length;

  return (
    <Box sx={{ p: { xs: 1.5, md: 2.5 }, maxWidth: 1600, mx: 'auto' }}>
      <PageHeader
        section="ISP / Field Operations"
        title="Trouble Tickets"
        subtitle="Customer incidents, technician dispatch and resolution tracking with 1-click WhatsApp work orders."
        actions={<>
          <Button variant="outlined" startIcon={<Refresh />} onClick={() => void ticketsQuery.refetch()} disabled={ticketsQuery.isFetching}>Refresh</Button>
          <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>New Ticket</Button>
        </>}
      />
      <KpiStrip>
        <KpiTile label="Total (filtered)" value={tickets.length} icon={<Build fontSize="small" />} />
        <KpiTile label="Open" value={count((t) => t.status === 'open')} tone="error" hint="awaiting action" />
        <KpiTile label="In Progress" value={count((t) => t.status === 'in_progress' || t.status === 'scheduled')} tone="warning" hint="scheduled + on-site" />
        <KpiTile label="Urgent / High" value={count((t) => t.priority === 'urgent' || t.priority === 'high')} tone="secondary" />
        <KpiTile label="Unassigned" value={count((t) => !t.assigned_technician)} tone="info" hint="no technician" />
        <KpiTile label="Resolved" value={count((t) => t.status === 'resolved' || t.status === 'closed')} tone="success" />
      </KpiStrip>

      {flappingQuery.data && flappingQuery.data.flapping_count > 0 && (
        <Box sx={{ mb: 3 }}>
          <Panel
            title={`INTELLIGENT FIBER FLAPPING TELEMETRY (${flappingQuery.data.flapping_count} UNSTABLE SUBSCRIBERS)`}
            subtitle="Automated dropcore/ODP attenuation fault detection based on repeated session drops (>= 3-5/hr)"
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 800 }}>SUBSCRIBER</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>CUSTOMER / ODP</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>DISCONNECT FREQ</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>SEVERITY</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>ANALYSIS / ACTION</TableCell>
                  <TableCell sx={{ fontWeight: 800, textAlign: 'right' }}>ACTION</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {flappingQuery.data.subscribers.map((flap) => (
                  <TableRow key={flap.username} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 800, color: 'primary.main' }}>
                      {flap.username}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>
                        {flap.customer_name || 'Subscriber'} ({flap.customer_no || '-'})
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        ODP: {flap.odp_code || 'Unassigned'} • {flap.address || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color="error"
                        label={`${flap.disconnect_count} drops / hour`}
                        sx={{ fontWeight: 800, fontFamily: 'monospace' }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={flap.severity === 'urgent' ? 'error' : 'warning'}
                        label={flap.severity.toUpperCase()}
                        sx={{ fontWeight: 800 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {flap.suggested_resolution}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="contained"
                        color="error"
                        startIcon={<Build sx={{ fontSize: 16 }} />}
                        onClick={() => autoTicketMutation.mutate(flap)}
                        disabled={autoTicketMutation.isPending}
                        sx={{ textTransform: 'none', fontWeight: 700 }}
                      >
                        Auto-Ticket & Dispatch
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </Box>
      )}

      <Panel title="Incident Queue" subtitle={`${tickets.length} tickets`} dense actions={
        <Box>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', md: 'center' }}
            justifyContent="space-between"
          >
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Status</InputLabel>
                <Select
                  label="Status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <MenuItem value="">All Statuses</MenuItem>
                  <MenuItem value="open">Open</MenuItem>
                  <MenuItem value="scheduled">Scheduled</MenuItem>
                  <MenuItem value="in_progress">In Progress</MenuItem>
                  <MenuItem value="resolved">Resolved</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 130 }}>
                <InputLabel>Priority</InputLabel>
                <Select
                  label="Priority"
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                >
                  <MenuItem value="">All Priorities</MenuItem>
                  <MenuItem value="urgent">Urgent</MenuItem>
                  <MenuItem value="high">High</MenuItem>
                  <MenuItem value="normal">Normal</MenuItem>
                  <MenuItem value="low">Low</MenuItem>
                </Select>
              </FormControl>

              <TextField
                size="small"
                label="Search Ticket #"
                placeholder="e.g. TCK-..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ width: 160 }}
              />
            </Stack>
          </Stack>
        </Box>
      }>
          {ticketsQuery.isLoading ? (
            <LinearProgress />
          ) : tickets.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
              <Build sx={{ fontSize: 48, opacity: 0.4, mb: 1 }} />
              <Typography variant="h6">No Incident Tickets</Typography>
              <Typography variant="caption">All customer lines are operating normally.</Typography>
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Ticket #</TableCell>
                  <TableCell>Subject / Incident</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Priority</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Technician</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tickets.map((t) => (
                  <TableRow key={t.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 800, color: 'primary.main' }}>
                      {t.ticket_no}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{t.subject}</TableCell>
                    <TableCell sx={{ textTransform: 'capitalize' }}>
                      {t.category.replace(/_/g, ' ')}
                    </TableCell>
                    <TableCell>{getPriorityChip(t.priority)}</TableCell>
                    <TableCell><StatusChip value={t.status} /></TableCell>
                    <TableCell>
                      {t.assigned_technician ? (
                        <span>{t.assigned_technician}</span>
                      ) : (
                        <Typography variant="caption" color="text.secondary">Unassigned</Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                      {new Date(t.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        {t.technician_phone && (
                          <Button
                            size="small"
                            color="success"
                            variant="outlined"
                            startIcon={<WhatsApp />}
                            disabled={dispatchMutation.isPending}
                            onClick={() => dispatchMutation.mutate(t.id)}
                            sx={{ fontSize: '0.72rem', px: 1 }}
                          >
                            Dispatch WA
                          </Button>
                        )}
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<Edit />}
                          onClick={() => {
                            setSelectedTicket(t);
                            setEditForm({
                              status: t.status,
                              assigned_technician: t.assigned_technician,
                              technician_phone: t.technician_phone,
                              resolution_notes: t.resolution_notes || '',
                            });
                            setEditOpen(true);
                          }}
                          sx={{ fontSize: '0.72rem', px: 1 }}
                        >
                          Update
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </Panel>

      {/* Create Ticket Modal */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Create Trouble Ticket</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              size="small"
              label="Subject / Complaint"
              placeholder="e.g. Kabel FO Putus / Redaman Tinggi"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              required
              fullWidth
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                label="Category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <MenuItem value="los_red">LOS Merah / Kabel Putus</MenuItem>
                <MenuItem value="slow_speed">Koneksi Lemot / Lambat</MenuItem>
                <MenuItem value="no_internet">Tidak Bisa Akses Internet</MenuItem>
                <MenuItem value="router_damage">Modem / Adaptor Rusak</MenuItem>
                <MenuItem value="relocation">Pindah Lokasi / Tarik Ulang</MenuItem>
                <MenuItem value="billing">Kendala Tagihan / Isolir</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Priority</InputLabel>
              <Select
                label="Priority"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                <MenuItem value="urgent">Urgent (Prioritas Utama)</MenuItem>
                <MenuItem value="high">High (Tinggi)</MenuItem>
                <MenuItem value="normal">Normal</MenuItem>
                <MenuItem value="low">Low (Rendah)</MenuItem>
              </Select>
            </FormControl>
            <Stack direction="row" spacing={1.5}>
              <TextField
                size="small"
                label="Assigned Technician"
                placeholder="e.g. Budi Teknisi"
                value={form.assigned_technician}
                onChange={(e) => setForm({ ...form, assigned_technician: e.target.value })}
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                label="Technician Phone"
                placeholder="081..."
                value={form.technician_phone}
                onChange={(e) => setForm({ ...form, technician_phone: e.target.value })}
                sx={{ flex: 1 }}
              />
            </Stack>
            <TextField
              size="small"
              label="Incident Description"
              multiline
              rows={3}
              placeholder="Detail alamat, titik redaman ODP, atau kronologi kendala..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!form.subject || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? 'Saving...' : 'Submit Ticket'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit / Resolve Ticket Modal */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Update Ticket #{selectedTicket?.ticket_no}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                label="Status"
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              >
                <MenuItem value="open">Open</MenuItem>
                <MenuItem value="scheduled">Scheduled</MenuItem>
                <MenuItem value="in_progress">In Progress</MenuItem>
                <MenuItem value="resolved">Resolved</MenuItem>
                <MenuItem value="closed">Closed</MenuItem>
              </Select>
            </FormControl>
            <Stack direction="row" spacing={1.5}>
              <TextField
                size="small"
                label="Technician"
                value={editForm.assigned_technician}
                onChange={(e) => setEditForm({ ...editForm, assigned_technician: e.target.value })}
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                label="Technician WA"
                value={editForm.technician_phone}
                onChange={(e) => setEditForm({ ...editForm, technician_phone: e.target.value })}
                sx={{ flex: 1 }}
              />
            </Stack>
            <TextField
              size="small"
              label="Field Resolution Notes"
              multiline
              rows={3}
              placeholder="Catatan perbaikan (misal: Splicing core 2 ODP-04 selesai, redaman modem -19.5 dBm)"
              value={editForm.resolution_notes}
              onChange={(e) => setEditForm({ ...editForm, resolution_notes: e.target.value })}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={updateMutation.isPending}
            onClick={() => updateMutation.mutate()}
          >
            {updateMutation.isPending ? 'Updating...' : 'Save Resolution'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TroubleTicketsPage;
