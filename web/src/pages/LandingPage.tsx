import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Container, Typography, Button, Stack, Chip,
  TextField, CircularProgress, Alert, Tabs, Tab, Divider,
  Paper, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, MenuItem, Select, FormControl, InputLabel
} from '@mui/material';
import Grid from '@mui/material/GridLegacy';
import {
  Security as SecurityIcon,
  SupportAgent as SupportAgentIcon,
  CheckCircle as CheckCircleIcon,
  Search as SearchIcon,
  WhatsApp as WhatsAppIcon,
  ConfirmationNumber as VoucherIcon,
  ReceiptLong as ReceiptIcon,
  AdminPanelSettings as AdminIcon,
  ArrowForward as ArrowForwardIcon,
  Router as RouterIcon,
  Dns as DnsIcon,
  VerifiedUser as ShieldIcon,
  Bolt as BoltIcon,
  Close as CloseIcon,
  HowToReg as RegisterIcon,
} from '@mui/icons-material';
import { useBranding } from '../branding/BrandingContext';
import { apiRequest } from '../utils/apiClient';

type PublicPackage = {
  id: string;
  code: string;
  name: string;
  price: number;
  description: string;
  billing_cycle: string;
  fup_limit_gb: number;
  up_rate_kbps: number;
  down_rate_kbps: number;
  speed_display: string;
  category: string;
};

type CustomerLookupResult = {
  customer_no: string;
  name: string;
  status: string;
  package_name: string;
  package_price: number;
  subscription_status: string;
  outstanding: number;
};

type VoucherLookupResult = {
  code: string;
  package_name?: string;
  price: number;
  status: string;
  validity_seconds: number;
  quota_bytes: number;
  used_bytes: number;
  quota_enforced: boolean;
  usage_available: boolean;
  expires_at?: string;
};

const idrFormat = (val?: number | null) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val || 0);

