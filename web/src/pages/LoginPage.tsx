import { useEffect, useState } from 'react';
import { useLogin, useNotify, useTranslate } from 'react-admin';
import { useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Button,
  Typography,
  InputAdornment,
  IconButton,
  CircularProgress,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Visibility, VisibilityOff, Person, Lock } from '@mui/icons-material';
import { useBranding } from '../branding/BrandingContext';
import { BrandMark } from '../components/BrandMark';

export const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('default');
  const [tenants, setTenants] = useState<Array<{ name: string; slug: string; kind: string }>>([
    { name: 'Default ISP', slug: 'default', kind: 'isp' },
  ]);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const login = useLogin();
  const notify = useNotify();
  const translate = useTranslate();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const { branding } = useBranding();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/auth/tenants', { headers: { Accept: 'application/json' } })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to load organizations');
        const result = await response.json();
        const rows = Array.isArray(result?.data) ? result.data : [];
        const available: Array<{ name: string; slug: string; kind: string }> = rows.filter((row: unknown): row is { name: string; slug: string; kind: string } =>
          typeof row === 'object' && row !== null &&
          typeof (row as { name?: unknown }).name === 'string' &&
          typeof (row as { slug?: unknown }).slug === 'string' &&
          typeof (row as { kind?: unknown }).kind === 'string',
        );
        if (cancelled || available.length === 0) return;
        setTenants(available);
        setTenantSlug(current => available.some(tenant => tenant.slug === current)
          ? current
          : (available.find(tenant => tenant.slug === 'default') ?? available[0]).slug);
      })
      .catch(() => {
        if (!cancelled) notify(translate('auth.organizations_unavailable'), { type: 'warning' });
      });
    return () => { cancelled = true; };
  }, [notify, translate]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && token.length >= 10) {
      window.location.hash = '#/';
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !password) {
      notify(translate('validation.required'), { type: 'warning' });
      return;
    }

    setLoading(true);
    try {
      await login({ username, password, tenantSlug }, '/');
      // Ensure AppBar UserMenu picks up the newly stored identity.
      await queryClient.invalidateQueries({ queryKey: ['auth', 'getIdentity'] });
      await queryClient.invalidateQueries({ queryKey: ['auth', 'getPermissions'] });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : translate('auth.login_error');
      notify(errorMessage, { type: 'error' });
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        backgroundImage: 'radial-gradient(' + (theme.palette.mode === 'dark' ? 'rgba(230,255,0,0.09)' : 'rgba(13,13,13,0.07)') + ' 0.8px, transparent 1px)',
        backgroundSize: '8px 8px',
      }}
    >
      <Card sx={{ width: 'min(100% - 32px, 460px)', color: 'text.primary' }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ mb: 4, textAlign: 'center' }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
              <Box sx={{ '& > div': { width: 54, height: 54, fontSize: 21, boxShadow: '3px 3px 0 ' + theme.palette.text.primary } }}><BrandMark size={54} /></Box>
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 900, fontFamily: '"Arial Narrow", "Franklin Gothic Medium", Impact, sans-serif', textTransform: 'uppercase', color: 'text.primary', mb: 1, letterSpacing: '0.06em' }}>
              {branding.product_name}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {branding.tagline}
            </Typography>
          </Box>

          <form onSubmit={handleSubmit}>
            <Box sx={{ mb: 3 }}>
              <FormControl fullWidth>
                <InputLabel id="tenant-label">{translate('auth.organization')}</InputLabel>
                <Select
                  labelId="tenant-label"
                  label={translate('auth.organization')}
                  value={tenantSlug}
                  onChange={event => setTenantSlug(event.target.value)}
                  disabled={loading || tenants.length < 2}
                >
                  {tenants.map(tenant => (
                    <MenuItem key={tenant.slug} value={tenant.slug}>{tenant.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ mb: 3 }}>
              <TextField
                fullWidth
                label={translate('auth.username')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                autoFocus
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Person color="action" />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            <Box sx={{ mb: 3 }}>
              <TextField
                fullWidth
                label={translate('auth.password')}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Lock color="action" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        disabled={loading}
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{
                mt: 2,
                py: 1.5,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
              }}
            >
              {loading ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                translate('auth.sign_in')
              )}
            </Button>
          </form>

          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Button
              size="small"
              variant="text"
              onClick={() => { window.location.hash = '#/home'; }}
              sx={{ textTransform: 'none', color: 'text.secondary' }}
            >
              ← Kembali ke Beranda
            </Button>
          </Box>

          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {branding.product_name} © {new Date().getFullYear()}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};
