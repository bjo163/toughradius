import React, { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  Paper,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add,
  DeleteOutline,
  EditOutlined,
  FiberManualRecord,
  Hub,
  LocationOn,
  MyLocation,
  OpenInNew,
  PeopleAltOutlined,
  Refresh,
  Search,
  WarningAmber,
} from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotify } from 'react-admin';
import { apiRequest, extractData } from '../utils/apiClient';
import { KpiStrip, KpiTile, Mono, PageHeader, Panel, StatusChip } from '../components/Enterprise';

interface CustomerInfo {
  id: number;
  customer_no: string;
  name: string;
  phone: string;
  address: string;
  odp_port: number;
  status: string;
}

interface ODPRecord {
  id: number;
  code: string;
  name: string;
  zone: string;
  olt_name: string;
  pon_port: string;
  total_ports: number;
  used_ports: number;
  optical_loss: number;
  status: string;
  latitude: number;
  longitude: number;
  address: string;
  notes: string;
  created_at: string;
  updated_at: string;
  customers?: CustomerInfo[];
}

interface ODPDetailResponse {
  odp: ODPRecord;
  connected_count: number;
  customers: CustomerInfo[];
}

export const ODPPage: React.FC = () => {
  const notify = useNotify();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Dialog State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingODP, setEditingODP] = useState<ODPRecord | null>(null);

  // Customer Drawer State
  const [selectedODPId, setSelectedODPId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    zone: '',
    olt_name: '',
    pon_port: '',
    total_ports: 16,
    optical_loss: -18.5,
    status: 'active',
    latitude: 0,
    longitude: 0,
    address: '',
    notes: '',
  });

  // Query ODP List
  const { data: odpData, isLoading, refetch } = useQuery<{ data: ODPRecord[]; total: number }>({
    queryKey: ['network-odps', search, zoneFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append('q', search);
      if (zoneFilter) params.append('zone', zoneFilter);
      if (statusFilter) params.append('status', statusFilter);
      const res = await apiRequest(`/network/odp?${params.toString()}`);
      return extractData(res);
    },
  });

  // Query ODP Detail for Drawer
  const { data: odpDetail, isLoading: isDetailLoading } = useQuery<ODPDetailResponse>({
    queryKey: ['network-odp-detail', selectedODPId],
    queryFn: async () => {
      if (!selectedODPId) return null as any;
      const res = await apiRequest(`/network/odp/${selectedODPId}`);
      return extractData(res);
    },
    enabled: !!selectedODPId,
  });

  // Create or Update ODP Mutation
  const saveMutation = useMutation({
    mutationFn: async (payload: typeof formData & { id?: number }) => {
      if (payload.id) {
        return apiRequest(`/network/odp/${payload.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      return apiRequest('/network/odp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      notify(editingODP ? 'ODP updated successfully' : 'ODP created successfully', { type: 'success' });
      setDialogOpen(false);
      setEditingODP(null);
      queryClient.invalidateQueries({ queryKey: ['network-odps'] });
    },
    onError: (err: any) => {
      notify(err?.message || 'Failed to save ODP enclosure', { type: 'error' });
    },
  });

  // Delete ODP Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/network/odp/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      notify('ODP enclosure deleted', { type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['network-odps'] });
    },
    onError: (err: any) => {
      notify(err?.message || 'Failed to delete ODP. Ensure no subscribers are connected.', { type: 'error' });
    },
  });

  const handleOpenCreate = () => {
    setEditingODP(null);
    setFormData({
      code: '',
      name: '',
      zone: 'Central',
      olt_name: 'OLT-ZTE-CORE-01',
      pon_port: 'gpon-olt_1/1/1',
      total_ports: 16,
      optical_loss: -19.2,
      status: 'active',
      latitude: -6.2088,
      longitude: 106.8456,
      address: '',
      notes: '',
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (odp: ODPRecord) => {
    setEditingODP(odp);
    setFormData({
      code: odp.code,
      name: odp.name,
      zone: odp.zone,
      olt_name: odp.olt_name,
      pon_port: odp.pon_port,
      total_ports: odp.total_ports,
      optical_loss: odp.optical_loss,
      status: odp.status,
      latitude: odp.latitude,
      longitude: odp.longitude,
      address: odp.address,
      notes: odp.notes,
    });
    setDialogOpen(true);
  };

  const handleOpenSubscribers = (id: number) => {
    setSelectedODPId(id);
    setDrawerOpen(true);
  };

  const handleSave = () => {
    if (!formData.code) {
      notify('ODP Code is required', { type: 'warning' });
      return;
    }
    saveMutation.mutate({
      ...formData,
      id: editingODP?.id,
    });
  };

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setFormData((prev) => ({
            ...prev,
            latitude: Number(pos.coords.latitude.toFixed(6)),
            longitude: Number(pos.coords.longitude.toFixed(6)),
          }));
          notify('Coordinates updated from browser GPS', { type: 'info' });
        },
        () => {
          notify('Unable to retrieve current location', { type: 'warning' });
        }
      );
    }
  };

  const odps = odpData?.data || [];
  const totalODPs = odps.length;
  const totalCapacity = odps.reduce((acc, o) => acc + (o.total_ports || 0), 0);
  const totalConnected = odps.reduce((acc, o) => acc + (o.used_ports || 0), 0);
  const availablePorts = Math.max(0, totalCapacity - totalConnected);
  const highLossCount = odps.filter((o) => o.optical_loss < -24).length;

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <PageHeader
        title="FTTH & ODP Infrastructure"
        subtitle="Optical Distribution Point Splitter Enclosures, Port Capacity & Passive Optical Network Health"
        actions={
          <Stack direction="row" spacing={1.5}>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={() => refetch()}
              sx={{ fontWeight: 700 }}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={handleOpenCreate}
              sx={{ fontWeight: 700 }}
            >
              Add ODP Enclosure
            </Button>
          </Stack>
        }
      />

      {/* KPI METRIC STRIP */}
      <KpiStrip>
        <KpiTile
          label="Total ODPs"
          value={totalODPs}
          hint="Active optical distribution enclosures"
        />
        <KpiTile
          label="Total Port Capacity"
          value={totalCapacity}
          hint="Passive splitter drop terminals"
        />
        <KpiTile
          label="Connected Subscribers"
          value={totalConnected}
          hint={`${availablePorts} free drop ports available`}
        />
        <KpiTile
          label="High Optical Loss"
          value={highLossCount}
          hint="Redaman > -24 dBm (requires inspection)"
          tone={highLossCount > 0 ? "error" : "success"}
        />
      </KpiStrip>

      {/* SEARCH AND FILTERS */}
      <Panel
        title="Optical Distribution Point Registry"
        actions={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center">
            <TextField
              size="small"
              placeholder="Search code, name, OLT, address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: <Search sx={{ mr: 1, color: 'text.secondary', fontSize: 20 }} />,
              }}
              sx={{ minWidth: 260 }}
            />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Zone</InputLabel>
              <Select
                value={zoneFilter}
                label="Zone"
                onChange={(e) => setZoneFilter(e.target.value)}
              >
                <MenuItem value="">All Zones</MenuItem>
                <MenuItem value="Kuningan">Kuningan</MenuItem>
                <MenuItem value="Sudirman">Sudirman</MenuItem>
                <MenuItem value="BSD">BSD</MenuItem>
                <MenuItem value="Central">Central</MenuItem>
                <MenuItem value="Utara">Utara</MenuItem>
                <MenuItem value="Barat">Barat</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="">All Statuses</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="full">Full (No Ports)</MenuItem>
                <MenuItem value="maintenance">Maintenance</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        }
      >
        {isLoading ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <LinearProgress sx={{ mb: 2 }} />
            <Typography variant="body2" color="text.secondary">
              Querying ODP network assets...
            </Typography>
          </Box>
        ) : odps.length === 0 ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <Hub sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="h6" fontWeight={700}>
              No ODP Enclosures Found
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Start by registering your optical distribution points or splitters along fiber routes.
            </Typography>
            <Button variant="contained" startIcon={<Add />} onClick={handleOpenCreate}>
              Create First ODP
            </Button>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 800 }}>ODP CODE</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>NAME / ZONE</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>UPLINK (OLT / PON)</TableCell>
                <TableCell sx={{ fontWeight: 800, minWidth: 170 }}>PORT OCCUPANCY</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>OPTICAL LOSS</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>STATUS</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>COORDINATES</TableCell>
                <TableCell sx={{ fontWeight: 800, textAlign: 'right' }}>ACTIONS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {odps.map((row) => {
                const used = row.used_ports || 0;
                const total = row.total_ports || 16;
                const percent = Math.min(100, Math.round((used / total) * 100));
                const isHighLoss = row.optical_loss < -24;
                const isOptimal = row.optical_loss >= -21;

                return (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Hub sx={{ fontSize: 18, color: 'primary.main' }} />
                        <Mono sx={{ fontWeight: 800, fontSize: '0.85rem' }}>{row.code}</Mono>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>
                        {row.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Zone: {row.zone || '-'} {row.address ? `• ${row.address}` : ''}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {row.olt_name || 'OLT-CORE'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Port: {row.pon_port || 'gpon-olt_1/1/1'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ width: '100%' }}>
                        <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                          <Typography variant="caption" fontWeight={700}>
                            {used} / {total} Ports
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {percent}%
                          </Typography>
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={percent}
                          color={percent >= 90 ? 'error' : percent >= 70 ? 'warning' : 'primary'}
                          sx={{ height: 6, borderRadius: 1 }}
                        />
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Tooltip
                        title={
                          isOptimal
                            ? 'Optimal signal strength (-15 to -21 dBm)'
                            : isHighLoss
                            ? 'Warning: High optical loss (> -24 dBm). Check dropcore connector!'
                            : 'Acceptable attenuation (-21 to -24 dBm)'
                        }
                      >
                        <Chip
                          size="small"
                          icon={
                            isHighLoss ? (
                              <WarningAmber sx={{ fontSize: '14px !important' }} />
                            ) : (
                              <FiberManualRecord sx={{ fontSize: '10px !important' }} />
                            )
                          }
                          label={`${row.optical_loss.toFixed(1)} dBm`}
                          color={isHighLoss ? 'error' : isOptimal ? 'success' : 'warning'}
                          variant="outlined"
                          sx={{ fontWeight: 700, fontFamily: 'monospace' }}
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <StatusChip
                        status={
                          row.status === 'active'
                            ? 'active'
                            : row.status === 'full'
                            ? 'warning'
                            : 'error'
                        }
                        label={row.status.toUpperCase()}
                      />
                    </TableCell>
                    <TableCell>
                      {row.latitude && row.longitude ? (
                        <Button
                          size="small"
                          variant="text"
                          startIcon={<LocationOn sx={{ fontSize: 16 }} />}
                          endIcon={<OpenInNew sx={{ fontSize: 14 }} />}
                          href={`https://www.google.com/maps?q=${row.latitude},${row.longitude}`}
                          target="_blank"
                          sx={{ textTransform: 'none', py: 0, px: 0.5, fontSize: '0.75rem' }}
                        >
                          {row.latitude.toFixed(4)}, {row.longitude.toFixed(4)}
                        </Button>
                      ) : (
                        <Typography variant="caption" color="text.disabled">
                          No GPS
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title="View Connected Subscribers">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleOpenSubscribers(row.id)}
                          >
                            <PeopleAltOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit ODP Configuration">
                          <IconButton
                            size="small"
                            onClick={() => handleOpenEdit(row)}
                          >
                            <EditOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete ODP">
                          <IconButton
                            size="small"
                            color="error"
                            disabled={used > 0}
                            onClick={() => {
                              if (window.confirm(`Delete ODP ${row.code}?`)) {
                                deleteMutation.mutate(row.id);
                              }
                            }}
                          >
                            <DeleteOutline fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>

      {/* CREATE / EDIT DIALOG */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          {editingODP ? `Edit ODP Enclosure: ${editingODP.code}` : 'Register New ODP Enclosure'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Stack direction="row" spacing={2}>
              <TextField
                fullWidth
                label="ODP Code"
                placeholder="ODP-KNG-001"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                required
                helperText="Unique identifier e.g. ODP-[ZONE]-[NUM]"
              />
              <TextField
                fullWidth
                label="Zone / Area"
                placeholder="Kuningan"
                value={formData.zone}
                onChange={(e) => setFormData({ ...formData, zone: e.target.value })}
              />
            </Stack>

            <TextField
              fullWidth
              label="ODP Name / Pole Label"
              placeholder="ODP Kuningan Barat Tiang 14"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />

            <Stack direction="row" spacing={2}>
              <TextField
                fullWidth
                label="Uplink OLT Name"
                placeholder="OLT-ZTE-CORE-01"
                value={formData.olt_name}
                onChange={(e) => setFormData({ ...formData, olt_name: e.target.value })}
              />
              <TextField
                fullWidth
                label="PON Port"
                placeholder="gpon-olt_1/1/3"
                value={formData.pon_port}
                onChange={(e) => setFormData({ ...formData, pon_port: e.target.value })}
              />
            </Stack>

            <Stack direction="row" spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Splitter Ratio (Total Ports)</InputLabel>
                <Select
                  value={formData.total_ports}
                  label="Splitter Ratio (Total Ports)"
                  onChange={(e) => setFormData({ ...formData, total_ports: Number(e.target.value) })}
                >
                  <MenuItem value={8}>1:8 (8 Drop Ports)</MenuItem>
                  <MenuItem value={16}>1:16 (16 Drop Ports)</MenuItem>
                  <MenuItem value={24}>1:24 (24 Drop Ports)</MenuItem>
                  <MenuItem value={32}>1:32 (32 Drop Ports)</MenuItem>
                </Select>
              </FormControl>
              <TextField
                fullWidth
                label="Optical Attenuation (dBm)"
                type="number"
                inputProps={{ step: '0.1' }}
                value={formData.optical_loss}
                onChange={(e) => setFormData({ ...formData, optical_loss: Number(e.target.value) })}
                helperText="Standard range: -15.0 to -22.0 dBm"
              />
            </Stack>

            <Stack direction="row" spacing={2} alignItems="center">
              <TextField
                fullWidth
                label="Latitude"
                type="number"
                inputProps={{ step: '0.000001' }}
                value={formData.latitude}
                onChange={(e) => setFormData({ ...formData, latitude: Number(e.target.value) })}
              />
              <TextField
                fullWidth
                label="Longitude"
                type="number"
                inputProps={{ step: '0.000001' }}
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: Number(e.target.value) })}
              />
              <Button
                variant="outlined"
                startIcon={<MyLocation />}
                onClick={getCurrentLocation}
                sx={{ minWidth: 130, height: 40 }}
              >
                Get GPS
              </Button>
            </Stack>

            <TextField
              fullWidth
              label="Physical Address / Landmark"
              multiline
              rows={2}
              placeholder="Depan Ruko Niaga Blok B No. 12, Tiang PLN No. 44"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />

            <TextField
              fullWidth
              label="Notes"
              multiline
              rows={2}
              placeholder="Additional operational or field notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />

            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={formData.status}
                label="Status"
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <MenuItem value="active">Active (Available for drop cable install)</MenuItem>
                <MenuItem value="full">Full (Capacity reached)</MenuItem>
                <MenuItem value="maintenance">Under Maintenance / Splicing</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            loading={saveMutation.isPending}
            sx={{ fontWeight: 700 }}
          >
            {editingODP ? 'Save Changes' : 'Register ODP'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* CONNECTED SUBSCRIBERS DRAWER */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 540 }, p: 3 } }}
      >
        {isDetailLoading || !odpDetail ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <LinearProgress sx={{ mb: 2 }} />
            <Typography variant="body2" color="text.secondary">
              Loading connected subscribers...
            </Typography>
          </Box>
        ) : (
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Box>
                <Typography variant="overline" color="text.secondary" fontWeight={700}>
                  ODP ENCLOSURE TELEMETRY
                </Typography>
                <Typography variant="h5" fontWeight={800}>
                  {odpDetail.odp.code}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {odpDetail.odp.name} • {odpDetail.odp.zone}
                </Typography>
              </Box>
              <Chip
                label={`${odpDetail.connected_count} / ${odpDetail.odp.total_ports} PORTS`}
                color="primary"
                sx={{ fontWeight: 800, fontFamily: 'monospace' }}
              />
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Stack spacing={1.5} sx={{ mb: 3 }}>
              <Typography variant="subtitle2" fontWeight={800}>
                Splitter Specifications:
              </Typography>
              <Stack direction="row" spacing={3}>
                <Box>
                  <Typography variant="caption" color="text.secondary">OLT Uplink:</Typography>
                  <Typography variant="body2" fontWeight={700}>{odpDetail.odp.olt_name}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">PON Port:</Typography>
                  <Typography variant="body2" fontWeight={700}>{odpDetail.odp.pon_port}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Optical Attenuation:</Typography>
                  <Typography variant="body2" fontWeight={700} color={odpDetail.odp.optical_loss < -24 ? 'error.main' : 'success.main'}>
                    {odpDetail.odp.optical_loss} dBm
                  </Typography>
                </Box>
              </Stack>
            </Stack>

            <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1.5 }}>
              Connected Dropcore Subscribers ({odpDetail.customers.length})
            </Typography>

            {odpDetail.customers.length === 0 ? (
              <Box sx={{ py: 4, textAlign: 'center', bgcolor: 'action.hover', borderRadius: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  No subscribers attached to this ODP yet.
                </Typography>
              </Box>
            ) : (
              <Stack spacing={1.5}>
                {odpDetail.customers.map((cust) => (
                  <Paper key={cust.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip
                            size="small"
                            label={`PORT ${cust.odp_port || 1}`}
                            color="info"
                            variant="outlined"
                            sx={{ fontWeight: 800, fontFamily: 'monospace', height: 20 }}
                          />
                          <Typography variant="subtitle2" fontWeight={800}>
                            {cust.name}
                          </Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          ID: {cust.customer_no} • Phone: {cust.phone || '-'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          Address: {cust.address || '-'}
                        </Typography>
                      </Box>
                      <StatusChip
                        status={cust.status === 'active' ? 'active' : 'warning'}
                        label={cust.status.toUpperCase()}
                      />
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}

            <Button
              fullWidth
              variant="outlined"
              onClick={() => setDrawerOpen(false)}
              sx={{ mt: 3, fontWeight: 700 }}
            >
              Close Panel
            </Button>
          </Box>
        )}
      </Drawer>
    </Box>
  );
};

export default ODPPage;
