import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box, Container, Card, CardContent, Typography, TextField, Button,
  Stack, Chip, Divider, Alert, Snackbar, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Tabs, Tab,
  useTheme
} from '@mui/material';
import {
  Search as SearchIcon,
  WhatsApp as WhatsAppIcon,
  ContentCopy as CopyIcon,
  Wifi as WifiIcon,
  CheckCircle as CheckCircleIcon,
  Lock as LockIcon,
  QrCode2 as QrCodeIcon,
  AccountBalance as BankIcon,
  FlashOn as FlashIcon,
  Timer as TimerIcon,
} from '@mui/icons-material';
import { useBranding } from '../branding/BrandingContext';

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

interface VAChannel {
  bank_name: string;
  bank_code: string;
  account_number: string;
  account_name: string;
  instructions: string;
}

interface PaymentChannelData {
  invoice_id: number;
  invoice_no: string;
  customer_id: number;
  customer_no: string;
  customer_name: string;
  package_name: string;
  amount: number;
  total: number;
  paid_amount: number;
  status: string;
  due_date: string;
  expires_at: string;
  qris_payload: string;
  merchant_name: string;
  va_channels: VAChannel[];
}

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

  // Payment Modal State
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceItem | null>(null);
  const [channelData, setChannelData] = useState<PaymentChannelData | null>(null);
  const [channelLoading, setChannelLoading] = useState(false);
  const [paymentTab, setPaymentTab] = useState(0);
  const [simulating, setSimulating] = useState(false);
  const [simulationSuccess, setSimulationSuccess] = useState<string | null>(null);

  const doSearch = async (searchTerm: string) => {
    const q = searchTerm.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/portal/lookup?q=${encodeURIComponent(q)}`, {
        headers: { Accept: 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Pelanggan tidak ditemukan. Pastikan data sudah sesuai.');
      }
      setData(json.data);
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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setToast({ open: true, message: `${label} berhasil disalin!` });
    });
  };

  const handleOpenPayment = async (inv: InvoiceItem) => {
    setSelectedInvoice(inv);
    setPaymentModalOpen(true);
    setChannelLoading(true);
    setSimulationSuccess(null);
    try {
      const res = await fetch(`/api/v1/portal/invoices/${inv.id}/payment-channel`, {
        headers: { Accept: 'application/json' },
      });
      const json = await res.json();
      if (res.ok && json.data) {
        setChannelData(json.data);
      } else {
        throw new Error(json.message || 'Gagal memuat kanal pembayaran');
      }
    } catch (err: any) {
      setToast({ open: true, message: err?.message || 'Gagal memuat QRIS & VA' });
    } finally {
      setChannelLoading(false);
    }
  };

  const handleSimulatePayment = async (method = 'qris_instant') => {
    if (!selectedInvoice) return;
    setSimulating(true);
    try {
      const res = await fetch(`/api/v1/portal/invoices/${selectedInvoice.id}/simulate-pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ method, reference: `SIM-${Date.now()}` }),
      });
      const json = await res.json();
      if (res.ok && json.data?.success) {
        setSimulationSuccess(`Pembayaran ${idrFormat(selectedInvoice.balance)} Berhasil Diverifikasi Instan! Layanan Aktif.`);
        // Reload customer portal data
        void doSearch(query);
      } else {
        throw new Error(json.message || 'Simulasi pembayaran gagal');
      }
    } catch (err: any) {
      setToast({ open: true, message: err?.message || 'Gagal memproses simulasi' });
    } finally {
      setSimulating(false);
    }
  };

  const openWhatsAppConfirmation = () => {
    if (!data) return;
    const amountStr = idrFormat(data.outstanding);
    const text = `Halo Admin ${branding.product_name},\nSaya atas nama ${data.name} (ID: ${data.customer_no}) ingin konfirmasi pembayaran tagihan internet sebesar ${amountStr}.\nMohon diverifikasi. Terima kasih!`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const unpaidInvoices = data?.invoices?.filter(i => i.balance > 0) || [];
  const firstUnpaid = unpaidInvoices[0];

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
              Customer Self-Service Portal
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
            label="PORTAL PELANGGAN RESMI"
            color="primary"
            size="small"
            sx={{ fontWeight: 800, letterSpacing: '0.1em', mb: 1.5, px: 1 }}
          />
          <Typography variant="h4" fontWeight={900} sx={{ mb: 1 }}>
            Cek Tagihan & Status Layanan
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 540, mx: 'auto', mb: 3 }}>
            Masukkan No. Pelanggan (e.g. MWX-000001), No. Telepon WhatsApp, atau No. KTP Anda untuk melihat tagihan dan bayar instan via QRIS.
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
                          Pilih pembayaran mandiri instan via QRIS / VA atau konfirmasi manual via WhatsApp.
                        </Typography>
                      </Box>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                        {firstUnpaid && (
                          <Button
                            variant="contained"
                            color="primary"
                            startIcon={<QrCodeIcon />}
                            onClick={() => handleOpenPayment(firstUnpaid)}
                            sx={{ fontWeight: 800, borderRadius: 2, px: 2.5, py: 1 }}
                          >
                            Bayar Sekarang (QRIS & VA)
                          </Button>
                        )}
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
                                  {!isPaid ? (
                                    <Button
                                      size="small"
                                      variant="contained"
                                      color="primary"
                                      startIcon={<QrCodeIcon sx={{ fontSize: 16 }} />}
                                      onClick={() => handleOpenPayment(inv)}
                                      sx={{ textTransform: 'none', fontWeight: 700, py: 0.25, px: 1.5 }}
                                    >
                                      Bayar
                                    </Button>
                                  ) : (
                                    <Typography variant="caption" color="text.secondary">
                                      Lunas
                                    </Typography>
                                  )}
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

      {/* DYNAMIC QRIS & VIRTUAL ACCOUNT PAYMENT DIALOG */}
      <Dialog
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" fontWeight={800}>
              Pembayaran Tagihan Instan
            </Typography>
            <Chip
              label={selectedInvoice?.invoice_no}
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 800, fontFamily: 'monospace' }}
            />
          </Stack>
        </DialogTitle>

        <DialogContent dividers>
          {channelLoading || !channelData ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <CircularProgress size={36} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Menghasilkan kode pembayaran QRIS dan nomor Virtual Account...
              </Typography>
            </Box>
          ) : simulationSuccess ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <CheckCircleIcon color="success" sx={{ fontSize: 64, mb: 1 }} />
              <Typography variant="h5" fontWeight={800} color="success.main" sx={{ mb: 1 }}>
                Pembayaran Berhasil!
              </Typography>
              <Typography variant="body1" sx={{ mb: 2 }}>
                {simulationSuccess}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                Notifikasi bukti bayar telah diteruskan via WhatsApp otomatis.
              </Typography>
            </Box>
          ) : (
            <Box>
              {/* Payment Summary Box */}
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2, mb: 2.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      TOTAL YANG HARUS DIBAYAR
                    </Typography>
                    <Typography variant="h4" fontWeight={900} color="primary.main" fontFamily="monospace">
                      {idrFormat(channelData.amount)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Pelanggan: <strong>{channelData.customer_name}</strong> ({channelData.package_name})
                    </Typography>
                  </Box>
                  <Chip
                    icon={<TimerIcon sx={{ fontSize: 16 }} />}
                    label="Batas: 24 Jam"
                    color="warning"
                    size="small"
                    sx={{ fontWeight: 700 }}
                  />
                </Stack>
              </Paper>

              <Tabs
                value={paymentTab}
                onChange={(_, v) => setPaymentTab(v)}
                variant="fullWidth"
                sx={{ mb: 2.5, borderBottom: 1, borderColor: 'divider' }}
              >
                <Tab icon={<QrCodeIcon />} iconPosition="start" label="QRIS Instan" sx={{ fontWeight: 700 }} />
                <Tab icon={<BankIcon />} iconPosition="start" label="Virtual Account (VA)" sx={{ fontWeight: 700 }} />
              </Tabs>

              {/* TAB 0: QRIS */}
              {paymentTab === 0 && (
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                    Scan QRIS di bawah ini menggunakan GoPay, OVO, Dana, ShopeePay, BCA Mobile, Livin' by Mandiri, BRImo, atau aplikasi m-Banking Anda.
                  </Typography>

                  {/* QRIS Frame */}
                  <Box
                    sx={{
                      display: 'inline-block',
                      p: 2,
                      bgcolor: '#fff',
                      borderRadius: 3,
                      border: '3px solid #000',
                      boxShadow: '4px 4px 0px #000',
                      mb: 2,
                    }}
                  >
                    <Box
                      sx={{
                        bgcolor: '#c00',
                        color: '#fff',
                        py: 0.5,
                        px: 2,
                        borderRadius: 1,
                        fontWeight: 900,
                        fontSize: 14,
                        letterSpacing: '0.1em',
                        mb: 1.5,
                      }}
                    >
                      QRIS STANDAR PEMBAYARAN NASIONAL
                    </Box>

                    {/* QR Code SVG / Visual Box */}
                    <Box
                      sx={{
                        width: 220,
                        height: 220,
                        mx: 'auto',
                        bgcolor: '#f5f5f5',
                        border: '2px dashed #999',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        p: 1.5,
                      }}
                    >
                      <QrCodeIcon sx={{ fontSize: 130, color: '#111' }} />
                      <Typography variant="caption" sx={{ color: '#333', fontWeight: 800, mt: -1 }}>
                        {channelData.merchant_name}
                      </Typography>
                    </Box>

                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1, color: '#333' }}>
                      NMID: ID1020038927163 • MWX-ISP BROADBAND
                    </Typography>
                  </Box>

                  <Stack direction="row" spacing={1} justifyContent="center">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<CopyIcon />}
                      onClick={() => copyToClipboard(channelData.qris_payload, 'Payload QRIS')}
                      sx={{ textTransform: 'none', fontWeight: 600 }}
                    >
                      Salin QRIS String
                    </Button>
                  </Stack>
                </Box>
              )}

              {/* TAB 1: VIRTUAL ACCOUNT */}
              {paymentTab === 1 && (
                <Stack spacing={2}>
                  {channelData.va_channels.map((va, idx) => (
                    <Paper key={idx} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Typography variant="subtitle2" fontWeight={800}>
                            {va.bank_name}
                          </Typography>
                          <Typography variant="h6" fontWeight={900} color="primary.main" fontFamily="monospace">
                            {va.account_number}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {va.account_name}
                          </Typography>
                        </Box>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<CopyIcon />}
                          onClick={() => copyToClipboard(va.account_number, va.bank_name)}
                          sx={{ textTransform: 'none', fontWeight: 700 }}
                        >
                          Salin
                        </Button>
                      </Stack>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1, pt: 1, borderTop: '1px dashed', borderColor: 'divider' }}>
                        Cara Bayar: {va.instructions}
                      </Typography>
                    </Paper>
                  ))}
                </Stack>
              )}

              {/* SIMULATION ACTION BUTTON */}
              <Divider sx={{ my: 3 }} />
              <Box sx={{ p: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.1)' : '#eff6ff', borderRadius: 2 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.5}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight={800} color="primary.main">
                      Uji Simulasi Bayar Instan (Self-Service Test)
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Verifikasi langsung transaksi pembayaran secara otomatis tanpa menunggu webhook bank.
                    </Typography>
                  </Box>
                  <Button
                    variant="contained"
                    color="secondary"
                    startIcon={<FlashIcon />}
                    onClick={() => handleSimulatePayment('qris_instant')}
                    disabled={simulating}
                    sx={{ fontWeight: 800, textTransform: 'none', minWidth: 160 }}
                  >
                    {simulating ? <CircularProgress size={20} color="inherit" /> : 'Simulasi Bayar'}
                  </Button>
                </Stack>
              </Box>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setPaymentModalOpen(false)}>
            {simulationSuccess ? 'Selesai' : 'Tutup'}
          </Button>
        </DialogActions>
      </Dialog>

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
