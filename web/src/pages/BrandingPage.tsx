import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, LinearProgress, Stack, TextField, Typography,
} from '@mui/material';
import Grid from '@mui/material/GridLegacy';
import { ThemeProvider, useTheme } from '@mui/material/styles';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import RestartAltOutlinedIcon from '@mui/icons-material/RestartAltOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import { useGetIdentity, useNotify } from 'react-admin';
import { apiRequest } from '../utils/apiClient';
import { createAppTheme } from '../theme';
import { BrandMark } from '../components/BrandMark';
import { defaultProductBranding, useBranding } from '../branding/BrandingContext';
import type { ProductBranding } from '../branding/BrandingContext';
import { PageHeader, Panel } from '../components/Enterprise';

const BrandingPreview = ({ branding, logoUrl }: { branding: ProductBranding; logoUrl?: string }) => {
  const { palette } = useTheme();
  return (
    <Panel
      title="BRAND PREVIEW"
      actions={<Chip size="small" label="ADMIN" sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 850, border: '1px solid', borderColor: 'text.primary', height: 20 }} />}
    >
      <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <BrandMark branding={branding} logoUrl={logoUrl} size={38} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography fontWeight={900} noWrap>{branding.product_name}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>{branding.tagline || 'Product tagline'}</Typography>
        </Box>
      </Box>
      <Box sx={{ p: 2 }}>
        <Typography variant="h5" fontWeight={900} sx={{ mt: 0.5 }}>{branding.product_name}</Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>{branding.tagline || 'Your product tagline will appear here.'}</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button variant="contained" size="small">Primary action</Button>
          <Typography variant="caption" color="text.secondary">{branding.short_name} · {branding.accent_color.toUpperCase()}</Typography>
        </Stack>
      </Box>
      <Box sx={{ height: 4, bgcolor: palette.primary.main }} />
    </Panel>
  );
};

