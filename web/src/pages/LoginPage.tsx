import { useState } from 'react';
import { useLogin, useNotify, useTranslate } from 'react-admin';
import { useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Card,
  CardContent,
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
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const login = useLogin();
  const notify = useNotify();
  const translate = useTranslate();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const { branding } = useBranding();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !password) {
      notify(translate('validation.required'), { type: 'warning' });
      return;
    }

    setLoading(true);
    try {
      await login({ username, password });
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
      <Card sx={{ width: 'min(100% - 32px, 460px)', borderRadius: 1, boxShadow: '4px 4px 0 ' + theme.palette.text.primary, border: '2px solid', borderColor: 'text.primary', bgcolor: 'background.paper', color: 'text.primary' }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ mb: 4, textAlign: 'center' }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
              <Box sx={{ transform: 'rotate(-2deg)', '& > div': { width: 54, height: 54, fontSize: 21, boxShadow: '3px 3px 0 ' + theme.palette.text.primary } }}><BrandMark size={54} /></Box>
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

          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {branding.product_name} © {new Date().getFullYear()}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};
