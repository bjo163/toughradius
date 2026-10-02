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
import { Visibility, VisibilityOff, Person, Lock } from '@mui/icons-material';

export const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const login = useLogin();
  const notify = useNotify();
  const translate = useTranslate();
  const queryClient = useQueryClient();

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
        background: 'radial-gradient(ellipse at 18% 12%, rgba(74,222,128,0.20), transparent 36%), radial-gradient(ellipse at 85% 88%, rgba(20,184,166,0.15), transparent 36%), linear-gradient(145deg, #07130d 0%, #0e2417 52%, #10251a 100%)',
      }}
    >
      <Card sx={{ minWidth: 400, maxWidth: 500, borderRadius: 3, boxShadow: '0 24px 80px rgba(0,0,0,0.38)', border: '1px solid rgba(134,239,172,0.16)', background: 'linear-gradient(145deg, rgba(18,36,25,0.98), rgba(10,25,16,0.98))', color: '#f0fdf4' }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ mb: 4, textAlign: 'center' }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
              <Box sx={{ width: 54, height: 54, display: 'grid', placeItems: 'center', borderRadius: 2.5, color: '#07130d', background: 'linear-gradient(135deg, #86efac, #16a34a)', fontSize: 25, fontWeight: 900, letterSpacing: '-0.08em', boxShadow: '0 8px 30px rgba(34,197,94,0.28)' }}>M</Box>
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#f0fdf4', mb: 1, letterSpacing: '0.04em' }}>
              {translate('app.title')}
            </Typography>
            <Typography variant="body2" sx={{ color: '#a7c4ae' }}>
              {translate('app.subtitle')}
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
                background: 'linear-gradient(135deg, #4ade80 0%, #16a34a 100%)',
                color: '#07130d',
                boxShadow: '0 8px 24px rgba(34,197,94,0.24)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #86efac 0%, #22c55e 100%)',
                },
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
              MWX-ISP © {new Date().getFullYear()}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};
