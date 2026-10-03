import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, Collapse,
  LinearProgress, Stack, Typography,
} from '@mui/material';
import Grid from '@mui/material/GridLegacy';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Link as RouterLink } from 'react-router-dom';
import { useGetIdentity, useGetList } from 'react-admin';
import { QuickTourDialog } from './QuickTourDialog';
import { readOnboardingChecks, readOnboardingPreference, writeOnboardingChecks, writeOnboardingPreference } from './onboardingStorage';

const ADMIN_LEVELS = ['super', 'admin'];
const setupRoutes = [
  { id: 'secure-account', title: 'Secure the operator account', detail: 'Set a private operator password and protect deployment secrets.', route: '/account/settings', admin: false, count: false, manual: true },
  { id: 'billing-defaults', title: 'Review company and billing defaults', detail: 'Confirm company details, currency, due dates, grace period, and suspension behavior.', route: '/system/config', admin: true, count: false },
  { id: 'radius-profile', title: 'Configure a RADIUS profile', detail: 'A profile record is a starting point; it does not prove client authentication works.', route: '/radius/profiles', admin: true, count: true, resource: 'radius/profiles' },
  { id: 'nas-device', title: 'Register an authorized NAS', detail: 'Match its address, shared secret, authentication, and accounting ports on the device.', route: '/network/nas', admin: true, count: true, resource: 'network/nas' },
  { id: 'internet-package', title: 'Create an internet package', detail: 'Choose the intended RADIUS profile and set the commercial plan details.', route: '/isp/packages', admin: true, count: true, resource: 'isp/packages' },
  { id: 'customer-service', title: 'Add a customer and subscription', detail: 'Connect a customer and package to a service account; use a test customer for a pilot.', route: '/isp/customers', admin: true, count: true, resource: 'isp/customers' },
  { id: 'live-verification', title: 'Verify authentication and accounting on a live NAS', detail: 'After testing on an authorized device, inspect Online Sessions and Accounting. This step always needs operator confirmation.', route: '/radius/online', admin: false, count: false, manual: true },
];

interface SetupStepProps {
  step: typeof setupRoutes[number];
  checked: boolean;
  isAdmin: boolean;
  onManualChange: (id: string, checked: boolean) => void;
  countState: 'loading' | 'error' | 'configured' | 'empty' | null;
  total?: number;
  retry: () => void;
}

const SetupStep = ({ step, checked, isAdmin, onManualChange, countState, total, retry }: SetupStepProps) => {
  return (
    <Grid item xs={12} md={6}>
      <Box sx={{ height: '100%', p: 1.25, border: '1px solid', borderColor: checked ? 'success.dark' : 'divider', borderRadius: 1.5, bgcolor: checked ? 'rgba(34,197,94,0.06)' : 'background.paper' }}>
        <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
          <Box sx={{ display: 'flex', alignItems: 'flex-start', flex: 1 }}>
            {step.manual && <Checkbox checked={checked} onChange={(event) => onManualChange(step.id, event.target.checked)} inputProps={{ 'aria-label': `Mark ${step.title} complete` }} sx={{ pt: 0.15, pl: 0, pr: 1 }} />}
            <Box><Typography variant="subtitle2" fontWeight={750}>{step.title}</Typography><Typography variant="caption" color="text.secondary">{step.detail}</Typography></Box>
          </Box>
          {step.admin && <Chip size="small" label={isAdmin ? 'Admin' : 'Admin setup'} variant="outlined" />}
        </Stack>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ pl: 4.25, mt: 0.5 }}>
          {countState === 'loading' && <Stack direction="row" spacing={0.75} alignItems="center"><CircularProgress size={13} /><Typography variant="caption" color="text.secondary">Checking records…</Typography></Stack>}
          {countState === 'configured' && <Typography variant="caption" color="success.main">{total} record{total === 1 ? '' : 's'} found · not live-verified</Typography>}
          {countState === 'empty' && <Typography variant="caption" color="text.secondary">No records found</Typography>}
          {countState === 'error' && <Stack direction="row" alignItems="center" spacing={0.5}><Typography variant="caption" color="warning.main">Unable to check</Typography><Button size="small" startIcon={<RefreshIcon />} onClick={retry}>Retry</Button></Stack>}
          {!step.count && <Typography variant="caption" color={step.id === 'live-verification' ? 'warning.main' : 'text.secondary'}>{step.id === 'live-verification' ? 'Operator verification required' : 'Manual confirmation'}</Typography>}
          {(!step.admin || isAdmin) ? <Button size="small" component={RouterLink} to={step.route} sx={{ minWidth: 'auto' }}>Open</Button> : <Typography variant="caption" color="text.secondary">Ask an admin</Typography>}
        </Stack>
      </Box>
    </Grid>
  );
};