const formatBytes = (bytes: number) => {
  if (!bytes || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
};

const formatSeconds = (sec: number) => {
  if (!sec || sec <= 0) return 'Tidak Terbatas';
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  if (days > 0) return `${days} Hari ${hours > 0 ? `${hours} Jam` : ''}`;
  if (hours > 0) return `${hours} Jam`;
  const mins = Math.floor(sec / 60);
  return `${mins} Menit`;
};

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { branding } = useBranding();

  const accentColor = branding.accent_color || '#16A34A';
  const productName = branding.product_name || 'MWX-ISP';
  const tagline = branding.tagline || 'Enterprise ISP Management, Symmetrical Fiber & High-Speed Broadband';
  const heroHeadline = branding.hero_headline || 'Internet Simetris, Stabil & Bergaransi SLA 99.98%';
  const heroSubtitle = branding.hero_subtitle || 'Solusi jaringan backbone terpercaya untuk perumahan, perkantoran, instansi dan hotspot publik. Didukung multi-homed BGP routing, redundansi GPON optical ring, dan pemantauan NOC aktif 24 jam nonstop.';
  const tickerText = branding.ticker_text || '[ NOC LIVE STATUS ] Semua gateway BGP & GPON OLT beroperasi optimal | Bantuan 24/7 Hotline & WhatsApp Ready | Peering: OpenIXP, CDIX, Cloudflare, Google Edge';
  const contactWhatsApp = (branding.contact_whatsapp || '6281234567890').replace(/[^0-9]/g, '');
  const contactPhone = branding.contact_phone || '+62 21 5550 1234';
  const contactEmail = branding.contact_email || 'noc@mwx-isp.net';
  const contactAddress = branding.contact_address || 'Cyber Building 1, Lt. 5, Jl. Kuningan Barat No. 8, Jakarta Selatan';
  const coverageAreas = branding.coverage_areas || 'Jakarta, Tangerang, Bekasi, Depok, Bogor, Bandung, Surabaya';
  const slaUptime = branding.sla_uptime || '99.98%';
  const slaLatency = branding.sla_latency || '< 5 ms';

  // Package Data state
  const [packages, setPackages] = useState<PublicPackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState<boolean>(true);
  const [packageCategory, setPackageCategory] = useState<string>('all');

  // Interactive Tools state
  const [activeToolTab, setActiveToolTab] = useState<number>(0);

  // Bill search
  const [billQuery, setBillQuery] = useState('');
  const [billLoading, setBillLoading] = useState(false);
  const [billError, setBillError] = useState<string | null>(null);
  const [billResult, setBillResult] = useState<CustomerLookupResult | null>(null);

  // Voucher search
  const [voucherQuery, setVoucherQuery] = useState('');
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [voucherResult, setVoucherResult] = useState<VoucherLookupResult | null>(null);

  // Online Registration Modal State
  const [registerOpen, setRegisterOpen] = useState(false);
  const [regForm, setRegForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    package_id: '',
    id_card_number: '',
    notes: '',
  });
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<any | null>(null);

  const handleOpenRegister = (packageId?: string) => {
    setRegForm((prev) => ({
      ...prev,
      package_id: packageId || prev.package_id || (packages[0]?.id ?? ''),
    }));
    setRegError(null);
    setRegSuccess(null);
    setRegisterOpen(true);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regForm.name.trim() || !regForm.phone.trim() || !regForm.address.trim()) {
      setRegError('Nama Lengkap, Nomor WhatsApp / HP, dan Alamat Pemasangan wajib diisi.');
      return;
    }
    setRegLoading(true);
    setRegError(null);
    try {
      const result = await apiRequest<any>('/public/register', {
        method: 'POST',
        body: JSON.stringify(regForm),
      });
      setRegSuccess(result);
    } catch (err: any) {
      setRegError(err?.message || 'Terjadi kesalahan jaringan saat mengirim pendaftaran.');
    } finally {
      setRegLoading(false);
    }
  };

  useEffect(() => {
    const fetchPackages = async () => {
      setLoadingPackages(true);
      try {
        const result = await apiRequest<PublicPackage[]>('/public/packages');
        setPackages(result);
      } catch (e) {
        console.warn('Failed to fetch organization packages', e);
      } finally {
        setLoadingPackages(false);
      }
    };
    void fetchPackages();
  }, []);

  const handleBillSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = billQuery.trim();
    if (!q) return;
    setBillLoading(true);
    setBillError(null);
    setBillResult(null);
    try {
      const result = await apiRequest<any>(`/portal/lookup?q=${encodeURIComponent(q)}`);
      setBillResult(result);
    } catch (err: any) {
      setBillError(err?.message || 'Gagal memuat data pelanggan');
    } finally {
      setBillLoading(false);
    }
  };

  const handleVoucherSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = voucherQuery.trim();
    if (!code) return;
    setVoucherLoading(true);
    setVoucherError(null);
    setVoucherResult(null);
    try {
      const result = await apiRequest<VoucherLookupResult>(`/public/vouchers/check?code=${encodeURIComponent(code)}`);
      setVoucherResult(result);
    } catch (err: any) {
      setVoucherError(err?.message || 'Kode voucher tidak valid');
    } finally {
      setVoucherLoading(false);
    }
  };

  const handlePackageOrderWhatsApp = (pkg: PublicPackage) => {
    const text = encodeURIComponent(
      `Halo Tim Sales & CS ${productName},\nSaya ingin menanyakan pemasangan baru untuk paket internet:\n- Nama Paket: ${pkg.name}\n- Kecepatan: ${pkg.speed_display}\n- Tarif: ${idrFormat(pkg.price)} / bulan\nMohon info ketersediaan jaringan di area saya. Terima kasih!`
    );
    window.open(`https://wa.me/${contactWhatsApp}?text=${text}`, '_blank');
  };

  const handleCoverageWhatsApp = () => {
    const text = encodeURIComponent(
      `Halo CS ${productName},\nSaya ingin cek jangkauan jaringan Fiber Optic & Dedicated Internet untuk lokasi saya. Mohon informasi teknis dan coverage map.`
    );
    window.open(`https://wa.me/${contactWhatsApp}?text=${text}`, '_blank');
  };

  const filteredPackages = packages.filter((pkg) => {
    if (packageCategory === 'all') return true;
    if (packageCategory === 'home') return pkg.category.toLowerCase().includes('home') || pkg.category.toLowerCase().includes('broadband');
    if (packageCategory === 'business') return pkg.category.toLowerCase().includes('corp') || pkg.category.toLowerCase().includes('business') || pkg.category.toLowerCase().includes('enterprise');
    if (packageCategory === 'hotspot') return pkg.category.toLowerCase().includes('hotspot') || pkg.category.toLowerCase().includes('prepaid');
    return true;
  });

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#080C14',
        color: '#F8FAFC',
        fontFamily: '"Plus Jakarta Sans", "Inter", -apple-system, sans-serif',
        overflowX: 'hidden',
        position: 'relative',
        '& ::selection': {
          bgcolor: accentColor,
          color: '#000',
        },
      }}
    >
      {/* BACKGROUND GRAPHIC ACCENTS: Manga halftone & technical grid */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 700,
          backgroundImage: `
            radial-gradient(circle at 50% 20%, ${accentColor}18 0%, transparent 60%),
            linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 40px 40px, 40px 40px',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* TOP TECHNICAL TICKER STRIP */}
      <Box
        sx={{
          bgcolor: '#04070C',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          py: 0.8,
          px: 2,
          fontSize: '0.75rem',
          fontFamily: '"JetBrains Mono", monospace',
          color: '#94A3B8',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.8,
              color: accentColor,
              fontWeight: 700,
            }}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: accentColor,
                boxShadow: `0 0 8px ${accentColor}`,
                animation: 'pulse 2s infinite',
                '@keyframes pulse': {
                  '0%': { opacity: 1 },
                  '50%': { opacity: 0.4 },
                  '100%': { opacity: 1 },
                },
              }}
            />
            {tickerText}
          </Box>
        </Stack>

        <Stack direction="row" spacing={2} alignItems="center">
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
            SLA JAMINAN KONEKTIVITAS: {slaUptime}
          </Box>
          <Button
            size="small"
            onClick={() => navigate('/login')}
            startIcon={<AdminIcon sx={{ fontSize: '0.9rem !important' }} />}
            sx={{
              color: '#F8FAFC',
              bgcolor: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.15)',
              textTransform: 'none',
              fontSize: '0.72rem',
              py: 0.2,
              px: 1.2,
              fontFamily: '"JetBrains Mono", monospace',
              '&:hover': {
                bgcolor: accentColor,
                color: '#000',
                borderColor: accentColor,
              },
            }}
          >
            Operator Login
          </Button>
        </Stack>
      </Box>

      {/* MAIN TOP NAVIGATION BAR */}
      <Box
        component="header"
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backdropFilter: 'blur(16px)',
          bgcolor: 'rgba(8, 12, 20, 0.85)',
          borderBottom: '2px solid #000',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}
      >
        <Container maxWidth="lg">
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ height: 72 }}
          >
            {/* BRAND LOGO & TITLE */}
            <Stack
              direction="row"
              spacing={1.5}
              alignItems="center"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              sx={{ cursor: 'pointer' }}
            >
              {branding.logo_url ? (
                <Box
                  component="img"
                  src={branding.logo_url}
                  alt={productName}
                  sx={{
                    height: 42,
                    maxHeight: 42,
                    objectFit: 'contain',
                    border: '2px solid #000',
                    bgcolor: '#FFF',
                    p: 0.4,
                    boxShadow: '2px 2px 0px #000',
                  }}
                />
              ) : (
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    bgcolor: accentColor,
                    color: '#000',
                    fontWeight: 900,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid #000',
                    boxShadow: '3px 3px 0px #000',
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: '1.2rem',
                  }}
                >
                  {branding.short_name || 'ISP'}
                </Box>
              )}
              <Box>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 900,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.1,
                    color: '#FFF',
                    fontSize: '1.25rem',
                  }}
                >
                  {productName}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: '#94A3B8',
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: '0.68rem',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  {tagline}
                </Typography>
              </Box>
            </Stack>

            {/* NAV LINKS (DESKTOP) */}
            <Stack
              direction="row"
              spacing={3}
              alignItems="center"
              sx={{ display: { xs: 'none', md: 'flex' } }}
            >
              <Typography
                component="a"
                href="#packages"
                sx={{
                  color: '#CBD5E1',
                  textDecoration: 'none',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  transition: 'color 0.2s',
                  '&:hover': { color: accentColor },
                }}
              >
                Paket Internet
              </Typography>
              <Typography
                component="a"
                href="#self-service"
                sx={{
                  color: '#CBD5E1',
                  textDecoration: 'none',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  transition: 'color 0.2s',
                  '&:hover': { color: accentColor },
                }}
              >
                Cek Tagihan & Voucher
              </Typography>
              <Typography
                component="a"
                href="#features"
                sx={{
                  color: '#CBD5E1',
                  textDecoration: 'none',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  transition: 'color 0.2s',
                  '&:hover': { color: accentColor },
                }}
              >
                Jaminan SLA
              </Typography>
              <Typography
                component="a"
                href="#coverage"
                sx={{
                  color: '#CBD5E1',
                  textDecoration: 'none',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  transition: 'color 0.2s',
                  '&:hover': { color: accentColor },
                }}
              >
                Cakupan Area
              </Typography>
            </Stack>

            {/* RIGHT ACTION BUTTONS */}
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Button
                variant="outlined"
                onClick={() => navigate('/portal')}
                startIcon={<ReceiptIcon />}
                sx={{
                  color: '#FFF',
                  borderColor: 'rgba(255,255,255,0.3)',
                  borderWidth: '2px',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  textTransform: 'none',
                  borderRadius: 0,
                  boxShadow: '3px 3px 0px #000',
                  '&:hover': {
                    borderColor: '#FFF',
                    bgcolor: 'rgba(255,255,255,0.08)',
                    boxShadow: '2px 2px 0px #000',
                  },
                }}
              >
                Portal Pelanggan
              </Button>

              <Button
                variant="contained"
                onClick={() => handleOpenRegister()}
                startIcon={<RegisterIcon />}
                sx={{
                  bgcolor: accentColor,
                  color: '#000',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  textTransform: 'none',
                  borderRadius: 0,
                  border: '2px solid #000',
                  boxShadow: '3px 3px 0px #000',
                  '&:hover': {
                    bgcolor: '#FFF',
                    color: '#000',
                    boxShadow: '1px 1px 0px #000',
                  },
                }}
              >
                Pasang Baru
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>

      {/* HERO SECTION (MANGA ENTERPRISE STYLE) */}
      <Box
        component="section"
        sx={{
          py: { xs: 8, md: 12 },
          position: 'relative',
          zIndex: 1,
          borderBottom: '2px solid #000',
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={5} alignItems="center">
            <Grid item xs={12} md={7}>
              {/* CATEGORY TAG */}
              <Box sx={{ mb: 2 }}>
                <Chip
                  label="[ ENTERPRISE BROADBAND & FIBER NETWORK ]"
                  size="small"
                  sx={{
                    bgcolor: 'rgba(255,255,255,0.06)',
                    color: accentColor,
                    border: '1px solid ' + accentColor,
                    fontFamily: '"JetBrains Mono", monospace',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    borderRadius: 0,
                  }}
                />
              </Box>

              {/* HEADLINE */}
              <Typography
                variant="h2"
                sx={{
                  fontWeight: 900,
                  fontSize: { xs: '2.3rem', md: '3.6rem' },
                  lineHeight: 1.1,
                  letterSpacing: '-0.03em',
                  color: '#FFFFFF',
                  mb: 3,
                }}
              >
                {heroHeadline}
              </Typography>

              {/* SUBTITLE */}
              <Typography
                variant="body1"
                sx={{
                  color: '#94A3B8',
                  fontSize: { xs: '1rem', md: '1.2rem' },
                  lineHeight: 1.6,
                  maxWidth: 600,
                  mb: 4,
                }}
              >
                {heroSubtitle}
              </Typography>

              {/* CTA BUTTONS */}
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                sx={{ mb: 5 }}
              >
                <Button
                  variant="contained"
                  onClick={() => handleOpenRegister()}
                  startIcon={<RegisterIcon />}
                  sx={{
                    bgcolor: accentColor,
                    color: '#000',
                    fontWeight: 900,
                    fontSize: '1rem',
                    py: 1.5,
                    px: 3.5,
                    borderRadius: 0,
                    border: '2px solid #000',
                    boxShadow: '4px 4px 0px #000',
                    '&:hover': {
                      bgcolor: '#FFF',
                      color: '#000',
                      boxShadow: '2px 2px 0px #000',
                    },
                  }}
                >
                  Daftar Pasang Baru
                </Button>

                <Button
                  variant="outlined"
                  href="#packages"
                  endIcon={<ArrowForwardIcon />}
                  sx={{
                    color: '#FFF',
                    borderColor: 'rgba(255,255,255,0.4)',
                    borderWidth: '2px',
                    fontWeight: 700,
                    fontSize: '1rem',
                    py: 1.5,
                    px: 3,
                    borderRadius: 0,
                    boxShadow: '4px 4px 0px #000',
                    '&:hover': {
                      borderColor: '#FFF',
                      bgcolor: 'rgba(255,255,255,0.08)',
                      boxShadow: '2px 2px 0px #000',
                    },
                  }}
                >
                  Lihat Pilihan Paket
                </Button>

                <Button
                  variant="outlined"
                  href="#self-service"
                  startIcon={<SearchIcon />}
                  sx={{
                    color: '#FFF',
                    borderColor: 'rgba(255,255,255,0.4)',
                    borderWidth: '2px',
                    fontWeight: 700,
                    fontSize: '1rem',
                    py: 1.5,
                    px: 2.5,
                    borderRadius: 0,
                    boxShadow: '4px 4px 0px #000',
                    '&:hover': {
                      borderColor: '#FFF',
                      bgcolor: 'rgba(255,255,255,0.08)',
                      boxShadow: '2px 2px 0px #000',
                    },
                  }}
                >
                  Cek Tagihan / Voucher
                </Button>
              </Stack>

              {/* QUICK HIGHLIGHTS PILLS */}
              <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap', gap: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <CheckCircleIcon sx={{ color: accentColor, fontSize: '1.1rem' }} />
                  <Typography variant="caption" sx={{ fontWeight: 600, color: '#CBD5E1' }}>
                    100% Fiber Optic 1:1
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                  <CheckCircleIcon sx={{ color: accentColor, fontSize: '1.1rem' }} />
                  <Typography variant="caption" sx={{ fontWeight: 600, color: '#CBD5E1' }}>
                    Tanpa FUP / Unlimited Kuota
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                  <CheckCircleIcon sx={{ color: accentColor, fontSize: '1.1rem' }} />
                  <Typography variant="caption" sx={{ fontWeight: 600, color: '#CBD5E1' }}>
                    Dukungan Teknisi 24/7
                  </Typography>
                </Stack>
              </Stack>
            </Grid>

            {/* HERO RIGHT: TECHNICAL METRICS PANEL */}
            <Grid item xs={12} md={5}>
              <Paper
                elevation={0}
                sx={{
                  bgcolor: '#0D131F',
                  border: '2px solid #000',
                  boxShadow: `8px 8px 0px ${accentColor}`,
                  p: 3.5,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Panel Watermark Header */}
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '2px solid #000',
                    pb: 1.5,
                    mb: 3,
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontFamily: '"JetBrains Mono", monospace',
                      fontWeight: 800,
                      color: accentColor,
                      letterSpacing: '0.08em',
                    }}
                  >
                    SYSTEM BENCHMARK METRICS
                  </Typography>
                  <Chip
                    label="LIVE"
                    size="small"
                    sx={{
                      height: 20,
                      bgcolor: accentColor,
                      color: '#000',
                      fontWeight: 900,
                      fontSize: '0.65rem',
                      borderRadius: 0,
                    }}
                  />
                </Box>

                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Box
                      sx={{
                        p: 2,
                        bgcolor: '#080C14',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <Typography variant="caption" sx={{ color: '#94A3B8', fontFamily: '"JetBrains Mono", monospace' }}>
                        UPTIME SLA
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 900, color: '#FFF', my: 0.5 }}>
                        {slaUptime}
                      </Typography>
                      <Typography variant="caption" sx={{ color: accentColor, display: 'block' }}>
                        Dual Ring Redundancy
                      </Typography>
                    </Box>
                  </Grid>

                  <Grid item xs={6}>
                    <Box
                      sx={{
                        p: 2,
                        bgcolor: '#080C14',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <Typography variant="caption" sx={{ color: '#94A3B8', fontFamily: '"JetBrains Mono", monospace' }}>
                        LOCAL LATENCY
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 900, color: '#FFF', my: 0.5 }}>
                        {slaLatency}
                      </Typography>
                      <Typography variant="caption" sx={{ color: accentColor, display: 'block' }}>
                        Direct OpenIXP / IIX
                      </Typography>
                    </Box>
                  </Grid>

                  <Grid item xs={6}>
                    <Box
                      sx={{
                        p: 2,
                        bgcolor: '#080C14',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <Typography variant="caption" sx={{ color: '#94A3B8', fontFamily: '"JetBrains Mono", monospace' }}>
                        BANDWIDTH RATIO
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 900, color: '#FFF', my: 0.5 }}>
                        1 : 1
                      </Typography>
                      <Typography variant="caption" sx={{ color: accentColor, display: 'block' }}>
                        Symmetric Up/Down
                      </Typography>
                    </Box>
                  </Grid>

                  <Grid item xs={6}>
                    <Box
                      sx={{
                        p: 2,
                        bgcolor: '#080C14',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <Typography variant="caption" sx={{ color: '#94A3B8', fontFamily: '"JetBrains Mono", monospace' }}>
                        NOC RESPONSE
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 900, color: '#FFF', my: 0.5 }}>
                        &lt; 15 Mnt
                      </Typography>
                      <Typography variant="caption" sx={{ color: accentColor, display: 'block' }}>
                        24/7 Helpdesk & WA
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>

                <Box
                  sx={{
                    mt: 3,
                    p: 1.5,
                    bgcolor: 'rgba(255,255,255,0.03)',
                    border: '1px dashed rgba(255,255,255,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                  }}
                >
                  <SecurityIcon sx={{ color: accentColor }} />
                  <Typography variant="caption" sx={{ color: '#94A3B8', lineHeight: 1.4 }}>
                    Infrastruktur terhubung ke Tier-1 Transit Provider dengan proteksi DDoS bawaan & IPv6 native dual-stack.
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* DYNAMIC PACKAGES SHOWCASE */}
      <Box
        id="packages"
        component="section"
        sx={{
          py: { xs: 8, md: 12 },
          bgcolor: '#0B101A',
          borderBottom: '2px solid #000',
        }}
      >
        <Container maxWidth="lg">
          <Stack spacing={2} alignItems="center" textAlign="center" sx={{ mb: 6 }}>
            <Chip
              label="[ TARIF TRANSPARAN & TANPA BIAYA TERSEMBUNYI ]"
              size="small"
              sx={{
                bgcolor: 'rgba(255,255,255,0.06)',
                color: accentColor,
                border: '1px solid ' + accentColor,
                fontFamily: '"JetBrains Mono", monospace',
                fontWeight: 700,
                borderRadius: 0,
              }}
            />
            <Typography
              variant="h3"
              sx={{
                fontWeight: 900,
                fontSize: { xs: '2rem', md: '2.8rem' },
                letterSpacing: '-0.02em',
                color: '#FFF',
              }}
            >
              Pilihan Paket Internet Sesuai Kebutuhan
            </Typography>
            <Typography variant="body1" sx={{ color: '#94A3B8', maxWidth: 650 }}>
              Semua paket internet dikelola langsung oleh platform MWX-ISP dengan alokasi bandwidth dedicated, tanpa rekayasa rasio bandwidth palsu.
            </Typography>

            {/* CATEGORY FILTER TABS */}
            <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', justifyContent: 'center', gap: 1 }}>
              {[
                { id: 'all', label: 'Semua Paket' },
                { id: 'home', label: 'Broadband Rumah' },
                { id: 'business', label: 'Bisnis & Dedicated' },
                { id: 'hotspot', label: 'Voucher Hotspot' },
              ].map((tab) => (
                <Button
                  key={tab.id}
                  onClick={() => setPackageCategory(tab.id)}
                  variant={packageCategory === tab.id ? 'contained' : 'outlined'}
                  size="small"
                  sx={{
                    bgcolor: packageCategory === tab.id ? accentColor : 'transparent',
                    color: packageCategory === tab.id ? '#000' : '#CBD5E1',
                    borderColor: packageCategory === tab.id ? '#000' : 'rgba(255,255,255,0.2)',
                    fontWeight: 700,
                    textTransform: 'none',
                    borderRadius: 0,
                    borderWidth: '2px',
                    boxShadow: packageCategory === tab.id ? '3px 3px 0px #000' : 'none',
                    '&:hover': {
                      bgcolor: packageCategory === tab.id ? accentColor : 'rgba(255,255,255,0.08)',
                      borderColor: packageCategory === tab.id ? '#000' : '#FFF',
                    },
                  }}
                >
                  {tab.label}
                </Button>
              ))}
            </Stack>
          </Stack>

          {loadingPackages ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress sx={{ color: accentColor }} />
            </Box>
          ) : (
            <Grid container spacing={3.5} alignItems="stretch">
              {filteredPackages.map((pkg, idx) => {
                const isFeatured = idx === 1 || pkg.category.toLowerCase().includes('corp');
                return (
                  <Grid item xs={12} sm={6} md={3} key={pkg.id || idx}>
                    <Paper
                      elevation={0}
                      sx={{
                        height: '100%',
                        bgcolor: isFeatured ? '#111827' : '#0E1422',
                        border: '2px solid',
                        borderColor: isFeatured ? accentColor : '#000',
                        boxShadow: isFeatured ? `6px 6px 0px ${accentColor}` : '5px 5px 0px #000',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        p: 3,
                        position: 'relative',
                        transition: 'transform 0.2s',
                        '&:hover': {
                          transform: 'translateY(-4px)',
                        },
                      }}
                    >
                      {isFeatured && (
                        <Box
                          sx={{
                            position: 'absolute',
                            top: -12,
                            right: 16,
                            bgcolor: accentColor,
                            color: '#000',
                            fontWeight: 900,
                            fontSize: '0.68rem',
                            fontFamily: '"JetBrains Mono", monospace',
                            px: 1.2,
                            py: 0.3,
                            border: '1.5px solid #000',
                            boxShadow: '2px 2px 0px #000',
                          }}
                        >
                          PALING DIMINATI
                        </Box>
                      )}

                      <Box>
                        {/* CATEGORY & SPEED DISPLAY */}
                        <Typography
                          variant="caption"
                          sx={{
                            fontFamily: '"JetBrains Mono", monospace',
                            color: accentColor,
                            fontWeight: 800,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {pkg.category || 'BROADBAND'}
                        </Typography>

                        <Typography variant="h5" sx={{ fontWeight: 900, color: '#FFF', mt: 0.5, mb: 1.5 }}>
                          {pkg.name}
                        </Typography>

                        {/* SPEED BIG NUMBER */}
                        <Box
                          sx={{
                            bgcolor: '#080C14',
                            border: '1px solid rgba(255,255,255,0.1)',
                            p: 1.5,
                            my: 1.5,
                            textAlign: 'center',
                          }}
                        >
                          <Typography
                            variant="h4"
                            sx={{
                              fontWeight: 900,
                              fontFamily: '"JetBrains Mono", monospace',
                              color: '#FFF',
                              letterSpacing: '-0.02em',
                            }}
                          >
                            {pkg.speed_display || 'High Speed'}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#94A3B8' }}>
                            Simetris Upload & Download
                          </Typography>
                        </Box>

                        {/* PRICE */}
                        <Box sx={{ my: 2 }}>
                          <Typography
                            variant="h5"
                            sx={{
                              fontWeight: 900,
                              color: accentColor,
                              fontFamily: '"JetBrains Mono", monospace',
                            }}
                          >
                            {idrFormat(pkg.price)}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#64748B' }}>
                            per {pkg.billing_cycle === 'monthly' ? 'bulan' : pkg.billing_cycle || 'bulan'} (belum termasuk PPN)
                          </Typography>
                        </Box>

                        <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.08)' }} />

                        {/* FEATURES LIST */}
                        <Stack spacing={1.2} sx={{ mb: 3 }}>
                          <Stack direction="row" spacing={1} alignItems="flex-start">
                            <BoltIcon sx={{ fontSize: '1.1rem', color: accentColor, mt: 0.2 }} />
                            <Typography variant="caption" sx={{ color: '#CBD5E1', lineHeight: 1.4 }}>
                              {pkg.description || 'Koneksi optik stabil tanpa batas kuota FUP.'}
                            </Typography>
                          </Stack>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <CheckCircleIcon sx={{ fontSize: '1rem', color: accentColor }} />
                            <Typography variant="caption" sx={{ color: '#CBD5E1' }}>
                              Gratis Sewa Modem WiFi GPON
                            </Typography>
                          </Stack>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <CheckCircleIcon sx={{ fontSize: '1rem', color: accentColor }} />
                            <Typography variant="caption" sx={{ color: '#CBD5E1' }}>
                              Prioritas Eskalasi Gangguan
                            </Typography>
                          </Stack>
                          {pkg.fup_limit_gb > 0 ? (
                            <Stack direction="row" spacing={1} alignItems="center">
                              <CheckCircleIcon sx={{ fontSize: '1rem', color: accentColor }} />
                              <Typography variant="caption" sx={{ color: '#CBD5E1' }}>
                                FUP Fair Usage: {pkg.fup_limit_gb} GB
                              </Typography>
                            </Stack>
                          ) : (
                            <Stack direction="row" spacing={1} alignItems="center">
                              <CheckCircleIcon sx={{ fontSize: '1rem', color: accentColor }} />
                              <Typography variant="caption" sx={{ color: '#CBD5E1' }}>
                                100% Unlimited Kuota
                              </Typography>
                            </Stack>
                          )}
                        </Stack>
                      </Box>

                      {/* ORDER CTA BUTTONS */}
                      <Stack spacing={1}>
                        <Button
                          fullWidth
                          variant="contained"
                          onClick={() => handleOpenRegister(pkg.id)}
                          startIcon={<RegisterIcon />}
                          sx={{
                            bgcolor: accentColor,
                            color: '#000',
                            fontWeight: 800,
                            borderRadius: 0,
                            border: '2px solid #000',
                            textTransform: 'none',
                            boxShadow: '3px 3px 0px #000',
                            '&:hover': {
                              bgcolor: '#FFF',
                              color: '#000',
                              boxShadow: '1px 1px 0px #000',
                            },
                          }}
                        >
                          Daftar Pasang Baru
                        </Button>
                        <Button
                          fullWidth
                          variant="outlined"
                          size="small"
                          onClick={() => handlePackageOrderWhatsApp(pkg)}
                          startIcon={<WhatsAppIcon />}
                          sx={{
                            color: '#CBD5E1',
                            borderColor: 'rgba(255,255,255,0.2)',
                            borderRadius: 0,
                            textTransform: 'none',
                            fontSize: '0.78rem',
                            '&:hover': {
                              borderColor: '#FFF',
                              color: '#FFF',
                              bgcolor: 'rgba(255,255,255,0.05)',
                            },
                          }}
                        >
                          Tanya via WhatsApp
                        </Button>
                      </Stack>
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </Container>
      </Box>

      {/* INTERACTIVE SELF-SERVICE TOOLS: BILL & VOUCHER LOOKUP */}
      <Box
        id="self-service"
        component="section"
        sx={{
          py: { xs: 8, md: 12 },
          bgcolor: '#080C14',
          borderBottom: '2px solid #000',
        }}
      >
        <Container maxWidth="md">
          <Stack spacing={2} alignItems="center" textAlign="center" sx={{ mb: 5 }}>
            <Chip
              label="[ PUSAT LAYANAN MANDIRI PELANGGAN ]"
              size="small"
              sx={{
                bgcolor: 'rgba(255,255,255,0.06)',
                color: accentColor,
                border: '1px solid ' + accentColor,
                fontFamily: '"JetBrains Mono", monospace',
                fontWeight: 700,
                borderRadius: 0,
              }}
            />
            <Typography
              variant="h3"
              sx={{
                fontWeight: 900,
                fontSize: { xs: '1.8rem', md: '2.5rem' },
                color: '#FFF',
              }}
            >
              Cek Tagihan & Validitas Voucher
            </Typography>
            <Typography variant="body1" sx={{ color: '#94A3B8' }}>
              Pelanggan dapat langsung mengecek status tagihan bulanan atau mengecek sisa kuota voucher hotspot tanpa harus login.
            </Typography>
          </Stack>

          <Paper
            elevation={0}
            sx={{
              bgcolor: '#0E1422',
              border: '2px solid #000',
              boxShadow: `8px 8px 0px #000`,
              overflow: 'hidden',
            }}
          >
            {/* TABS HEADER */}
            <Tabs
              value={activeToolTab}
              onChange={(_, val) => setActiveToolTab(val)}
              variant="fullWidth"
              sx={{
                bgcolor: '#080C14',
                borderBottom: '2px solid #000',
                '& .MuiTabs-indicator': {
                  bgcolor: accentColor,
                  height: 3,
                },
                '& .MuiTab-root': {
                  color: '#94A3B8',
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  textTransform: 'none',
                  py: 2,
                  '&.Mui-selected': {
                    color: '#FFF',
                    bgcolor: 'rgba(255,255,255,0.03)',
                  },
                },
              }}
            >
              <Tab icon={<ReceiptIcon />} iconPosition="start" label="Cek Tagihan Internet Pelanggan" />
              <Tab icon={<VoucherIcon />} iconPosition="start" label="Cek Sisa Kuota Voucher Hotspot" />
            </Tabs>

            <Box sx={{ p: { xs: 3, sm: 5 } }}>
              {/* TAB 0: BILL LOOKUP */}
              {activeToolTab === 0 && (
                <Box>
                  <Typography variant="body2" sx={{ color: '#94A3B8', mb: 2 }}>
                    Masukkan Nomor Pelanggan (contoh: <code>CUST-0001</code>), Nomor HP yang terdaftar, atau No KTP Anda:
                  </Typography>

                  <Box component="form" onSubmit={handleBillSearch}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 3 }}>
                      <TextField
                        fullWidth
                        placeholder="Ketik Nomor Pelanggan / No WhatsApp..."
                        value={billQuery}
                        onChange={(e) => setBillQuery(e.target.value)}
                        variant="outlined"
                        size="medium"
                        sx={{
                          bgcolor: '#080C14',
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 0,
                            border: '1.5px solid rgba(255,255,255,0.2)',
                            color: '#FFF',
                            fontFamily: '"JetBrains Mono", monospace',
                            '&.Mui-focused fieldset': {
                              borderColor: accentColor,
                            },
                          },
                        }}
                      />
                      <Button
                        type="submit"
                        variant="contained"
                        disabled={billLoading || !billQuery.trim()}
                        startIcon={billLoading ? <CircularProgress size={18} color="inherit" /> : <SearchIcon />}
                        sx={{
                          bgcolor: accentColor,
                          color: '#000',
                          fontWeight: 800,
                          fontSize: '0.95rem',
                          px: 4,
                          py: { xs: 1.5, sm: 'auto' },
                          borderRadius: 0,
                          border: '2px solid #000',
                          boxShadow: '3px 3px 0px #000',
                          '&:hover': {
                            bgcolor: '#FFF',
                            color: '#000',
                          },
                        }}
                      >
                        Cek Tagihan
                      </Button>
                    </Stack>
                  </Box>

                  {billError && (
                    <Alert severity="error" sx={{ borderRadius: 0, mb: 3, border: '1px solid #EF4444' }}>
                      {billError}
                    </Alert>
                  )}

                  {billResult && (
                    <Paper
                      sx={{
                        p: 3,
                        bgcolor: '#080C14',
                        border: '1.5px solid rgba(255,255,255,0.15)',
                        borderLeft: `4px solid ${accentColor}`,
                      }}
                    >
                      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ mb: 2 }}>
                        <Box>
                          <Typography variant="caption" sx={{ color: '#94A3B8', fontFamily: '"JetBrains Mono", monospace' }}>
                            [ PELANGGAN: {billResult.customer_no} ]
                          </Typography>
                          <Typography variant="h5" sx={{ fontWeight: 900, color: '#FFF' }}>
                            {billResult.name}
                          </Typography>
                          <Typography variant="body2" sx={{ color: accentColor, mt: 0.5 }}>
                            Paket: {billResult.package_name || '-'} ({idrFormat(billResult.package_price)} / bln)
                          </Typography>
                        </Box>

                        <Box sx={{ mt: { xs: 2, sm: 0 }, textAlign: { xs: 'left', sm: 'right' } }}>
                          <Typography variant="caption" sx={{ color: '#94A3B8' }}>
                            TOTAL TAGIHAN BELUM DIBAYAR:
                          </Typography>
                          <Typography
                            variant="h4"
                            sx={{
                              fontWeight: 900,
                              color: billResult.outstanding > 0 ? '#EF4444' : accentColor,
                              fontFamily: '"JetBrains Mono", monospace',
                            }}
                          >
                            {idrFormat(billResult.outstanding)}
                          </Typography>
                          <Chip
                            label={billResult.outstanding > 0 ? 'MENUNGGU PEMBAYARAN' : 'SEMUA LUNAS'}
                            size="small"
                            sx={{
                              borderRadius: 0,
                              fontWeight: 800,
                              bgcolor: billResult.outstanding > 0 ? '#EF4444' : accentColor,
                              color: billResult.outstanding > 0 ? '#FFF' : '#000',
                              mt: 0.5,
                            }}
                          />
                        </Box>
                      </Stack>

                      <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.08)' }} />

                      <Stack direction="row" spacing={2} justifyContent="flex-end">
                        <Button
                          variant="contained"
                          onClick={() => navigate(`/portal?q=${encodeURIComponent(billResult.customer_no)}`)}
                          endIcon={<ArrowForwardIcon />}
                          sx={{
                            bgcolor: accentColor,
                            color: '#000',
                            fontWeight: 800,
                            borderRadius: 0,
                            border: '2px solid #000',
                            boxShadow: '3px 3px 0px #000',
                            '&:hover': {
                              bgcolor: '#FFF',
                              color: '#000',
                            },
                          }}
                        >
                          Buka Portal & Bayar Sekarang
                        </Button>
                      </Stack>
                    </Paper>
                  )}
                </Box>
              )}

              {/* TAB 1: VOUCHER LOOKUP */}
              {activeToolTab === 1 && (
                <Box>
                  <Typography variant="body2" sx={{ color: '#94A3B8', mb: 2 }}>
                    Masukkan Kode Voucher Hotspot yang tertera pada kartu atau struk voucher Anda:
                  </Typography>

                  <Box component="form" onSubmit={handleVoucherSearch}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 3 }}>
                      <TextField
                        fullWidth
                        placeholder="Contoh: VCR-AB1234 atau KODE..."
                        value={voucherQuery}
                        onChange={(e) => setVoucherQuery(e.target.value.toUpperCase())}
                        variant="outlined"
                        size="medium"
                        sx={{
                          bgcolor: '#080C14',
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 0,
                            border: '1.5px solid rgba(255,255,255,0.2)',
                            color: '#FFF',
                            fontFamily: '"JetBrains Mono", monospace',
                            textTransform: 'uppercase',
                            '&.Mui-focused fieldset': {
                              borderColor: accentColor,
                            },
                          },
                        }}
                      />
                      <Button
                        type="submit"
                        variant="contained"
                        disabled={voucherLoading || !voucherQuery.trim()}
                        startIcon={voucherLoading ? <CircularProgress size={18} color="inherit" /> : <SearchIcon />}
                        sx={{
                          bgcolor: accentColor,
                          color: '#000',
                          fontWeight: 800,
                          fontSize: '0.95rem',
                          px: 4,
                          py: { xs: 1.5, sm: 'auto' },
                          borderRadius: 0,
                          border: '2px solid #000',
                          boxShadow: '3px 3px 0px #000',
                          '&:hover': {
                            bgcolor: '#FFF',
                            color: '#000',
                          },
                        }}
                      >
                        Cek Voucher
                      </Button>
                    </Stack>
                  </Box>

                  {voucherError && (
                    <Alert severity="error" sx={{ borderRadius: 0, mb: 3, border: '1px solid #EF4444' }}>
                      {voucherError}
                    </Alert>
                  )}

                  {voucherResult && (
                    <Paper
                      sx={{
                        p: 3,
                        bgcolor: '#080C14',
                        border: '1.5px solid rgba(255,255,255,0.15)',
                        borderLeft: `4px solid ${accentColor}`,
                      }}
                    >
                      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                        <Box>
                          <Typography variant="caption" sx={{ color: '#94A3B8', fontFamily: '"JetBrains Mono", monospace' }}>
                            [ KODE VOUCHER: {voucherResult.code} ]
                          </Typography>
                          <Typography variant="h5" sx={{ fontWeight: 900, color: '#FFF' }}>
                            {voucherResult.package_name || 'Voucher Hotspot Reguler'}
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#94A3B8', mt: 0.5 }}>
                            Masa Berlaku: {formatSeconds(voucherResult.validity_seconds)}
                          </Typography>
                        </Box>

                        <Box sx={{ mt: { xs: 2, sm: 0 }, textAlign: { xs: 'left', sm: 'right' } }}>
                          <Chip
                            label={`STATUS: ${voucherResult.status.toUpperCase()}`}
                            size="small"
                            sx={{
                              borderRadius: 0,
                              fontWeight: 900,
                              bgcolor: voucherResult.status === 'active' ? accentColor : '#64748B',
                              color: voucherResult.status === 'active' ? '#000' : '#FFF',
                              fontFamily: '"JetBrains Mono", monospace',
                            }}
                          />
                          <Typography variant="h6" sx={{ fontWeight: 800, color: '#FFF', mt: 1 }}>
                            {idrFormat(voucherResult.price)}
                          </Typography>
                        </Box>
                      </Stack>

                      <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.08)' }} />

                      <Alert severity="info" sx={{ mt: 2 }}>
                        {voucherResult.quota_enforced && voucherResult.usage_available
                          ? `Data usage: ${formatBytes(voucherResult.used_bytes)} of ${formatBytes(voucherResult.quota_bytes)}`
                          : 'Data quota is not enforced or measured. Any stored quota value is informational only.'}
                      </Alert>
                    </Paper>
                  )}
                </Box>
              )}
            </Box>
          </Paper>
        </Container>
      </Box>

      {/* ENTERPRISE SLA & INFRASTRUCTURE FEATURES */}
      <Box
        id="features"
        component="section"
        sx={{
          py: { xs: 8, md: 12 },
          bgcolor: '#0B101A',
          borderBottom: '2px solid #000',
        }}
      >
        <Container maxWidth="lg">
          <Stack spacing={2} alignItems="center" textAlign="center" sx={{ mb: 6 }}>
            <Chip
              label="[ ARSITEKTUR KELAS CARRIER ]"
              size="small"
              sx={{
                bgcolor: 'rgba(255,255,255,0.06)',
                color: accentColor,
                border: '1px solid ' + accentColor,
                fontFamily: '"JetBrains Mono", monospace',
                fontWeight: 700,
                borderRadius: 0,
              }}
            />
            <Typography
              variant="h3"
              sx={{
                fontWeight: 900,
                fontSize: { xs: '2rem', md: '2.8rem' },
                color: '#FFF',
              }}
            >
              Keunggulan Jaringan Backbone Kami
            </Typography>
            <Typography variant="body1" sx={{ color: '#94A3B8', maxWidth: 650 }}>
              Didesain khusus untuk beban kerja mission-critical, perbankan, instansi, perkantoran, dan internet residensial bebas hambatan.
            </Typography>
          </Stack>

          <Grid container spacing={3.5}>
            {[
              {
                icon: <RouterIcon sx={{ fontSize: '2rem', color: accentColor }} />,
                title: 'Multi-Homed BGP Routing',
                desc: 'Terhubung ke beberapa Tier-1 Global Transit dan Peering Lokal (OpenIXP, IIX, CDIX) untuk pemilihan jalur terpendek dan auto-failover tanpa jeda.',
              },
              {
                icon: <DnsIcon sx={{ fontSize: '2rem', color: accentColor }} />,
                title: 'Dual-Stack IPv4 & IPv6',
                desc: 'Dukungan penuh IPv6 Prefix Delegation (/48 & /56) dan alokasi IP Public Statis berkelas enterprise untuk kebutuhan server atau CCTV remote.',
              },
              {
                icon: <ShieldIcon sx={{ fontSize: '2rem', color: accentColor }} />,
                title: 'Proteksi DDoS & Keamanan AAA',
                desc: 'RADIUS engine berkecepatan tinggi terintegrasi dengan pemfilteran paket mencurigakan di layer edge, menjaga kelancaran koneksi Anda 24/7.',
              },
              {
                icon: <SupportAgentIcon sx={{ fontSize: '2rem', color: accentColor }} />,
                title: '24/7 NOC Active Monitoring',
                desc: 'Sistem deteksi anomali real-time langsung mengeksekusi dispatch tiket WhatsApp ke tim teknisi lapangan sebelum pelanggan merasakan gangguan.',
              },
            ].map((f, i) => (
              <Grid item xs={12} sm={6} md={3} key={i}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 3,
                    height: '100%',
                    bgcolor: '#0E1422',
                    border: '2px solid #000',
                    boxShadow: '4px 4px 0px #000',
                  }}
                >
                  <Box sx={{ mb: 2 }}>{f.icon}</Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: '#FFF', mb: 1 }}>
                    {f.title}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#94A3B8', lineHeight: 1.6 }}>
                    {f.desc}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* COVERAGE & SALES INQUIRY (CTA) */}
      <Box
        id="coverage"
        component="section"
        sx={{
          py: { xs: 8, md: 10 },
          bgcolor: '#080C14',
          position: 'relative',
        }}
      >
        <Container maxWidth="md">
          <Paper
            elevation={0}
            sx={{
              p: { xs: 4, md: 6 },
              bgcolor: '#0D131F',
              border: '3px solid #000',
              boxShadow: `10px 10px 0px ${accentColor}`,
              textAlign: 'center',
            }}
          >
            <Typography
              variant="h3"
              sx={{
                fontWeight: 900,
                fontSize: { xs: '1.8rem', md: '2.6rem' },
                color: '#FFF',
                mb: 2,
              }}
            >
              Butuh Sambungan Khusus atau Pemasangan di Area Anda?
            </Typography>
            <Typography variant="body1" sx={{ color: '#94A3B8', mb: 4, maxWidth: 600, mx: 'auto' }}>
              Konsultasikan kebutuhan Dedicated Internet, Metro-Ethernet, Interkoneksi Antar Cabang, atau pasang baru broadband fiber optic dengan tim kami.
            </Typography>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
              <Button
                variant="contained"
                onClick={handleCoverageWhatsApp}
                startIcon={<WhatsAppIcon />}
                size="large"
                sx={{
                  bgcolor: accentColor,
                  color: '#000',
                  fontWeight: 900,
                  fontSize: '1rem',
                  py: 1.5,
                  px: 4,
                  borderRadius: 0,
                  border: '2px solid #000',
                  boxShadow: '4px 4px 0px #000',
                  '&:hover': {
                    bgcolor: '#FFF',
                    color: '#000',
                  },
                }}
              >
                Hubungi Kami via WhatsApp
              </Button>

              <Button
                variant="outlined"
                onClick={() => navigate('/portal')}
                size="large"
                sx={{
                  color: '#FFF',
                  borderColor: 'rgba(255,255,255,0.4)',
                  borderWidth: '2px',
                  fontWeight: 700,
                  fontSize: '1rem',
                  py: 1.5,
                  px: 4,
                  borderRadius: 0,
                  boxShadow: '4px 4px 0px #000',
                  '&:hover': {
                    borderColor: '#FFF',
                    bgcolor: 'rgba(255,255,255,0.08)',
                  },
                }}
              >
                Portal Pelanggan
              </Button>
            </Stack>
          </Paper>
        </Container>
      </Box>

      {/* FOOTER */}
      <Box
        component="footer"
        sx={{
          bgcolor: '#04070C',
          borderTop: '2px solid #000',
          py: 6,
          px: 2,
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={4} justifyContent="space-between">
            <Grid item xs={12} md={5}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                {branding.logo_url ? (
                  <Box
                    component="img"
                    src={branding.logo_url}
                    alt={productName}
                    sx={{ height: 36, objectFit: 'contain' }}
                  />
                ) : (
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      bgcolor: accentColor,
                      color: '#000',
                      fontWeight: 900,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1.5px solid #000',
                      fontFamily: '"JetBrains Mono", monospace',
                    }}
                  >
                    {branding.short_name || 'ISP'}
                  </Box>
                )}
                <Typography variant="h6" sx={{ fontWeight: 900, color: '#FFF' }}>
                  {productName}
                </Typography>
              </Stack>
              <Typography variant="body2" sx={{ color: '#94A3B8', maxWidth: 440, mb: 1.5 }}>
                {contactAddress}
              </Typography>
              <Typography variant="body2" sx={{ color: '#CBD5E1', fontSize: '0.85rem', mb: 0.5 }}>
                Hotline: <Box component="span" sx={{ color: accentColor, fontWeight: 700 }}>{contactPhone}</Box> • WhatsApp: <Box component="span" sx={{ color: accentColor, fontWeight: 700 }}>+{contactWhatsApp}</Box>
              </Typography>
              <Typography variant="body2" sx={{ color: '#CBD5E1', fontSize: '0.85rem', mb: 1.5 }}>
                Email NOC: <Box component="span" sx={{ color: '#93C5FD' }}>{contactEmail}</Box>
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mb: 1 }}>
                Area Jaringan: {coverageAreas}
              </Typography>
              <Typography variant="caption" sx={{ color: '#475569', fontFamily: '"JetBrains Mono", monospace' }}>
                POWERED BY MWX-ISP ENTERPRISE PLATFORM
              </Typography>
            </Grid>

            <Grid item xs={6} sm={3} md={2}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#FFF', mb: 2, fontFamily: '"JetBrains Mono", monospace' }}>
                LAYANAN
              </Typography>
              <Stack spacing={1}>
                <Typography component="a" href="#packages" sx={{ color: '#94A3B8', textDecoration: 'none', fontSize: '0.85rem', '&:hover': { color: accentColor } }}>
                  Home Broadband
                </Typography>
                <Typography component="a" href="#packages" sx={{ color: '#94A3B8', textDecoration: 'none', fontSize: '0.85rem', '&:hover': { color: accentColor } }}>
                  Dedicated Internet
                </Typography>
                <Typography component="a" href="#packages" sx={{ color: '#94A3B8', textDecoration: 'none', fontSize: '0.85rem', '&:hover': { color: accentColor } }}>
                  Hotspot Prepaid
                </Typography>
                <Typography component="a" href="#features" sx={{ color: '#94A3B8', textDecoration: 'none', fontSize: '0.85rem', '&:hover': { color: accentColor } }}>
                  Jaminan SLA 99.98%
                </Typography>
              </Stack>
            </Grid>

            <Grid item xs={6} sm={3} md={2}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#FFF', mb: 2, fontFamily: '"JetBrains Mono", monospace' }}>
                BANTUAN
              </Typography>
              <Stack spacing={1}>
                <Typography component="a" href="#self-service" sx={{ color: '#94A3B8', textDecoration: 'none', fontSize: '0.85rem', '&:hover': { color: accentColor } }}>
                  Cek Tagihan
                </Typography>
                <Typography component="a" href="#self-service" sx={{ color: '#94A3B8', textDecoration: 'none', fontSize: '0.85rem', '&:hover': { color: accentColor } }}>
                  Cek Status Voucher
                </Typography>
                <Typography
                  component="button"
                  onClick={() => navigate('/portal')}
                  sx={{
                    background: 'none',
                    border: 'none',
                    p: 0,
                    cursor: 'pointer',
                    color: '#94A3B8',
                    textAlign: 'left',
                    fontSize: '0.85rem',
                    '&:hover': { color: accentColor },
                  }}
                >
                  Portal Pelanggan
                </Typography>
                <Typography
                  component="button"
                  onClick={() => navigate('/login')}
                  sx={{
                    background: 'none',
                    border: 'none',
                    p: 0,
                    cursor: 'pointer',
                    color: '#94A3B8',
                    textAlign: 'left',
                    fontSize: '0.85rem',
                    '&:hover': { color: accentColor },
                  }}
                >
                  Operator Console
                </Typography>
              </Stack>
            </Grid>
          </Grid>

          <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.06)' }} />

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems="center"
            spacing={2}
          >
            <Typography variant="caption" sx={{ color: '#64748B' }}>
              © {new Date().getFullYear()} {productName}. Seluruh Hak Cipta Dilindungi Undang-Undang.
            </Typography>
            <Stack direction="row" spacing={3}>
              <Typography variant="caption" sx={{ color: '#64748B' }}>
                SLA: 99.98%
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748B' }}>
                NOC: 24/7/365
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748B' }}>
                Carrier-Grade
              </Typography>
            </Stack>
          </Stack>
        </Container>
      </Box>

      {/* ONLINE REGISTRATION MODAL (PASANG BARU) */}
      <Dialog
        open={registerOpen}
        onClose={regLoading ? undefined : () => setRegisterOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: '#0E131F',
            color: '#FFF',
            border: '2px solid #000',
            boxShadow: '8px 8px 0px #000',
            borderRadius: 0,
          },
        }}
      >
        <DialogTitle
          sx={{
            p: 2.5,
            borderBottom: '2px solid #000',
            bgcolor: '#141A28',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Box>
            <Typography
              variant="caption"
              sx={{
                fontFamily: '"JetBrains Mono", monospace',
                color: accentColor,
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                display: 'block',
              }}
            >
              [ REGISTRASI PELANGGAN BARU ]
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, color: '#FFF', letterSpacing: '-0.02em' }}>
              Form Pendaftaran Pasang Baru
            </Typography>
          </Box>
          <IconButton
            onClick={() => setRegisterOpen(false)}
            disabled={regLoading}
            size="small"
            sx={{
              color: '#94A3B8',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 0,
              '&:hover': { color: '#FFF', bgcolor: 'rgba(255,255,255,0.1)' },
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        {regSuccess ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                bgcolor: 'rgba(22, 163, 74, 0.15)',
                border: `2px solid ${accentColor}`,
                color: accentColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 2,
              }}
            >
              <CheckCircleIcon sx={{ fontSize: 36 }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 900, color: '#FFF', mb: 1 }}>
              Pendaftaran Berhasil Diterima!
            </Typography>
            <Typography variant="body2" sx={{ color: '#94A3B8', mb: 3 }}>
              Data pendaftaran Anda telah tercatat ke dalam sistem. Tim NOC & teknisi kami akan segera memverifikasi ketersediaan jalur fiber optik ke lokasi Anda.
            </Typography>

            <Paper
              sx={{
                bgcolor: '#080C14',
                border: '1px solid rgba(255,255,255,0.15)',
                p: 2.5,
                mb: 3,
                textAlign: 'left',
                borderRadius: 0,
              }}
            >
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#64748B', fontFamily: '"JetBrains Mono", monospace' }}>
                    ID REGISTRASI / CUSTOMER NO:
                  </Typography>
                  <Typography variant="h6" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 800, color: accentColor }}>
                    {regSuccess.customer_no}
                  </Typography>
                </Box>
                <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                <Grid container spacing={1}>
                  <Grid item xs={6}>
                    <Typography variant="caption" sx={{ color: '#64748B' }}>Nama Pelanggan:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#FFF' }}>{regSuccess.name}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" sx={{ color: '#64748B' }}>Nomor Kontak:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#FFF' }}>{regSuccess.phone}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" sx={{ color: '#64748B' }}>Paket Pilihan:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#FFF' }}>{regSuccess.package_name || '-'}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" sx={{ color: '#64748B' }}>No. Tiket Instalasi:</Typography>
                    <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: '#38BDF8' }}>
                      {regSuccess.ticket_no || '-'}
                    </Typography>
                  </Grid>
                </Grid>
              </Stack>
            </Paper>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
              <Button
                variant="contained"
                startIcon={<WhatsAppIcon />}
                onClick={() => {
                  const msg = encodeURIComponent(
                    `Halo CS ${productName}, saya sudah mendaftar pasang baru via website:\n- No. Registrasi: ${regSuccess.customer_no}\n- Nama: ${regSuccess.name}\n- Paket: ${regSuccess.package_name || ''}\n- No. Tiket: ${regSuccess.ticket_no || ''}\nMohon bantuannya untuk jadwal survey lokasi. Terima kasih!`
                  );
                  window.open(`https://wa.me/${contactWhatsApp}?text=${msg}`, '_blank');
                }}
                sx={{
                  bgcolor: accentColor,
                  color: '#000',
                  fontWeight: 800,
                  borderRadius: 0,
                  border: '2px solid #000',
                  boxShadow: '3px 3px 0px #000',
                  '&:hover': { bgcolor: '#FFF', color: '#000' },
                }}
              >
                Konfirmasi via WhatsApp
              </Button>
              <Button
                variant="outlined"
                onClick={() => setRegisterOpen(false)}
                sx={{
                  color: '#FFF',
                  borderColor: 'rgba(255,255,255,0.3)',
                  borderRadius: 0,
                  borderWidth: '2px',
                  '&:hover': { borderColor: '#FFF', bgcolor: 'rgba(255,255,255,0.08)' },
                }}
              >
                Tutup
              </Button>
            </Stack>
          </Box>
        ) : (
          <form onSubmit={handleRegisterSubmit}>
            <DialogContent sx={{ p: 3 }}>
              {regError && (
                <Alert severity="error" sx={{ mb: 2.5, borderRadius: 0, border: '1px solid #EF4444' }}>
                  {regError}
                </Alert>
              )}

              <Stack spacing={2.5}>
                {/* PACKAGE SELECTOR */}
                <FormControl fullWidth size="small">
                  <InputLabel id="reg-package-label" sx={{ color: '#94A3B8' }}>Pilihan Paket Internet</InputLabel>
                  <Select
                    labelId="reg-package-label"
                    label="Pilihan Paket Internet"
                    value={regForm.package_id}
                    onChange={(e) => setRegForm({ ...regForm, package_id: e.target.value })}
                    sx={{
                      bgcolor: '#080C14',
                      color: '#FFF',
                      borderRadius: 0,
                      border: '1px solid rgba(255,255,255,0.2)',
                      '& .MuiSvgIcon-root': { color: '#FFF' },
                    }}
                  >
                    {packages.map((pkg) => (
                      <MenuItem key={pkg.id} value={pkg.id}>
                        {pkg.name} — {pkg.speed_display} ({idrFormat(pkg.price)} / bln)
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Nama Lengkap Pemohon *"
                      placeholder="e.g. Budi Santoso"
                      value={regForm.name}
                      onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                      required
                      sx={{
                        bgcolor: '#080C14',
                        '& .MuiOutlinedInput-root': { borderRadius: 0, color: '#FFF' },
                        '& .MuiInputLabel-root': { color: '#94A3B8' },
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label="No. WhatsApp / HP *"
                      placeholder="e.g. 081234567890"
                      value={regForm.phone}
                      onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                      required
                      sx={{
                        bgcolor: '#080C14',
                        '& .MuiOutlinedInput-root': { borderRadius: 0, color: '#FFF' },
                        '& .MuiInputLabel-root': { color: '#94A3B8' },
                      }}
                    />
                  </Grid>
                </Grid>

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Email (Opsional)"
                      type="email"
                      placeholder="e.g. budi@gmail.com"
                      value={regForm.email}
                      onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                      sx={{
                        bgcolor: '#080C14',
                        '& .MuiOutlinedInput-root': { borderRadius: 0, color: '#FFF' },
                        '& .MuiInputLabel-root': { color: '#94A3B8' },
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Nomor KTP / NIK (Opsional)"
                      placeholder="16 digit NIK"
                      value={regForm.id_card_number}
                      onChange={(e) => setRegForm({ ...regForm, id_card_number: e.target.value })}
                      sx={{
                        bgcolor: '#080C14',
                        '& .MuiOutlinedInput-root': { borderRadius: 0, color: '#FFF' },
                        '& .MuiInputLabel-root': { color: '#94A3B8' },
                      }}
                    />
                  </Grid>
                </Grid>

                <TextField
                  fullWidth
                  size="small"
                  label="Alamat Lengkap Lokasi Pemasangan *"
                  placeholder="Jl. Merdeka No. 10, RT 01/RW 02, Kelurahan, Kecamatan, Kota"
                  multiline
                  rows={2}
                  value={regForm.address}
                  onChange={(e) => setRegForm({ ...regForm, address: e.target.value })}
                  required
                  sx={{
                    bgcolor: '#080C14',
                    '& .MuiOutlinedInput-root': { borderRadius: 0, color: '#FFF' },
                    '& .MuiInputLabel-root': { color: '#94A3B8' },
                  }}
                />

                <TextField
                  fullWidth
                  size="small"
                  label="Catatan Tambahan / Patokan Rumah (Opsional)"
                  placeholder="Depan Masjid Al-Ikhlas / pagar hitam / dsb"
                  value={regForm.notes}
                  onChange={(e) => setRegForm({ ...regForm, notes: e.target.value })}
                  sx={{
                    bgcolor: '#080C14',
                    '& .MuiOutlinedInput-root': { borderRadius: 0, color: '#FFF' },
                    '& .MuiInputLabel-root': { color: '#94A3B8' },
                  }}
                />

                <Typography variant="caption" sx={{ color: '#64748B', display: 'block' }}>
                  * Teknisi akan menghubungi Anda melalui WhatsApp untuk mengonfirmasi jadwal survei fisik dan uji redaman ODP terdekat.
                </Typography>
              </Stack>
            </DialogContent>

            <DialogActions
              sx={{
                p: 2.5,
                borderTop: '1px solid rgba(255,255,255,0.1)',
                bgcolor: '#141A28',
              }}
            >
              <Button
                onClick={() => setRegisterOpen(false)}
                disabled={regLoading}
                sx={{ color: '#94A3B8', textTransform: 'none', fontWeight: 600 }}
              >
                Batal
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={regLoading}
                startIcon={regLoading ? <CircularProgress size={16} color="inherit" /> : <RegisterIcon />}
                sx={{
                  bgcolor: accentColor,
                  color: '#000',
                  fontWeight: 900,
                  borderRadius: 0,
                  border: '2px solid #000',
                  boxShadow: '3px 3px 0px #000',
                  px: 3,
                  textTransform: 'none',
                  '&:hover': { bgcolor: '#FFF', color: '#000' },
                }}
              >
                {regLoading ? 'Memproses...' : 'Kirim Pendaftaran'}
              </Button>
            </DialogActions>
          </form>
        )}
      </Dialog>
    </Box>
  );
};

export default LandingPage;
