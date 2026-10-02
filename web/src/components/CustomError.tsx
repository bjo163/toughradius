import { useCallback } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Stack,
  Alert,
} from '@mui/material';
import {
  Error as ErrorIcon,
  Refresh as RefreshIcon,
  WifiOff as WifiOffIcon,
  Home as HomeIcon,
} from '@mui/icons-material';
import { useTranslate, useRefresh, useRedirect } from 'react-admin';

interface CustomErrorProps {
  error?: Error | string;
  errorInfo?: React.ErrorInfo;
  resetErrorBoundary?: (...args: unknown[]) => void;
  title?: string;
}

/**
 * CustomError displays a user-friendly error message with retry functionality.
 * It detects connectivity issues and provides appropriate guidance.
 * 
 * @param error - The error object or message string
 * @param errorInfo - React error info from error boundary
 * @param resetErrorBoundary - Function to reset the error boundary
 * @param title - Optional custom title for the error message
 */
export const CustomError = ({
  error,
  resetErrorBoundary,
  title,
}: CustomErrorProps) => {
  const translate = useTranslate();
  const refresh = useRefresh();
  const redirect = useRedirect();

  const errorMessage = error instanceof Error ? error.message : String(error || '');
  
  // Detect if this is a connectivity/network error
  const isConnectivityError = 
    errorMessage.toLowerCase().includes('connectivity') ||
    errorMessage.toLowerCase().includes('network') ||
    errorMessage.toLowerCase().includes('fetch') ||
    errorMessage.toLowerCase().includes('failed to fetch') ||
    errorMessage.toLowerCase().includes('no connectivity') ||
    errorMessage.toLowerCase().includes('econnrefused');

  const handleRetry = useCallback(() => {
    if (resetErrorBoundary) {
      resetErrorBoundary();
    }
    refresh();
  }, [resetErrorBoundary, refresh]);

  const handleGoHome = useCallback(() => {
    redirect('/');
  }, [redirect]);

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
        p: 2,
      }}
    >
      <Card
        elevation={3}
        sx={{
          maxWidth: 500,
          width: '100%',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            backgroundColor: isConnectivityError ? 'warning.main' : 'error.main',
            color: 'white',
            p: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          {isConnectivityError ? (
            <WifiOffIcon sx={{ fontSize: 40 }} />
          ) : (
            <ErrorIcon sx={{ fontSize: 40 }} />
          )}
          <Typography variant="h5" fontWeight={600}>
            {title || (isConnectivityError 
              ? translate('error.connectivity_title', { _: 'Connection problem' })
              : translate('error.general_title', { _: 'Something went wrong' })
            )}
          </Typography>
        </Box>

        <CardContent sx={{ p: 3 }}>
          <Stack spacing={3}>
            {isConnectivityError ? (
              <Alert severity="warning">
                {translate('error.connectivity_message', {
                  _: 'Cannot connect to the server。Check your network connectionand confirm the backend serviceYesNorunning。',
                })}
              </Alert>
            ) : (
              <Alert severity="error">
                {translate('error.general_message', {
                  _: 'An error occurred while loading data。Please try again later。',
                })}
              </Alert>
            )}

            {errorMessage && !isConnectivityError && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  p: 2,
                  backgroundColor: 'grey.100',
                  borderRadius: 1,
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                }}
              >
                {errorMessage}
              </Typography>
            )}

            {isConnectivityError && (
              <Box>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  {translate('error.troubleshooting_title', { _: 'Troubleshooting suggestions：' })}
                </Typography>
                <Typography variant="body2" color="text.secondary" component="ul" sx={{ pl: 2 }}>
                  <li>{translate('error.troubleshooting_network', { _: 'Check that your network connection is working' })}</li>
                  <li>{translate('error.troubleshooting_server', { _: 'Confirm the backend service is running' })}</li>
                  <li>{translate('error.troubleshooting_refresh', { _: 'Refresh the page and try again' })}</li>
                </Typography>
              </Box>
            )}

            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button
                variant="outlined"
                startIcon={<HomeIcon />}
                onClick={handleGoHome}
              >
                {translate('error.go_home', { _: 'Go home' })}
              </Button>
              <Button
                variant="contained"
                startIcon={<RefreshIcon />}
                onClick={handleRetry}
                color={isConnectivityError ? 'warning' : 'primary'}
              >
                {translate('error.retry', { _: 'Retry' })}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
};

export default CustomError;