export const GettingStartedCard = () => {
  const { data: identity } = useGetIdentity();
  const operatorId = identity?.id ?? 'operator';
  const isAdmin = ADMIN_LEVELS.includes(identity?.level ?? '');
  const visibleSteps = useMemo(() => setupRoutes.filter((step) => isAdmin || !step.admin), [isAdmin]);
  const [storedOperator, setStoredOperator] = useState(operatorId);
  const [checks, setChecks] = useState<string[]>(() => readOnboardingChecks(operatorId));
  const [collapsed, setCollapsed] = useState(() => readOnboardingPreference(operatorId, 'checklist-collapsed'));
  const operatorChanged = storedOperator !== operatorId;
  if (operatorChanged) setStoredOperator(operatorId);
  const activeChecks = operatorChanged ? readOnboardingChecks(operatorId) : checks;
  const isCollapsed = operatorChanged ? readOnboardingPreference(operatorId, 'checklist-collapsed') : collapsed;
  const [tourOpen, setTourOpen] = useState(false);
  const recordCounts = visibleSteps.filter(({ count, resource }) => count && isAdmin && Boolean(resource));
  const countQueries = recordCounts.map(({ resource }) => useGetList(resource!, {
    pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: {},
  }, { enabled: true, staleTime: 60_000, retry: false }));
  const configuredIds = new Set(recordCounts.flatMap(({ id }, index) => {
    const result = countQueries[index];
    return result.isSuccess && (result.total ?? 0) > 0 ? [id] : [];
  }));
  const completeCount = visibleSteps.filter((step) => step.manual
    ? activeChecks.includes(step.id)
    : configuredIds.has(step.id)
  ).length;
  const percent = Math.round((completeCount / visibleSteps.length) * 100);
  const markConfigured = (id: string, value: boolean) => {
    const next = value ? [...new Set([...activeChecks, id])] : activeChecks.filter((item) => item !== id);
    setChecks(next);
    writeOnboardingChecks(operatorId, next);
  };
  const toggleCollapsed = () => {
    const next = !isCollapsed;
    setCollapsed(next);
    writeOnboardingPreference(operatorId, 'checklist-collapsed', next);
  };
  const hasLiveCheck = activeChecks.includes('live-verification');

  return (
    <Card sx={{ mb: 1.5, overflow: 'hidden', position: 'relative', '&::before': { content: '""', position: 'absolute', inset: '0 auto 0 0', width: 3, bgcolor: 'primary.main' } }}>
      <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: 2 } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.5}>
          <Box sx={{ flex: 1 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <CheckCircleOutlineIcon color="primary" />
              <Typography variant="h6" fontWeight={800}>Getting started</Typography>
              <Chip size="small" color={percent === 100 ? 'success' : 'default'} label={`${completeCount}/${visibleSteps.length} confirmed`} />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>Follow the setup order, then verify live access with a NAS you are authorized to test.</Typography>
          </Box>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Button size="small" startIcon={<PlayCircleOutlineIcon />} onClick={() => setTourOpen(true)}>Quick tour</Button>
            <Button size="small" startIcon={<HelpOutlineIcon />} component={RouterLink} to="/guide">User guide</Button>
            <Button size="small" aria-label={isCollapsed ? 'Expand getting started checklist' : 'Collapse getting started checklist'} onClick={toggleCollapsed} startIcon={isCollapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}>{isCollapsed ? 'Expand' : 'Collapse'}</Button>
          </Stack>
        </Stack>
        <LinearProgress variant="determinate" value={percent} aria-label="Setup checklist progress" sx={{ height: 4, borderRadius: 5, mt: 1.25, mb: isCollapsed ? 0 : 1.25 }} />
        <Collapse in={!isCollapsed}>
          <Grid container spacing={1}>
            {visibleSteps.map((step) => {
              const queryIndex = recordCounts.findIndex(({ id }) => id === step.id);
              const query = queryIndex >= 0 ? countQueries[queryIndex] : undefined;
              const total = query?.total;
              const countState = !step.count ? null : query?.isPending ? 'loading' : query?.isError ? 'error' : total && total > 0 ? 'configured' : 'empty';
              return <SetupStep key={step.id} step={step} checked={step.manual ? activeChecks.includes(step.id) : configuredIds.has(step.id)} countState={countState} total={total} retry={() => query?.refetch()} isAdmin={isAdmin} onManualChange={markConfigured} />;
            })}
          </Grid>
          <Alert severity="info" sx={{ mt: 1.25 }}>
            Record counts show configuration only. They do not test RADIUS. The live verification checkbox is manual and stays local to this browser and operator.
          </Alert>
          {hasLiveCheck && <Alert severity="warning" sx={{ mt: 1 }}>Live verification was confirmed manually in this browser. This checklist cannot independently validate the NAS.</Alert>}
        </Collapse>
      </CardContent>
      <QuickTourDialog operatorId={operatorId} open={tourOpen} onClose={() => setTourOpen(false)} />
    </Card>
  );
};
