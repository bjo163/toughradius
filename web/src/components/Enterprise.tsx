import type { ReactNode } from 'react';
import { Box, Card, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import type { ChipProps } from '@mui/material';
import { fontStacks } from '../theme';

/** PageHeader is the standard manga-enterprise page title bar: overline crumb, condensed title, actions. */
export const PageHeader = ({ section, title, subtitle, actions }: { section?: string; title: string; subtitle?: string; actions?: ReactNode }) => (
  <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'flex-end' }} spacing={1.5} sx={{ mb: 2, pb: 1.5, borderBottom: '2px solid', borderColor: 'text.primary' }}>
    <Box>
      {section && <Typography variant="overline" color="text.secondary" component="div">{section}</Typography>}
      <Typography variant="h4" component="h1">{title}</Typography>
      {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{subtitle}</Typography>}
    </Box>
    {actions && <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>{actions}</Stack>}
  </Stack>
);

type Tone = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'secondary';

/** KpiTile is a compact metric panel with a toned left ink bar; use inside KpiStrip. */
export const KpiTile = ({ label, value, hint, tone = 'primary', icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; icon?: ReactNode }) => {
  const theme = useTheme();
  const c = theme.palette[tone].main;
  return (
    <Card sx={{ position: 'relative', overflow: 'hidden', pl: 1.75, pr: 1.5, py: 1.25, '&::before': { content: '""', position: 'absolute', inset: '0 auto 0 0', width: 4, bgcolor: c } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="overline" color="text.secondary" noWrap component="div">{label}</Typography>
          <Typography sx={{ fontFamily: fontStacks.mono, fontWeight: 600, fontSize: '1.35rem', lineHeight: 1.15, color: c }}>{value}</Typography>
          {hint && <Typography variant="caption" color="text.secondary" noWrap component="div">{hint}</Typography>}
        </Box>
        {icon && <Box sx={{ color: c, opacity: 0.85, display: 'flex', p: 0.5, border: '1px solid', borderColor: alpha(c, 0.5), borderRadius: 0.5 }}>{icon}</Box>}
      </Stack>
    </Card>
  );
};

/** KpiStrip lays KPI tiles in a dense responsive grid. */
export const KpiStrip = ({ children }: { children: ReactNode }) => (
  <Box sx={{ display: 'grid', gap: 1.5, mb: 2, gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', md: 'repeat(4, minmax(0,1fr))', xl: 'repeat(6, minmax(0,1fr))' } }}>{children}</Box>
);

/** Panel is a titled manga panel (halftone header band) for tables, forms and tools. */
export const Panel = ({ title, subtitle, actions, children, dense }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode; dense?: boolean }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Card sx={{ mb: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{
        px: 1.75, py: 0.9, borderBottom: '1px solid', borderColor: alpha(theme.palette.text.primary, isDark ? 0.28 : 0.7),
        bgcolor: isDark ? '#1f1f23' : '#e9e4d6',
        backgroundImage: `radial-gradient(${alpha(theme.palette.text.primary, isDark ? 0.05 : 0.07)} 0.7px, transparent 0.9px)`, backgroundSize: '5px 5px',
      }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontFamily: fontStacks.display, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.875rem' }}>{title}</Typography>
          {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
        </Box>
        {actions && <Stack direction="row" spacing={1} alignItems="center">{actions}</Stack>}
      </Stack>
      <Box sx={{ p: dense ? 0 : 1.75, overflowX: 'auto' }}>{children}</Box>
    </Card>
  );
};

const statusTone: Record<string, ChipProps['color']> = {
  open: 'error', critical: 'error', high: 'warning', down: 'error', failed: 'error', expired: 'default',
  assigned: 'info', in_progress: 'warning', scheduled: 'warning', urgent: 'error', medium: 'info', pending: 'warning', unused: 'success',
  resolved: 'success', closed: 'default', low: 'default', normal: 'default', up: 'success', active: 'success', used: 'default', online: 'success',
};

/** StatusChip renders a consistent semantic chip for any status/priority string. */
export const StatusChip = ({ value, status, label }: { value?: string; status?: string; label?: string }) => {
  const raw = status || value || 'unknown';
  const v = raw.toLowerCase();
  const text = label || v.replace(/_/g, ' ').toUpperCase();
  return <Chip label={text} color={statusTone[v] ?? 'default'} variant="outlined" sx={{ fontFamily: fontStacks.mono }} />;
};

/** Mono renders technical identifiers (IP, MAC, ticket/voucher codes) in monospace. */
export const Mono = ({ children, sx }: { children: ReactNode; sx?: object }) => (
  <Box component="span" sx={{ fontFamily: fontStacks.mono, fontSize: '0.78rem', ...sx }}>{children}</Box>
);

/** ConsoleBox provides a standard NOC terminal box for live logs, ping diagnostics, and command streams. */
export const ConsoleBox = ({ children, maxHeight = 320 }: { children: ReactNode; maxHeight?: number | string }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box
      sx={{
        bgcolor: isDark ? '#0b0f14' : '#141a21',
        color: '#4ade80',
        p: 1.5,
        borderRadius: 0.5,
        border: '1px solid',
        borderColor: alpha(theme.palette.text.primary, isDark ? 0.3 : 0.6),
        boxShadow: `2px 2px 0 ${alpha(theme.palette.text.primary, isDark ? 0.38 : 0.85)}`,
        fontFamily: fontStacks.mono,
        fontSize: '0.8rem',
        lineHeight: 1.5,
        maxHeight,
        overflowY: 'auto',
      }}
    >
      {children}
    </Box>
  );
};