const BrandingPage = () => {
  const { data: identity } = useGetIdentity();
  const { branding: currentBranding, updateBranding } = useBranding();
  const notify = useNotify();
  const [saved, setSaved] = useState<ProductBranding>(currentBranding);
  const [draft, setDraft] = useState<ProductBranding>(currentBranding);
  const [file, setFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const isAdmin = identity?.level === 'super' || identity?.level === 'admin';

  useEffect(() => {
    let active = true;
    apiRequest<ProductBranding>('/system/branding')
      .then((value) => {
        if (!active) return;
        const next = { ...defaultProductBranding, ...value };
        setSaved(next);
        setDraft(next);
      })
      .catch(() => notify('Product branding could not be loaded.', { type: 'error' }))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [notify]);

  useEffect(() => {
    if (!file) {
      setLogoPreview('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const previewLogo = removeLogo ? '' : logoPreview || draft.logo_url;
  const previewBranding = useMemo(() => ({ ...draft, logo_url: previewLogo || undefined }), [draft, previewLogo]);
  const previewTheme = useMemo(() => createAppTheme('dark', draft.accent_color), [draft.accent_color]);

  const updateField = (key: keyof ProductBranding, value: string) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  const chooseLogo = (selected: File | undefined) => {
    if (!selected) return;
    if (selected.type !== 'image/png' || selected.size > 1024 * 1024) {
      notify('Choose a PNG image no larger than 1 MiB.', { type: 'warning' });
      return;
    }
    setRemoveLogo(false);
    setFile(selected);
  };

  const save = async () => {
    setSaving(true);
    const body = new FormData();
    body.append('product_name', draft.product_name);
    body.append('short_name', draft.short_name);
    body.append('tagline', draft.tagline);
    body.append('accent_color', draft.accent_color);
    body.append('remove_logo', String(removeLogo));
    if (file) body.append('logo', file, file.name);
    try {
      const result = await apiRequest<ProductBranding>('/system/branding', { method: 'PUT', body });
      const next = { ...defaultProductBranding, ...result };
      setSaved(next);
      setDraft(next);
      setFile(null);
      setRemoveLogo(false);
      updateBranding(next);
      notify('Product branding saved.', { type: 'success' });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Product branding could not be saved.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setDraft(saved);
    setFile(null);
    setRemoveLogo(false);
  };

  const reset = async () => {
    setSaving(true);
    try {
      const result = await apiRequest<ProductBranding>('/system/branding/reset', { method: 'POST' });
      const next = { ...defaultProductBranding, ...result };
      setSaved(next);
      setDraft(next);
      setFile(null);
      setRemoveLogo(false);
      updateBranding(next);
      setResetOpen(false);
      notify('MWX-ISP defaults restored.', { type: 'success' });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Branding could not be reset.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) return <Box sx={{ p: 3 }}><Alert severity="error">Only Admin and Super Admin can edit product branding.</Alert></Box>;
  if (loading) return <Box sx={{ p: 3 }}><LinearProgress /></Box>;

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 }, maxWidth: 1280, mx: 'auto' }}>
      <PageHeader
        title="Product Branding"
        subtitle="Set the visual identity and white-label mark shared across this MWX-ISP instance."
        actions={
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button size="small" variant="outlined" startIcon={<VisibilityOutlinedIcon />} onClick={() => setPreviewOpen((value) => !value)}>
              {previewOpen ? 'Hide preview' : 'Preview'}
            </Button>
            <Button size="small" variant="outlined" startIcon={<RestartAltOutlinedIcon />} color="inherit" onClick={() => setResetOpen(true)}>
              Reset defaults
            </Button>
          </Stack>
        }
      />

      <Alert severity="info" sx={{ mb: 2 }}>Branding applies to the whole installation. Company name and invoice details stay in System Configuration and remain separate.</Alert>
      <Grid container spacing={2}>
        <Grid item xs={12} md={previewOpen ? 7 : 12}>
          <Panel
            title="PRODUCT IDENTITY"
            actions={<Typography variant="caption" color="text.secondary">THEME ACCENT & LOGO</Typography>}
          >
            <Box sx={{ p: 2 }}>
              <Grid container spacing={1.5}>
                <Grid item xs={12} sm={7}><TextField fullWidth size="small" label="Product name" value={draft.product_name} onChange={(event) => updateField('product_name', event.target.value)} inputProps={{ maxLength: 60 }} helperText="Shown in the app bar, login, and browser title." /></Grid>
                <Grid item xs={12} sm={5}><TextField fullWidth size="small" label="Short name / mark" value={draft.short_name} onChange={(event) => updateField('short_name', event.target.value)} inputProps={{ maxLength: 8 }} helperText="Text mark shown when there is no logo." /></Grid>
                <Grid item xs={12}><TextField fullWidth size="small" label="Tagline" value={draft.tagline} onChange={(event) => updateField('tagline', event.target.value)} inputProps={{ maxLength: 120 }} /></Grid>
                <Grid item xs={12} sm={5}><TextField fullWidth size="small" type="color" label="Primary accent" value={draft.accent_color} onChange={(event) => updateField('accent_color', event.target.value.toUpperCase())} InputLabelProps={{ shrink: true }} /></Grid>
                <Grid item xs={12} sm={7}><TextField fullWidth size="small" label="Accent hex" value={draft.accent_color} onChange={(event) => updateField('accent_color', event.target.value)} inputProps={{ maxLength: 7, 'aria-label': 'Accent hex color' }} helperText="The UI adjusts contrast for dark and light themes." /></Grid>
                <Grid item xs={12}>
                  <Divider sx={{ my: 0.5 }} />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ mt: 1.5 }}>
                    <Button component="label" size="small" variant="outlined" startIcon={<ImageOutlinedIcon />}>Choose PNG logo<input hidden type="file" accept="image/png" onChange={(event) => chooseLogo(event.target.files?.[0])} /></Button>
                    <Typography variant="body2" color="text.secondary">PNG · up to 1 MiB · maximum 2048 × 2048 px</Typography>
                    {(draft.logo_url || file) && !removeLogo ? <Button size="small" color="warning" onClick={() => { setFile(null); setRemoveLogo(true); }}>Remove logo</Button> : null}
                    {removeLogo ? <Button size="small" onClick={() => setRemoveLogo(false)}>Undo removal</Button> : null}
                    {file ? <Chip size="small" label={file.name} /> : null}
                  </Stack>
                </Grid>
              </Grid>
              <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: 2 }}>
                <Button size="small" onClick={cancel} disabled={saving}>Cancel</Button>
                <Button size="small" variant="contained" startIcon={<SaveOutlinedIcon />} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save branding'}</Button>
              </Stack>
            </Box>
          </Panel>
        </Grid>
        {previewOpen ? <Grid item xs={12} md={5}>
          <ThemeProvider theme={previewTheme}>
            <Box sx={{ position: { md: 'sticky' }, top: 72 }}>
              <Typography variant="overline" color="text.secondary" sx={{ fontFamily: 'monospace', letterSpacing: '0.14em', mb: 1, display: 'block' }}>LIVE PREVIEW · DARK DEFAULT</Typography>
              <BrandingPreview branding={previewBranding} logoUrl={previewLogo} />
            </Box>
          </ThemeProvider>
        </Grid> : null}
      </Grid>

      <Dialog open={resetOpen} onClose={() => setResetOpen(false)}>
        <DialogTitle>Restore MWX-ISP defaults?</DialogTitle>
        <DialogContent><Typography color="text.secondary">This replaces the installation name, mark, tagline, accent, and logo with the built-in MWX-ISP defaults for every operator.</Typography></DialogContent>
        <DialogActions><Button onClick={() => setResetOpen(false)} disabled={saving}>Cancel</Button><Button color="warning" onClick={reset} disabled={saving}>Restore defaults</Button></DialogActions>
      </Dialog>
    </Box>
  );
};

export default BrandingPage;
