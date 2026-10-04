import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotify } from 'react-admin';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, MenuItem, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Typography,
} from '@mui/material';
import { AddBusiness, Business, Edit, Refresh } from '@mui/icons-material';
import { apiRequest } from '../utils/apiClient';

type Tenant = {
  id: string;
  name: string;
  slug: string;
  kind: 'isp' | 'rtrw';
  status: 'active' | 'suspended';
  company_name?: string;
  tax_id?: string;
  billing_address?: string;
  contact_email?: string;
  contact_phone?: string;
};

const initialForm = {
  name: '', slug: '', kind: 'isp', company_name: '', tax_id: '',
  billing_address: '', contact_email: '', contact_phone: '',
  admin_username: '', admin_password: '',
};

const hasPlatformPermission = () => {
  try {
    const permissions: unknown = JSON.parse(localStorage.getItem('permissions') || '[]');
    return Array.isArray(permissions) && permissions.includes('platform_admin');
  } catch {
    return false;
  }
};

export const PlatformTenantsPage = () => {
  const [form, setForm] = useState(initialForm);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [editForm, setEditForm] = useState({
    name: '', company_name: '', tax_id: '', billing_address: '', contact_email: '', contact_phone: '',
  });
  const queryClient = useQueryClient();
  const notify = useNotify();
  const allowed = hasPlatformPermission();
  const tenantsQuery = useQuery({
    queryKey: ['platform', 'tenants'],
    queryFn: () => apiRequest<Tenant[]>('/platform/tenants?perPage=100&sort=id&order=ASC'),
    enabled: allowed,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] });
  const createTenant = useMutation({
    mutationFn: () => apiRequest('/platform/tenants', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: async () => {
      setForm(initialForm);
      await refresh();
      notify('Tenant and initial administrator created', { type: 'success' });
    },
    onError: (error: Error) => notify(error.message || 'Tenant creation failed', { type: 'error' }),
  });
  const updateStatus = useMutation({
    mutationFn: ({ tenant, status }: { tenant: Tenant; status: Tenant['status'] }) =>
      apiRequest(`/platform/tenants/${tenant.id}`, { method: 'PUT', body: JSON.stringify({ status }) }),
    onSuccess: async () => { await refresh(); notify('Tenant status updated', { type: 'success' }); },
    onError: (error: Error) => notify(error.message || 'Tenant update failed', { type: 'error' }),
  });
  const updateIdentity = useMutation({
    mutationFn: () => apiRequest(`/platform/tenants/${editingTenant?.id}`, { method: 'PUT', body: JSON.stringify(editForm) }),
    onSuccess: async () => {
      setEditingTenant(null);
      await refresh();
      notify('Tenant identity updated', { type: 'success' });
    },
    onError: (error: Error) => notify(error.message || 'Tenant update failed', { type: 'error' }),
  });
  const set = (key: keyof typeof initialForm) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm(current => ({ ...current, [key]: event.target.value }));

  if (!allowed) {
    return <Box sx={{ p: 3 }}><Alert severity="error">Platform administrator access is required.</Alert></Box>;
  }

  const tenants = tenantsQuery.data ?? [];
  return <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1440, mx: 'auto' }}>
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
      <Business color="primary" />
      <Typography variant="h4" fontWeight={800}>ISP tenants</Typography>
      <Chip size="small" label="PLATFORM CONTROL" color="success" variant="outlined" />
      <Box sx={{ flex: 1 }} />
      <Button startIcon={<Refresh />} onClick={() => void tenantsQuery.refetch()}>Refresh</Button>
    </Stack>
    <Typography color="text.secondary" sx={{ mb: 2 }}>Create an independent ISP or RT/RW Net organization and its first tenant administrator.</Typography>

    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}><AddBusiness color="primary" /><Typography variant="h6">Provision tenant</Typography></Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
          <TextField required label="Tenant name" value={form.name} onChange={set('name')} />
          <TextField required label="Slug" helperText="Lowercase letters, numbers, and hyphens" value={form.slug} onChange={set('slug')} />
          <TextField select label="Organization type" value={form.kind} onChange={set('kind')}>
            <MenuItem value="isp">ISP</MenuItem><MenuItem value="rtrw">RT/RW Net</MenuItem>
          </TextField>
          <TextField label="Company / invoice name" value={form.company_name} onChange={set('company_name')} />
          <TextField label="Tax ID" value={form.tax_id} onChange={set('tax_id')} />
          <TextField label="Contact email" type="email" value={form.contact_email} onChange={set('contact_email')} />
          <TextField label="Contact phone" value={form.contact_phone} onChange={set('contact_phone')} />
          <TextField label="Billing address" value={form.billing_address} onChange={set('billing_address')} />
          <TextField required label="First admin username" value={form.admin_username} onChange={set('admin_username')} />
          <TextField required type="password" label="First admin password" helperText="At least 12 characters" value={form.admin_password} onChange={set('admin_password')} />
        </Box>
        {createTenant.isError && <Alert severity="error" sx={{ mt: 2 }}>{createTenant.error.message}</Alert>}
        <Button sx={{ mt: 2 }} variant="contained" startIcon={<AddBusiness />} disabled={createTenant.isPending || !form.name || !form.slug || !form.admin_username || form.admin_password.length < 12} onClick={() => createTenant.mutate()}>
          {createTenant.isPending ? 'Creating…' : 'Create tenant'}
        </Button>
      </CardContent>
    </Card>

    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" sx={{ mb: 1.5 }}>Organizations <Chip size="small" label={tenants.length} sx={{ ml: 1 }} /></Typography>
        {tenantsQuery.isLoading ? <CircularProgress size={24} /> : tenantsQuery.isError ? <Alert severity="error">{tenantsQuery.error.message}</Alert> :
          <Box sx={{ overflowX: 'auto' }}><Table size="small"><TableHead><TableRow>
            <TableCell>Name</TableCell><TableCell>Slug</TableCell><TableCell>Type</TableCell><TableCell>Company</TableCell><TableCell>Status</TableCell><TableCell align="right">Action</TableCell>
          </TableRow></TableHead><TableBody>
            {tenants.map(tenant => <TableRow key={tenant.id} hover>
              <TableCell>{tenant.name}</TableCell><TableCell><Typography fontFamily="monospace">{tenant.slug}</Typography></TableCell>
              <TableCell>{tenant.kind === 'rtrw' ? 'RT/RW Net' : 'ISP'}</TableCell><TableCell>{tenant.company_name || '—'}</TableCell>
              <TableCell><Chip size="small" color={tenant.status === 'active' ? 'success' : 'default'} label={tenant.status} /></TableCell>
              <TableCell align="right">{tenant.slug === 'default' ? <Chip size="small" variant="outlined" label="Legacy tenant" /> : <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                <Button size="small" startIcon={<Edit />} onClick={() => {
                  setEditingTenant(tenant);
                  setEditForm({
                    name: tenant.name, company_name: tenant.company_name || '', tax_id: tenant.tax_id || '',
                    billing_address: tenant.billing_address || '', contact_email: tenant.contact_email || '',
                    contact_phone: tenant.contact_phone || '',
                  });
                }}>Edit details</Button>
                <Button size="small" color={tenant.status === 'active' ? 'warning' : 'success'} disabled={updateStatus.isPending}
                  onClick={() => updateStatus.mutate({ tenant, status: tenant.status === 'active' ? 'suspended' : 'active' })}>
                  {tenant.status === 'active' ? 'Suspend' : 'Activate'}
                </Button></Stack>}</TableCell>
            </TableRow>)}
            {!tenants.length && <TableRow><TableCell colSpan={6} align="center">No tenants yet.</TableCell></TableRow>}
          </TableBody></Table></Box>}
      </CardContent>
    </Card>
    <Dialog open={Boolean(editingTenant)} onClose={() => setEditingTenant(null)} fullWidth maxWidth="sm">
      <DialogTitle>Edit tenant identity</DialogTitle>
      <DialogContent>
        <Typography color="text.secondary" sx={{ mb: 2 }}>These fields appear on tenant billing documents and contact records.</Typography>
        <Stack spacing={1.5}>
          <TextField required label="Tenant name" value={editForm.name} onChange={event => setEditForm(current => ({ ...current, name: event.target.value }))} />
          <TextField label="Company / invoice name" value={editForm.company_name} onChange={event => setEditForm(current => ({ ...current, company_name: event.target.value }))} />
          <TextField label="Tax ID" value={editForm.tax_id} onChange={event => setEditForm(current => ({ ...current, tax_id: event.target.value }))} />
          <TextField label="Billing address" multiline minRows={2} value={editForm.billing_address} onChange={event => setEditForm(current => ({ ...current, billing_address: event.target.value }))} />
          <TextField label="Contact email" type="email" value={editForm.contact_email} onChange={event => setEditForm(current => ({ ...current, contact_email: event.target.value }))} />
          <TextField label="Contact phone" value={editForm.contact_phone} onChange={event => setEditForm(current => ({ ...current, contact_phone: event.target.value }))} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setEditingTenant(null)} disabled={updateIdentity.isPending}>Cancel</Button>
        <Button variant="contained" onClick={() => updateIdentity.mutate()} disabled={updateIdentity.isPending || !editForm.name.trim()}>
          {updateIdentity.isPending ? 'Saving…' : 'Save identity'}
        </Button>
      </DialogActions>
    </Dialog>
  </Box>;
};
