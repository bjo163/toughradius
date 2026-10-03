import { useState } from 'react';
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress,
  Stack, Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { writeOnboardingPreference } from './onboardingStorage';

const TOUR_STEPS = [
  { title: 'Dashboard at a glance', body: 'Use the dashboard for current RADIUS activity, customer and billing totals, and service trends. A metric can be opened to inspect its records.', path: '/', link: 'Open Dashboard' },
  { title: 'Build the service path', body: 'A package points to a RADIUS profile. A subscription connects a customer and package to a RADIUS user. Follow the setup checklist before serving a production customer.', path: '/isp/packages', link: 'Open Packages' },
  { title: 'Watch live access', body: 'Online Sessions show current connections. Accounting records show reported session activity. Existing NAS configuration does not prove that a live authentication or accounting request succeeded.', path: '/radius/online', link: 'Open Online Sessions' },
  { title: 'Run billing carefully', body: 'Review invoice status and due dates, then record a payment only after it has actually been received. Overdue enforcement depends on the configured grace and suspension settings.', path: '/isp/invoices', link: 'Open Invoices' },
  { title: 'Monitor operations', body: 'Network & Alerts is an optional operations area. Use only explicitly authorized network targets; monitoring does not validate customer RADIUS access.', path: '/operations', link: 'Open Network & Alerts' },
];

interface QuickTourDialogProps {
  operatorId: string | number;
  open: boolean;
  onClose: () => void;
}

export const QuickTourDialog = ({ operatorId, open, onClose }: QuickTourDialogProps) => {
  const [step, setStep] = useState(0);
  const complete = () => {
    writeOnboardingPreference(operatorId, 'tour-seen', true);
    setStep(0);
    onClose();
  };
  const current = TOUR_STEPS[step];

  return (
    <Dialog open={open} onClose={complete} fullWidth maxWidth="sm" aria-labelledby="quick-tour-title">
      <DialogTitle id="quick-tour-title">Quick tour · {step + 1} of {TOUR_STEPS.length}</DialogTitle>
      <LinearProgress variant="determinate" value={((step + 1) / TOUR_STEPS.length) * 100} aria-label="Tour progress" />
      <DialogContent sx={{ pt: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">{current.title}</Typography>
          <Typography color="text.secondary">{current.body}</Typography>
          <Button component={RouterLink} to={current.path} onClick={complete} variant="outlined" sx={{ alignSelf: 'flex-start' }}>
            {current.link}
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={complete}>Skip tour</Button>
        {step > 0 && <Button onClick={() => setStep((value) => value - 1)}>Back</Button>}
        <Button variant="contained" onClick={() => (step === TOUR_STEPS.length - 1 ? complete() : setStep((value) => value + 1))}>
          {step === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
