import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box, Container, Card, CardContent, Typography, TextField, Button,
  Stack, Chip, Alert, Snackbar, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, CircularProgress,
  useTheme
} from '@mui/material';
import {
  Search as SearchIcon,
  WhatsApp as WhatsAppIcon,
  Wifi as WifiIcon,
  CheckCircle as CheckCircleIcon,
  Lock as LockIcon,
} from '@mui/icons-material';
import { useBranding } from '../branding/BrandingContext';
import { apiRequest } from '../utils/apiClient';

type InvoiceItem = {
  id: string | number;
  invoice_no: string;
  due_date?: string;
  total: number;
  balance: number;
  status: string;
};

type CustomerPortalData = {
  customer_no: string;
  name: string;
  status: string;
  package_name: string;
  package_price: number;
  subscription_status: string;
  outstanding: number;
  invoices: InvoiceItem[];
};

const idrFormat = (val?: number | null) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val || 0);

export const CustomerPortalPage = () => {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { branding } = useBranding();

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CustomerPortalData | null>(null);
  const [toast, setToast] = useState<{ open: boolean; message: string }>({ open: false, message: '' });

  const doSearch = async (searchTerm: string) => {
    const q = searchTerm.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<CustomerPortalData>(`/portal/lookup?q=${encodeURIComponent(q)}`);
      setData(result);
    } catch (err: any) {
      setError(err?.message || 'Gagal memuat data pelanggan');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const qParam = params.get('q');
    if (qParam) {
      setQuery(qParam);
      void doSearch(qParam);
    }
  }, [location.search]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void doSearch(query);
  };

  const openWhatsAppConfirmation = () => {
    if (!data) return;
    const amountStr = idrFormat(data.outstanding);
    const text = `Halo Admin ${branding.product_name},\nSaya atas nama ${data.name} (ID: ${data.customer_no}) ingin konfirmasi pembayaran tagihan internet sebesar ${amountStr}.\nMohon diverifikasi. Terima kasih!`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: 8 }}>
      {/* Header Bar */}
      <Box
        sx={{
          bgcolor: 'background.paper',
          borderBottom: '2px solid',
          borderColor: theme.palette.mode === 'dark' ? '#333' : '#e0e0e0',
          py: 2,
          px: { xs: 2, md: 4 },
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ cursor: 'pointer' }} onClick={() => navigate('/home')}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1,
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: 18,
            }}
          >
            MW
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={800} sx={{ lineHeight: 1.1 }}>
              {branding.product_name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Authenticated Operator Lookup
            </Typography>
          </Box>
        </Stack>

        <Button
          variant="outlined"
          size="small"
          startIcon={<LockIcon />}
          onClick={() => navigate('/login')}
          sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
        >
          Staff Login
        </Button>
      </Box>

      {/* Main Container */}
      <Container maxWidth="md" sx={{ mt: { xs: 3, md: 5 } }}>
        {/* Search Hero */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Chip
            label="INTERNAL OPERATOR VIEW"
            color="primary"
            size="small"
            sx={{ fontWeight: 800, letterSpacing: '0.1em', mb: 1.5, px: 1 }}
          />
          <Typography variant="h4" fontWeight={900} sx={{ mb: 1 }}>
            Cek Tagihan & Status Layanan
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 540, mx: 'auto', mb: 3 }}>
            Masukkan identitas pelanggan untuk melihat tagihan. Akses ini memerlukan login operator dan hanya menampilkan data organisasi yang sedang dipilih.
          </Typography>

          {/* Search Box */}
          <Paper
            component="form"
            onSubmit={handleSubmit}
            variant="outlined"
            sx={{
              p: 1,
              display: 'flex',
              alignItems: 'center',
              maxWidth: 580,
              mx: 'auto',
              borderRadius: 3,
              boxShadow: theme.palette.mode === 'dark' ? '0 4px 20px rgba(0,0,0,0.5)' : '0 4px 20px rgba(0,0,0,0.06)',
            }}
          >
            <TextField
              fullWidth
              variant="standard"
              placeholder="Contoh: MWX-000001 atau 08123456789"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              InputProps={{
                disableUnderline: true,
                startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1, ml: 1 }} />,
              }}
              sx={{ px: 1 }}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={loading || !query.trim()}
              sx={{
                borderRadius: 2,
                px: 3,
                py: 1.2,
                fontWeight: 700,
                textTransform: 'none',
                minWidth: 100,
              }}
            >
              {loading ? <CircularProgress size={22} color="inherit" /> : 'Periksa'}
            </Button>
          </Paper>
        </Box>

        {/* Error Alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {/* Customer Information Cards */}
        {data && (
          <Stack spacing={3}>
            {/* Customer Profile & Service Info */}
            <Card variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
              <Box sx={{ bgcolor: 'action.hover', px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={700} letterSpacing="0.05em">
                      INFORMASI PELANGGAN
                    </Typography>
                    <Typography variant="h5" fontWeight={800}>
                      {data.name}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Chip
                      label={data.customer_no}
                      sx={{ fontFamily: 'monospace', fontWeight: 800 }}
                      variant="outlined"
                    />
                    <Chip
                      label={data.status.toUpperCase()}
                      color={data.status === 'active' ? 'success' : 'warning'}
                      sx={{ fontWeight: 800 }}
                    />
                  </Stack>
                </Stack>
              </Box>

              <CardContent sx={{ p: 3 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ mb: 3 }}>
                  <Paper variant="outlined" sx={{ p: 2, flex: 1, borderRadius: 2 }}>
                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                      <WifiIcon color="primary" />
                      <Typography variant="subtitle2" fontWeight={800}>
                        Paket Langganan
                      </Typography>
                    </Stack>
                    <Typography variant="h6" fontWeight={800} color="primary.main">
                      {data.package_name || 'Paket Standar'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Tarif Bulanan: <strong>{idrFormat(data.package_price)}</strong> / bulan
                    </Typography>
                  </Paper>

                  <Paper variant="outlined" sx={{ p: 2, flex: 1, borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" sx={{ mb: 1 }}>
                      STATUS KONEKSI INTERNET
                    </Typography>
                    <Chip
                      size="small"
                      label={data.subscription_status === 'active' ? 'ONLINE & AKTIF' : data.subscription_status.toUpperCase()}
                      color={data.subscription_status === 'active' ? 'success' : 'error'}
                      sx={{ fontWeight: 800, mb: 1 }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      {data.subscription_status === 'active'
                        ? 'Koneksi jaringan berjalan normal tanpa hambatan.'
                        : 'Layanan internet ditangguhkan sementara karena keterlambatan pembayaran.'}
                    </Typography>
                  </Paper>
                </Stack>

                {/* Outstanding Due Banner */}
                {data.outstanding > 0 ? (
                  <Card
                    sx={{
                      p: 2.5,
                      bgcolor: theme.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.12)' : '#fee2e2',
                      border: '1px solid',
                      borderColor: 'error.main',
                      borderRadius: 2,
                      mb: 3,
                    }}
                  >
                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2}>
                      <Box>
                        <Typography variant="subtitle2" color="error.main" fontWeight={800}>
                          TOTAL TAGIHAN BELUM DIBAYAR
                        </Typography>
                        <Typography variant="h4" fontWeight={900} color="error.main" fontFamily="monospace">
                          {idrFormat(data.outstanding)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Pembayaran online belum dikonfigurasi. Catat pembayaran di halaman admin setelah dana benar-benar diterima.
                        </Typography>
                      </Box>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                        <Button
                          variant="outlined"
                          color="success"
                          startIcon={<WhatsAppIcon />}
                          onClick={openWhatsAppConfirmation}
                          sx={{ fontWeight: 700, borderRadius: 2, px: 2 }}
                        >
                          Konfirmasi WA
                        </Button>
                      </Stack>
                    </Stack>
                  </Card>
                ) : (
                  <Card
                    sx={{
                      p: 2.5,
                      bgcolor: theme.palette.mode === 'dark' ? 'rgba(16, 185, 129, 0.12)' : '#d1fae5',
                      border: '1px solid',
                      borderColor: 'success.main',
                      borderRadius: 2,
                      mb: 3,
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={2}>
                      <CheckCircleIcon color="success" sx={{ fontSize: 36 }} />
                      <Box>
                        <Typography variant="subtitle1" fontWeight={800} color="success.main">
                          Semua Tagihan Sudah Lunas (Rp 0)
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Terima kasih! Layanan internet Anda aktif dan siap digunakan setiap saat.
                        </Typography>
                      </Box>
                    </Stack>
                  </Card>
                )}

                {/* Recent Invoices Table */}
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1.5 }}>
                    Daftar Tagihan & Status Pembayaran
                  </Typography>
                  <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                    <Table size="small">
                      <TableHead sx={{ bgcolor: 'action.hover' }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>No. Invoice</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Jatuh Tempo</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>Total Tagihan</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>Sisa Saldo</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 700 }}>Status</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>Aksi</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.invoices && data.invoices.length > 0 ? (
                          data.invoices.map((inv) => {
                            const isPaid = inv.balance === 0 || inv.status === 'paid';
                            return (
                              <TableRow key={inv.id}>
                                <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{inv.invoice_no}</TableCell>
                                <TableCell>{inv.due_date ? new Date(inv.due_date).toLocaleDateString('id-ID') : '-'}</TableCell>
                                <TableCell align="right">{idrFormat(inv.total)}</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700, color: isPaid ? 'success.main' : 'error.main' }}>
                                  {idrFormat(inv.balance)}
                                </TableCell>
                                <TableCell align="center">
                                  <Chip
                                    size="small"
                                    label={inv.status.toUpperCase()}
                                    color={isPaid ? 'success' : 'error'}
                                    sx={{ fontWeight: 700, fontSize: 11 }}
                                  />
                                </TableCell>
                                <TableCell align="right">
                                  <Typography variant="caption" color="text.secondary">
                                    {isPaid ? 'Lunas' : 'Konfirmasi manual'}
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6} align="center" sx={{ py: 2, color: 'text.secondary' }}>
                              Belum ada catatan tagihan
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              </CardContent>
            </Card>
          </Stack>
        )}

        {/* Footer */}
        <Box sx={{ mt: 5, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            &copy; 2026 {branding.product_name}. Powered by MWX-ISP Enterprise Platform.
          </Typography>
        </Box>
      </Container>

      {/* Copy Toast */}
      <Snackbar
        open={toast.open}
        autoHideDuration={2500}
        onClose={() => setToast({ open: false, message: '' })}
        message={toast.message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
};

export default CustomerPortalPage;
