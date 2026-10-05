import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, Divider, LinearProgress,
  Paper, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import Grid from '@mui/material/GridLegacy';
import {
  SaveOutlined as SaveIcon,
  RestartAltOutlined as ResetIcon,
  OpenInNewOutlined as OpenInNewIcon,
  WhatsApp as WhatsAppIcon,
  SpeedOutlined as SpeedIcon,
  CampaignOutlined as CampaignIcon,
  BrushOutlined as BrushIcon,
} from '@mui/icons-material';
import { useNotify } from 'react-admin';
import { apiRequest } from '../utils/apiClient';
import { defaultProductBranding, useBranding } from '../branding/BrandingContext';
import type { ProductBranding } from '../branding/BrandingContext';
import { PageHeader, Panel } from '../components/Enterprise';

export const WebsiteEditorPage = () => {
  const notify = useNotify();
  const { branding, updateBranding } = useBranding();
  const navigate = useNavigate();

  const [draft, setDraft] = useState<ProductBranding>(branding);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    setDraft(branding);
  }, [branding]);

  const updateField = (key: keyof ProductBranding, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    const body = new FormData();
    body.append('product_name', draft.product_name);
    body.append('short_name', draft.short_name);
    body.append('tagline', draft.tagline);
    body.append('accent_color', draft.accent_color);
    body.append('hero_headline', draft.hero_headline || '');
    body.append('hero_subtitle', draft.hero_subtitle || '');
    body.append('ticker_text', draft.ticker_text || '');
    body.append('contact_phone', draft.contact_phone || '');
    body.append('contact_whatsapp', draft.contact_whatsapp || '');
    body.append('contact_email', draft.contact_email || '');
    body.append('contact_address', draft.contact_address || '');
    body.append('coverage_areas', draft.coverage_areas || '');
    body.append('sla_uptime', draft.sla_uptime || '99.98%');
    body.append('sla_latency', draft.sla_latency || '< 5 ms');

    try {
      const result = await apiRequest<ProductBranding>('/system/branding', {
        method: 'PUT',
        body,
      });
      const next = { ...defaultProductBranding, ...result };
      setDraft(next);
      updateBranding(next);
      notify('Pengaturan Website & Landing Page berhasil disimpan!', { type: 'success' });
    } catch (err: any) {
      notify(err?.message || 'Gagal menyimpan konfigurasi website', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(defaultProductBranding);
    notify('Form dikembalikan ke konten bawaan (klik Simpan untuk menerapkan).', { type: 'info' });
  };

  const openLandingPage = () => {
    window.open('/admin#/home', '_blank');
  };

  const accent = draft.accent_color || '#16A34A';

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <PageHeader
        section="PUBLIC PORTAL CONTROLLER"
        title="WEBSITE & LANDING EDITOR"
        subtitle="Kelola konten, teks headline, nomor WhatsApp sales, SLA, dan informasi publik pada halaman utama (Landing Page / Home) ISP."
        actions={
          <Stack direction="row" spacing={1.5}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => navigate('/system/branding')}
              startIcon={<BrushIcon />}
              sx={{
                borderColor: 'rgba(255,255,255,0.25)',
                color: '#FFF',
                fontWeight: 700,
                borderRadius: 0,
                textTransform: 'none',
                '&:hover': {
                  borderColor: accent,
                  color: accent,
                },
              }}
            >
              Logo & Branding
            </Button>

            <Button
              variant="outlined"
              size="small"
              onClick={openLandingPage}
              startIcon={<OpenInNewIcon />}
              sx={{
                borderColor: 'rgba(255,255,255,0.25)',
                color: '#FFF',
                fontWeight: 700,
                borderRadius: 0,
                textTransform: 'none',
                '&:hover': {
                  borderColor: accent,
                  color: accent,
                },
              }}
            >
              Buka Landing Page Asli
            </Button>

            <Button
              variant="contained"
              size="small"
              onClick={handleSave}
              disabled={saving}
              startIcon={<SaveIcon />}
              sx={{
                bgcolor: accent,
                color: '#000',
                fontWeight: 800,
                borderRadius: 0,
                border: '2px solid #000',
                boxShadow: '3px 3px 0px #000',
                textTransform: 'none',
                '&:hover': {
                  bgcolor: '#FFF',
                  color: '#000',
                },
              }}
            >
              {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
          </Stack>
        }
      />

      {saving && <LinearProgress sx={{ my: 1.5, bgcolor: '#0D131F', '& .MuiLinearProgress-bar': { bgcolor: accent } }} />}

      <Grid container spacing={3} sx={{ mt: 0.5 }}>
        {/* LEFT COLUMN: EDIT FORM */}
        <Grid item xs={12} lg={7}>
          <Panel title="KONTROL KONTEN WEBSITE">
            <Tabs
              value={activeTab}
              onChange={(_, v) => setActiveTab(v)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                borderBottom: '2px solid',
                borderColor: 'divider',
                mb: 3,
                '& .MuiTabs-indicator': { bgcolor: accent, height: 3 },
                '& .MuiTab-root': {
                  fontWeight: 750,
                  fontSize: '0.85rem',
                  textTransform: 'none',
                  minHeight: 48,
                  '&.Mui-selected': { color: accent },
                },
              }}
            >
              <Tab icon={<CampaignIcon />} iconPosition="start" label="Hero & Headline" />
              <Tab icon={<WhatsAppIcon />} iconPosition="start" label="Kontak & WhatsApp" />
              <Tab icon={<SpeedIcon />} iconPosition="start" label="SLA & Ticker" />
            </Tabs>

            {/* TAB 0: HERO & HEADLINE */}
            {activeTab === 0 && (
              <Stack spacing={2.5}>
                <Alert severity="info" sx={{ borderRadius: 0, border: '1px solid rgba(255,255,255,0.1)' }}>
                  Bagian Hero merupakan teks promosi utama yang langsung dilihat pengunjung ketika membuka website ISP Anda.
                </Alert>

                <TextField
                  fullWidth
                  label="Headline Utama (Hero Title)"
                  value={draft.hero_headline || ''}
                  onChange={(e) => updateField('hero_headline', e.target.value)}
                  placeholder="Contoh: Internet Simetris, Stabil & Bergaransi SLA 99.98%"
                  helperText="Teks besar pada bagian atas halaman depan."
                />

                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="Subtitle / Deskripsi Layanan"
                  value={draft.hero_subtitle || ''}
                  onChange={(e) => updateField('hero_subtitle', e.target.value)}
                  placeholder="Penjelasan keunggulan layanan, infrastruktur fiber, dll."
                  helperText="Paragraf penjelasan di bawah judul utama."
                />

                <TextField
                  fullWidth
                  label="Tagline Perusahaan"
                  value={draft.tagline || ''}
                  onChange={(e) => updateField('tagline', e.target.value)}
                  helperText="Slogan singkat di navbar dan hero badge."
                />
              </Stack>
            )}

            {/* TAB 1: KONTAK & WHATSAPP */}
            {activeTab === 1 && (
              <Stack spacing={2.5}>
                <Alert severity="info" sx={{ borderRadius: 0, border: '1px solid rgba(255,255,255,0.1)' }}>
                  Semua tombol <b>"Pilih Paket Ini"</b> dan <b>"Pasang Baru"</b> di landing page akan otomatis terhubung ke nomor WhatsApp ini dengan pesan otomatis yang rapi!
                </Alert>

                <TextField
                  fullWidth
                  label="Nomor WhatsApp CS / Sales (Gunakan kode negara)"
                  value={draft.contact_whatsapp || ''}
                  onChange={(e) => updateField('contact_whatsapp', e.target.value)}
                  placeholder="Contoh: 6281234567890"
                  helperText="Format: 6281xxx (tanpa spasi atau tanda +)."
                />

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Telepon Hotline Kantor / NOC"
                      value={draft.contact_phone || ''}
                      onChange={(e) => updateField('contact_phone', e.target.value)}
                      placeholder="+62 21 5550 1234"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Email Resmi / Support NOC"
                      value={draft.contact_email || ''}
                      onChange={(e) => updateField('contact_email', e.target.value)}
                      placeholder="noc@perusahaan.net"
                    />
                  </Grid>
                </Grid>

                <TextField
                  fullWidth
                  label="Alamat Kantor / Gedung Data Center"
                  value={draft.contact_address || ''}
                  onChange={(e) => updateField('contact_address', e.target.value)}
                  placeholder="Jl. Jenderal Sudirman No. 1..."
                  helperText="Ditampilkan pada footer website untuk kredibilitas perusahaan."
                />

                <TextField
                  fullWidth
                  label="Cakupan Area Jaringan (Coverage Areas)"
                  value={draft.coverage_areas || ''}
                  onChange={(e) => updateField('coverage_areas', e.target.value)}
                  placeholder="Jakarta, Tangerang, Bekasi, Depok, Bandung, Surabaya..."
                  helperText="Daftar kota atau wilayah yang terjangkau jaringan Anda."
                />
              </Stack>
            )}

            {/* TAB 2: SLA & TICKER */}
            {activeTab === 2 && (
              <Stack spacing={2.5}>
                <Alert severity="info" sx={{ borderRadius: 0, border: '1px solid rgba(255,255,255,0.1)' }}>
                  Pengumuman ticker berjalan pada bar atas website dapat digunakan untuk status pemeliharaan (maintenance) atau promo khusus.
                </Alert>

                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  label="Teks Ticker Status NOC & Pengumuman"
                  value={draft.ticker_text || ''}
                  onChange={(e) => updateField('ticker_text', e.target.value)}
                  placeholder="[ NOC LIVE STATUS ] Semua gateway BGP & GPON OLT beroperasi optimal..."
                  helperText="Ditampilkan di pita hitam paling atas landing page."
                />

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Jaminan Uptime SLA"
                      value={draft.sla_uptime || ''}
                      onChange={(e) => updateField('sla_uptime', e.target.value)}
                      placeholder="99.98%"
                      helperText="Target garansi ketersediaan layanan."
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Latensi Target (Local Peering)"
                      value={draft.sla_latency || ''}
                      onChange={(e) => updateField('sla_latency', e.target.value)}
                      placeholder="< 5 ms"
                      helperText="Latensi ke bursa pertukaran internet lokal (IIX / OpenIXP)."
                    />
                  </Grid>
                </Grid>
              </Stack>
            )}

            <Divider sx={{ my: 3 }} />

            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button
                variant="outlined"
                onClick={handleReset}
                startIcon={<ResetIcon />}
                sx={{ textTransform: 'none', borderRadius: 0 }}
              >
                Reset Default
              </Button>
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={saving}
                startIcon={<SaveIcon />}
                sx={{
                  bgcolor: accent,
                  color: '#000',
                  fontWeight: 800,
                  borderRadius: 0,
                  border: '2px solid #000',
                  boxShadow: '3px 3px 0px #000',
                  textTransform: 'none',
                  '&:hover': { bgcolor: '#FFF', color: '#000' },
                }}
              >
                {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </Button>
            </Stack>
          </Panel>
        </Grid>

        {/* RIGHT COLUMN: LIVE REAL-TIME PREVIEW */}
        <Grid item xs={12} lg={5}>
          <Panel
            title="LIVE PREVIEW LANDING PAGE"
            actions={
              <Chip
                label="REAL-TIME MOCK"
                size="small"
                sx={{
                  bgcolor: accent,
                  color: '#000',
                  fontWeight: 900,
                  fontSize: '0.65rem',
                  borderRadius: 0,
                }}
              />
            }
          >
            <Paper
              elevation={0}
              sx={{
                bgcolor: '#080C14',
                border: '2px solid #000',
                boxShadow: '4px 4px 0px #000',
                overflow: 'hidden',
                color: '#FFF',
                fontSize: '0.8rem',
              }}
            >
              {/* MOCK BROWSER BAR */}
              <Box
                sx={{
                  bgcolor: '#04070C',
                  p: 1,
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#EF4444' }} />
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#F59E0B' }} />
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#10B981' }} />
                <Typography variant="caption" sx={{ color: '#64748B', fontFamily: 'monospace', ml: 1 }}>
                  https://isp.domain.net/
                </Typography>
              </Box>

              {/* MOCK TOP TICKER */}
              <Box
                sx={{
                  bgcolor: '#000',
                  p: 0.8,
                  fontSize: '0.68rem',
                  fontFamily: 'monospace',
                  color: accent,
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {draft.ticker_text || '[ NOC LIVE STATUS ] Semua gateway normal'}
              </Box>

              {/* MOCK HEADER */}
              <Box
                sx={{
                  p: 1.5,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '2px solid #000',
                  bgcolor: '#0D131F',
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      bgcolor: accent,
                      color: '#000',
                      fontWeight: 900,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                    }}
                  >
                    {draft.short_name || 'ISP'}
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>
                    {draft.product_name}
                  </Typography>
                </Stack>
                <Chip
                  label="PORTAL"
                  size="small"
                  sx={{ height: 20, fontSize: '0.65rem', borderRadius: 0 }}
                />
              </Box>

              {/* MOCK HERO */}
              <Box sx={{ p: 2.5, textAlign: 'left', bgcolor: '#0B101A' }}>
                <Chip
                  label="[ ENTERPRISE BROADBAND ]"
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.6rem',
                    color: accent,
                    bgcolor: 'rgba(255,255,255,0.05)',
                    borderRadius: 0,
                    mb: 1,
                  }}
                />
                <Typography variant="h6" sx={{ fontWeight: 900, lineHeight: 1.2, mb: 1 }}>
                  {draft.hero_headline || 'Internet Simetris & Stabil'}
                </Typography>
                <Typography variant="caption" sx={{ color: '#94A3B8', display: 'block', mb: 2, lineHeight: 1.4 }}>
                  {draft.hero_subtitle || 'Solusi jaringan backbone terpercaya untuk perumahan dan bisnis.'}
                </Typography>

                <Stack direction="row" spacing={1}>
                  <Box
                    sx={{
                      p: 1,
                      bgcolor: '#080C14',
                      border: '1px solid rgba(255,255,255,0.1)',
                      flex: 1,
                      textAlign: 'center',
                    }}
                  >
                    <Typography variant="caption" sx={{ color: '#64748B', display: 'block', fontSize: '0.65rem' }}>
                      SLA UPTIME
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800, color: accent }}>
                      {draft.sla_uptime || '99.98%'}
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      p: 1,
                      bgcolor: '#080C14',
                      border: '1px solid rgba(255,255,255,0.1)',
                      flex: 1,
                      textAlign: 'center',
                    }}
                  >
                    <Typography variant="caption" sx={{ color: '#64748B', display: 'block', fontSize: '0.65rem' }}>
                      LATENCY
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800, color: accent }}>
                      {draft.sla_latency || '< 5 ms'}
                    </Typography>
                  </Box>
                </Stack>
              </Box>

              {/* MOCK CONTACT STRIP */}
              <Box
                sx={{
                  p: 2,
                  bgcolor: '#04070C',
                  borderTop: '2px solid #000',
                  fontSize: '0.72rem',
                }}
              >
                <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mb: 0.5 }}>
                  KONTAK & HOTLINE PUBLIK:
                </Typography>
                <Typography variant="caption" sx={{ color: '#CBD5E1', display: 'block' }}>
                  WA: <b>+{draft.contact_whatsapp || '6281234567890'}</b>
                </Typography>
                <Typography variant="caption" sx={{ color: '#CBD5E1', display: 'block' }}>
                  Tel: {draft.contact_phone || '+62 21 5550 1234'} | Email: {draft.contact_email || 'noc@mwx-isp.net'}
                </Typography>
                <Typography variant="caption" sx={{ color: '#94A3B8', display: 'block', mt: 0.5 }}>
                  {draft.contact_address || 'Cyber Building 1, Lt. 5, Jakarta'}
                </Typography>
              </Box>
            </Paper>

            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Button
                variant="outlined"
                fullWidth
                onClick={openLandingPage}
                endIcon={<OpenInNewIcon />}
                sx={{
                  color: '#CBD5E1',
                  borderColor: 'rgba(255,255,255,0.2)',
                  borderRadius: 0,
                  textTransform: 'none',
                  fontWeight: 700,
                  '&:hover': {
                    borderColor: accent,
                    color: accent,
                  },
                }}
              >
                Lihat Halaman Website Asli
              </Button>
            </Box>
          </Panel>
        </Grid>
      </Grid>
    </Box>
  );
};

export default WebsiteEditorPage;
