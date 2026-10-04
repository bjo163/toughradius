import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
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
  ConfirmationNumber,
  DeleteOutline,
  Print,
  Refresh,
} from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotify } from 'react-admin';
import { apiRequest, extractData } from '../utils/apiClient';
import { useBranding } from '../branding/BrandingContext';
import { KpiStrip, KpiTile, Mono, PageHeader, Panel, StatusChip } from '../components/Enterprise';

interface Voucher {
  id: string;
  batch_id: string;
  code: string;
  password: string;
  price: number;
  validity_seconds: number;
  quota_bytes: number;
  status: string;
  first_login_at?: string;
  expires_at?: string;
  created_at: string;
}

interface Batch {
  id: string;
  batch_no: string;
  name: string;
  quantity: number;
  price: number;
  prefix: string;
  created_at: string;
}

interface InternetPackage {
  id: string;
  code: string;
  name: string;
  status: string;
  radius_profile_id: string;
}

export const HotspotVouchersPage: React.FC = () => {
  const { branding } = useBranding();
  const notify = useNotify();
  const queryClient = useQueryClient();

  const [genOpen, setGenOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [printMode, setPrintMode] = useState<'thermal' | 'a4'>('thermal');
  const [selectedBatch, setSelectedBatch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  // Form state for generating vouchers
  const [genForm, setGenForm] = useState({
    name: 'Standard Hotspot',
    package_id: '',
    quantity: 20,
    price: 5000,
    validity_hours: 24,
    prefix: 'HOT',
    code_length: 6,
    same_user_pass: true,
  });

  const batchesQuery = useQuery({
    queryKey: ['isp', 'vouchers', 'batches'],
    queryFn: async () => {
      const res = await apiRequest<unknown>('/isp/vouchers/batches?perPage=50');
      return extractData<Batch[]>(res) ?? [];
    },
  });

  const packagesQuery = useQuery({
    queryKey: ['isp', 'vouchers', 'packages'],
    queryFn: async () => {
      const res = await apiRequest<unknown>('/isp/packages?status=active&perPage=100');
      return (extractData<InternetPackage[]>(res) ?? []).filter((pkg) => Number(pkg.radius_profile_id) > 0);
    },
  });

  const vouchersQuery = useQuery({
    queryKey: ['isp', 'vouchers', selectedBatch, statusFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedBatch) params.set('batch_id', selectedBatch);
      if (statusFilter) params.set('status', statusFilter);
      if (search.trim()) params.set('q', search.trim());
      params.set('perPage', '100');
      const res = await apiRequest<unknown>(`/isp/vouchers?${params.toString()}`);
      return extractData<Voucher[]>(res) ?? [];
    },
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      apiRequest('/isp/vouchers/generate', {
        method: 'POST',
        body: JSON.stringify({
          name: genForm.name,
          package_id: genForm.package_id,
          quantity: Number(genForm.quantity),
          price: Number(genForm.price),
          validity_seconds: Number(genForm.validity_hours) * 3600,
          quota_mb: 0,
          prefix: genForm.prefix.trim(),
          code_length: Number(genForm.code_length),
          same_user_pass: genForm.same_user_pass,
        }),
      }),
    onSuccess: () => {
      notify('Vouchers generated successfully', { type: 'success' });
      setGenOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['isp', 'vouchers'] });
    },
    onError: (err: any) => notify(err.message || 'Generation failed', { type: 'error' }),
  });

  const deleteBatchMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/isp/vouchers/batches/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify('Voucher batch removed', { type: 'success' });
      setSelectedBatch('');
      void queryClient.invalidateQueries({ queryKey: ['isp', 'vouchers'] });
    },
  });

  const batches = batchesQuery.data ?? [];
  const vouchers = vouchersQuery.data ?? [];

  const formatValidity = (seconds: number) => {
    if (seconds >= 86400) return `${Math.round(seconds / 86400)} Hari`;
    if (seconds >= 3600) return `${Math.round(seconds / 3600)} Jam`;
    return `${Math.round(seconds / 60)} Menit`;
  };

  const formatQuota = (bytes: number) => {
    if (!bytes || bytes <= 0) return 'Unlimited (no data cap)';
    const mb = bytes / (1024 * 1024);
    const configured = mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
    return `Not enforced (${configured} stored)`;
  };

  const totalValue = vouchers.reduce((acc, v) => acc + (v.price || 0), 0);
  const countStatus = (s: string) => vouchers.filter((v) => v.status === s).length;

  return (
    <Box sx={{ p: { xs: 1.5, md: 2.5 }, maxWidth: 1600, mx: 'auto' }}>
      <PageHeader
        section="ISP / Captive Portal"
        title="Hotspot Vouchers"
        subtitle="Batch prepaid voucher generator with Thermal POS (58/80mm) and A4 printable card layouts."
        actions={<>
          <Button
            variant="outlined"
            startIcon={<Print />}
            disabled={vouchers.length === 0}
            onClick={() => setPrintOpen(true)}
          >
            Print Vouchers ({vouchers.length})
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Add />}
            onClick={() => setGenOpen(true)}
          >
            Generate Batch
          </Button>
        </>}
      />

      <KpiStrip>
        <KpiTile label="Total Vouchers" value={vouchers.length} icon={<ConfirmationNumber fontSize="small" />} />
        <KpiTile label="Active / Unused" value={countStatus('active')} tone="success" hint="Ready for customers" />
        <KpiTile label="Used / Online" value={countStatus('used')} tone="info" hint="Logged in" />
        <KpiTile label="Expired" value={countStatus('expired')} tone="error" hint="Validity window ended" />
        <KpiTile label="Total Batches" value={batches.length} tone="warning" hint="Created batches" />
        <KpiTile
          label="Total Face Value"
          value={`Rp ${(totalValue / 1000).toFixed(0)}k`}
          tone="secondary"
          hint="Aggregate batch price"
        />
      </KpiStrip>

      <Panel
        title="Voucher Inventory"
        subtitle={`${vouchers.length} vouchers visible`}
        dense
        actions={
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Filter Batch</InputLabel>
              <Select
                label="Filter Batch"
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
              >
                <MenuItem value="">All Batches</MenuItem>
                {batches.map((b) => (
                  <MenuItem key={b.id} value={b.id}>
                    {b.batch_no} — {b.name} ({b.quantity} pcs)
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Status</InputLabel>
              <Select
                label="Status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="">All Statuses</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="used">Used / Online</MenuItem>
                <MenuItem value="expired">Expired</MenuItem>
              </Select>
            </FormControl>

            <TextField
              size="small"
              label="Search Code"
              placeholder="e.g. WRK-..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ width: 140 }}
            />

            {selectedBatch && (
              <Button
                size="small"
                color="error"
                variant="outlined"
                startIcon={<DeleteOutline />}
                onClick={() => {
                  if (window.confirm('Delete this voucher batch and all its credentials?')) {
                    deleteBatchMutation.mutate(selectedBatch);
                  }
                }}
              >
                Delete Batch
              </Button>
            )}

            <Button
              size="small"
              variant="outlined"
              startIcon={<Refresh />}
              onClick={() => void vouchersQuery.refetch()}
              disabled={vouchersQuery.isFetching}
            >
              Refresh
            </Button>
          </Stack>
        }
      >
          {vouchersQuery.isLoading ? (
            <LinearProgress />
          ) : vouchers.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
              <ConfirmationNumber sx={{ fontSize: 48, opacity: 0.4, mb: 1 }} />
              <Typography variant="h6">No Vouchers Found</Typography>
              <Typography variant="caption">
                Click "Generate Batch" to create prepaid hotspot voucher codes.
              </Typography>
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Voucher Code / User</TableCell>
                  <TableCell>Password</TableCell>
                  <TableCell>Price</TableCell>
                  <TableCell>Validity</TableCell>
                  <TableCell>Quota</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {vouchers.map((v) => (
                  <TableRow key={v.id} hover>
                    <TableCell sx={{ color: 'primary.main', fontWeight: 700 }}>
                      <Mono>{v.code}</Mono>
                    </TableCell>
                    <TableCell><Mono>{v.password}</Mono></TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>
                      Rp {new Intl.NumberFormat('id-ID').format(v.price)}
                    </TableCell>
                    <TableCell>{formatValidity(v.validity_seconds)}</TableCell>
                    <TableCell>{formatQuota(v.quota_bytes)}</TableCell>
                    <TableCell>
                      <StatusChip value={v.status} />
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
                      {new Date(v.created_at).toLocaleDateString()} {new Date(v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </Panel>

      {/* Generator Dialog Modal */}
      <Dialog open={genOpen} onClose={() => setGenOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Generate Hotspot Vouchers</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl size="small" fullWidth required>
              <InputLabel id="voucher-package-label">RADIUS Package</InputLabel>
              <Select
                labelId="voucher-package-label"
                label="RADIUS Package"
                value={genForm.package_id}
                onChange={(e) => setGenForm({ ...genForm, package_id: e.target.value })}
                disabled={packagesQuery.isLoading}
              >
                {packagesQuery.data?.map((pkg) => (
                  <MenuItem key={pkg.id} value={pkg.id}>{pkg.code} — {pkg.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {packagesQuery.isError && <Alert severity="error">Could not load active packages linked to a RADIUS profile.</Alert>}
            {!packagesQuery.isLoading && !packagesQuery.isError && packagesQuery.data?.length === 0 && (
              <Alert severity="warning">Create an active ISP package linked to a RADIUS profile before generating vouchers.</Alert>
            )}
            <TextField
              size="small"
              label="Batch / Package Name"
              value={genForm.name}
              onChange={(e) => setGenForm({ ...genForm, name: e.target.value })}
              fullWidth
            />
            <Stack direction="row" spacing={1.5}>
              <TextField
                size="small"
                type="number"
                label="Quantity"
                value={genForm.quantity}
                onChange={(e) => setGenForm({ ...genForm, quantity: Number(e.target.value) })}
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                label="Prefix"
                placeholder="e.g. HOT, WFI"
                value={genForm.prefix}
                onChange={(e) => setGenForm({ ...genForm, prefix: e.target.value })}
                sx={{ width: 110 }}
              />
            </Stack>
            <Stack direction="row" spacing={1.5}>
              <TextField
                size="small"
                type="number"
                label="Price (IDR)"
                value={genForm.price}
                onChange={(e) => setGenForm({ ...genForm, price: Number(e.target.value) })}
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                type="number"
                label="Validity (Hours)"
                value={genForm.validity_hours}
                onChange={(e) => setGenForm({ ...genForm, validity_hours: Number(e.target.value) })}
                sx={{ flex: 1 }}
              />
            </Stack>
            <Alert severity="info">
              Validity starts at the first successful RADIUS login. Data quota enforcement is not available yet; generated vouchers use unlimited data.
            </Alert>
            <Stack direction="row" spacing={1.5}>
              <TextField
                size="small"
                type="number"
                label="Code Length"
                value={genForm.code_length}
                onChange={(e) => setGenForm({ ...genForm, code_length: Number(e.target.value) })}
                sx={{ width: 110 }}
              />
            </Stack>
            <FormControlLabel
              control={
                <Switch
                  checked={genForm.same_user_pass}
                  onChange={(e) => setGenForm({ ...genForm, same_user_pass: e.target.checked })}
                />
              }
              label="Username equals Password (1-step login)"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setGenOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={generateMutation.isPending || !genForm.quantity || !genForm.package_id || packagesQuery.isLoading || (packagesQuery.data?.length ?? 0) === 0}
            onClick={() => generateMutation.mutate()}
          >
            {generateMutation.isPending ? 'Generating...' : `Create ${genForm.quantity} Vouchers`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Print Preview Dialog */}
      <Dialog open={printOpen} onClose={() => setPrintOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Print Hotspot Vouchers ({vouchers.length} cards)</span>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant={printMode === 'thermal' ? 'contained' : 'outlined'}
              onClick={() => setPrintMode('thermal')}
            >
              Thermal POS (58/80mm)
            </Button>
            <Button
              size="small"
              variant={printMode === 'a4' ? 'contained' : 'outlined'}
              onClick={() => setPrintMode('a4')}
            >
              A4 Sheet Grid
            </Button>
            <Button
              size="small"
              variant="contained"
              color="primary"
              startIcon={<Print />}
              onClick={() => window.print()}
            >
              Print Now
            </Button>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }} className="no-print">
            Use system print dialog (Ctrl+P). Choose destination printer: Thermal Receipt for rolls, or standard printer for A4 paper.
          </Alert>

          {/* Printable Container */}
          <Box id="printable-vouchers">
            {printMode === 'thermal' ? (
              <Box sx={{ width: 280, mx: 'auto', p: 1, border: '1px solid #ddd', borderRadius: 1 }}>
                {vouchers.map((v) => (
                  <Box
                    key={v.id}
                    sx={{
                      p: 1.5,
                      borderBottom: '1px dashed #000',
                      textAlign: 'center',
                      pageBreakInside: 'avoid',
                    }}
                  >
                    <Typography variant="subtitle1" fontWeight={900}>
                      {branding.product_name}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>
                      WiFi Hotspot Access
                    </Typography>
                    <Box sx={{ bgcolor: '#000', color: '#fff', py: 0.5, px: 1, borderRadius: 0.5, mb: 1 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 900, letterSpacing: 2 }}>
                        {v.code}
                      </Typography>
                    </Box>
                    {v.password !== v.code && (
                      <Typography variant="caption" sx={{ display: 'block' }}>
                        PIN: <strong>{v.password}</strong>
                      </Typography>
                    )}
                    <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, mt: 0.5 }}>
                      Rp {new Intl.NumberFormat('id-ID').format(v.price)} · {formatValidity(v.validity_seconds)}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontSize: '0.65rem' }}>
                      Data allowance: {formatQuota(v.quota_bytes)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            ) : (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 1.5,
                  p: 1,
                }}
              >
                {vouchers.map((v) => (
                  <Paper
                    key={v.id}
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      border: '1px dashed #555',
                      borderRadius: 1,
                      pageBreakInside: 'avoid',
                      position: 'relative',
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" fontWeight={800} color="primary.main">
                        {branding.product_name}
                      </Typography>
                      <Chip
                        size="small"
                        label={`Rp ${new Intl.NumberFormat('id-ID').format(v.price)}`}
                        sx={{ height: 18, fontSize: '0.65rem', fontWeight: 800 }}
                      />
                    </Stack>
                    <Box sx={{ my: 1, textAlign: 'center', bgcolor: 'action.hover', p: 0.75, borderRadius: 0.5 }}>
                      <Typography variant="caption" color="text.secondary" display="block">
                        VOUCHER CODE
                      </Typography>
                      <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 900, letterSpacing: 1.5 }}>
                        {v.code}
                      </Typography>
                    </Box>
                    <Stack direction="row" justifyContent="space-between" sx={{ fontSize: '0.72rem' }}>
                      <span>Durasi: <strong>{formatValidity(v.validity_seconds)}</strong></span>
                      <span>Data allowance: <strong>{formatQuota(v.quota_bytes)}</strong></span>
                    </Stack>
                  </Paper>
                ))}
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setPrintOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Print CSS */}
      <style>{`
        @media print {
          body {
            background: #fff !important;
            color: #000 !important;
          }
          header, nav, .MuiAppBar-root, .MuiDrawer-root, .no-print, button, .RaTopToolbar-root {
            display: none !important;
          }
          #printable-vouchers {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .MuiPaper-root {
            box-shadow: none !important;
          }
        }
      `}</style>
    </Box>
  );
};

export default HotspotVouchersPage;
