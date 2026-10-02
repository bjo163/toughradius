import { useEffect, useState } from 'react';
import { useNotify } from 'react-admin';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  TextField,
  Alert,
} from '@mui/material';

export default function AuthTest() {
  const notify = useNotify();
  const [token, setToken] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedToken = localStorage.getItem('token') || '';
    setToken(savedToken);
  }, []);

  const testLogin = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: 'admin',
          password: 'admin',
        }),
      });

      const data = await response.json();
      console.log('Login response:', data);
      
      if (response.ok && data.data && !data.error) {
        const newToken = data.data.token;
        localStorage.setItem('token', newToken);
        localStorage.setItem('user', JSON.stringify(data.data.user));
        setToken(newToken);
        setResult(`Sign-in succeeded; token received: ${newToken.substring(0, 20)}...`);
        notify('Login successful', { type: 'success' });
      } else {
        setResult(`Login failed: ${data.message || 'Unknown error'}`);
        notify('Login failed', { type: 'error' });
      }
    } catch (error) {
      console.error('Login error:', error);
      setResult(`Sign-in error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const testApiCall = async () => {
    if (!token) {
      notify('Sign in first to obtain a token', { type: 'error' });
      return;
    }

    setLoading(true);
    try {
      console.log('Testing with token:', token.substring(0, 20) + '...');
      
      const response = await fetch('/api/v1/system/operators/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('API Response status:', response.status);
      console.log('API Response headers:', Object.fromEntries(response.headers.entries()));
      
      const data = await response.json();
      console.log('API Response data:', data);
      
      if (response.ok && data.data && !data.error) {
        setResult(`API requestSuccess: ${JSON.stringify(data.data, null, 2)}`);
        notify('API requestSuccess', { type: 'success' });
      } else {
        setResult(`API requestFailed: ${data.message || 'Unknown error'}`);
        notify('API requestFailed', { type: 'error' });
      }
    } catch (error) {
      console.error('API error:', error);
      setResult(`API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const testCurl = () => {
    if (!token) {
      notify('Sign in first to obtain a token', { type: 'error' });
      return;
    }
    
    const curlCommand = `curl -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" http://localhost:1816/api/v1/system/operators/me`;
    navigator.clipboard.writeText(curlCommand);
    notify('curl commandCopied to clipboard', { type: 'info' });
    setResult(`curl command:\n${curlCommand}`);
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', mt: 2, p: 2 }}>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Authentication test page
          </Typography>
          
          <Alert severity="info" sx={{ mb: 3 }}>
            Test the sign-in and API authentication flow
          </Alert>
          
          <Box sx={{ mb: 3 }}>
            <TextField
              fullWidth
              label="CurrentToken"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              multiline
              rows={3}
              helperText="Currently stored authentication token"
            />
          </Box>
          
          <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
            <Button 
              variant="contained" 
              onClick={testLogin}
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Test Login'}
            </Button>
            <Button 
              variant="outlined" 
              onClick={testApiCall}
              disabled={loading}
            >
              {loading ? 'Request in progress...' : 'Test API request'}
            </Button>
            <Button 
              variant="text" 
              onClick={testCurl}
            >
              Generate curl command
            </Button>
          </Box>
          
          <Typography variant="h6" sx={{ mb: 2 }}>
            Test result:
          </Typography>
          
          <Box 
            component="pre" 
            sx={{ 
              bgcolor: '#f5f5f5', 
              p: 2, 
              borderRadius: 1, 
              overflow: 'auto',
              fontSize: '0.875rem',
              whiteSpace: 'pre-wrap'
            }}
          >
            {result || 'Waiting for test...'}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
