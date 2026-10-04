import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  ArrayField, Create, Datagrid, DateField, Edit, FunctionField, List, NumberField,
  NumberInput, ReferenceField, ReferenceInput, SearchInput, SelectInput, Show, SimpleForm,
  SimpleShowLayout, TextField, TextInput, TopToolbar, CreateButton, EditButton, useNotify,
  useRefresh, useRecordContext, useListContext,
} from 'react-admin';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField as MuiTextField, Typography,
} from '@mui/material';
import Grid from '@mui/material/GridLegacy';
import {
  AddOutlined as AddIcon,
  CreditCardOutlined as PaymentIcon,
  PrintOutlined as PrintIcon,
  ReceiptLongOutlined as ReceiptIcon,
  WhatsApp as WhatsAppIcon,
} from '@mui/icons-material';
import { apiRequest } from '../utils/apiClient';
import { MrtgTrafficGraph } from '../components/MrtgTrafficGraph';
import { Mono, StatusChip, PageHeader, KpiStrip, KpiTile, Panel } from '../components/Enterprise';

const listActions = <TopToolbar><CreateButton /></TopToolbar>;
const idrOptions: Intl.NumberFormatOptions = { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 };
const formatIDR = (val?: number | null) =>
  new Intl.NumberFormat('id-ID', idrOptions).format(val || 0);

const formatBytes = (bytes?: number | null) => {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const formatPhoneForWA = (phone?: string) => {
  if (!phone) return '';
  let clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  }
  return clean;
};

const generateWhatsAppInvoiceLink = (record: any) => {
  const phone = formatPhoneForWA(record.customer_phone || record.phone || '');
  const lines = [
    `*TAGIHAN INTERNET ${record.company_name || 'MWX-ISP'}*`,
    `----------------------------------------`,
    `No. Invoice: ${record.invoice_no}`,
    `Pelanggan: ${record.customer_name || record.customer_no || ''}`,
    record.subscription_no ? `Langganan: ${record.subscription_no}` : '',
    record.period_start ? `Periode: ${new Date(record.period_start).toLocaleDateString()} - ${record.period_end ? new Date(record.period_end).toLocaleDateString() : ''}` : '',
    `Total Tagihan: ${formatIDR(record.total)}`,
    `Sisa Tagihan: ${formatIDR(record.balance)}`,
    `Jatuh Tempo: ${record.due_date ? new Date(record.due_date).toLocaleDateString() : '-'}`,
    `Status: ${record.status?.toUpperCase()}`,
    `----------------------------------------`,
    `Pembayaran dapat ditransfer ke rekening resmi kami.`,
    `Mohon cantumkan No. Invoice *${record.invoice_no}* pada keterangan transfer.`,
    `----------------------------------------`,
    `Terima kasih telah menggunakan layanan kami.`,
  ].filter(Boolean).join('\n');

  const encoded = encodeURIComponent(lines);
  return phone ? `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}` : `https://api.whatsapp.com/send?text=${encoded}`;
};

const generateWhatsAppReceiptLink = (payment: any, customerPhone?: string) => {
  const phone = formatPhoneForWA(customerPhone || '');
  const lines = [
    `*BUKTI PEMBAYARAN INTERNET*`,
    `----------------------------------------`,
    `No. Pembayaran: ${payment.payment_no}`,
    payment.invoice_no ? `No. Invoice: ${payment.invoice_no}` : '',
    `Jumlah Diterima: ${formatIDR(payment.amount)}`,
    `Metode: ${(payment.method || '').replace(/_/g, ' ').toUpperCase()}`,
    payment.reference ? `Referensi: ${payment.reference}` : '',
    `Waktu: ${payment.paid_at ? new Date(payment.paid_at).toLocaleString() : new Date().toLocaleString()}`,
    `Status: LUNAS / DITERIMA`,
    `----------------------------------------`,
    `Pembayaran Anda telah diverifikasi oleh sistem. Layanan internet aktif.`,
    `Terima kasih atas kerja samanya!`,
  ].filter(Boolean).join('\n');

  const encoded = encodeURIComponent(lines);
  return phone ? `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}` : `https://api.whatsapp.com/send?text=${encoded}`;
};

const customerStatusChoices = [
  { id: 'pending', name: 'Pending' },
  { id: 'active', name: 'Active' }, { id: 'inactive', name: 'Inactive' },
  { id: 'suspended', name: 'Suspended' }, { id: 'terminated', name: 'Terminated' },
];
const billingStatusChoices = [
  { id: 'draft', name: 'Draft' }, { id: 'issued', name: 'Issued' },
  { id: 'partial', name: 'Partial' }, { id: 'paid', name: 'Paid' },
  { id: 'overdue', name: 'Overdue' }, { id: 'void', name: 'Void' },
];

const MoneyField = ({ source }: { source: string }) => <NumberField source={source} options={idrOptions} />;

const StatusField = ({ source = 'status' }: { source?: string }) => (
  <FunctionField source={source} render={(record) => {
    const value = String(record?.[source] ?? 'unknown');
    return <StatusChip value={value} />;
  }} />
);

const OnlineField = () => <FunctionField source="online" render={(record) => (
  <StatusChip value={record?.online ? 'online' : 'offline'} />
)} />;

const CustomerListHeader = () => {
  const { total, data, isLoading } = useListContext<any>();
  const recordList: any[] = data || [];
  const activeCount = recordList.filter((r: any) => r.status === 'active').length;
  const pendingCount = recordList.filter((r: any) => r.status === 'pending').length;
  const suspendedCount = recordList.filter((r: any) => r.status === 'suspended').length;
  const totalBalance = recordList.reduce((acc: number, r: any) => acc + (Number(r.outstanding) || 0), 0);

  return (
    <Box sx={{ mb: 2 }}>
      <PageHeader
        section="SUBSCRIBER MANAGEMENT"
        title="ISP Customers"
        subtitle="Manage active fiber subscribers, new leads, billing profiles, and radius linkages."
      />
      <KpiStrip>
        <KpiTile
          label="TOTAL SUBSCRIBERS"
          value={isLoading ? '...' : (total ?? recordList.length ?? 0)}
          hint="Registered accounts"
          tone="primary"
        />
        <KpiTile
          label="ACTIVE"
          value={isLoading ? '...' : activeCount}
          hint="Operational services"
          tone="success"
        />
        <KpiTile
          label="PENDING LEADS"
          value={isLoading ? '...' : pendingCount}
          hint="Survey & installation"
          tone="warning"
        />
        <KpiTile
          label="TOTAL OUTSTANDING"
          value={isLoading ? '...' : formatIDR(totalBalance)}
          hint={`${suspendedCount} suspended`}
          tone={totalBalance > 0 ? "error" : "success"}
        />
      </KpiStrip>
    </Box>
  );
};

const customerFilters = [<SearchInput source="q" alwaysOn key="q" />, <SelectInput source="status" choices={customerStatusChoices} key="status" />];
export const CustomerList = () => (
  <List actions={listActions} filters={customerFilters} perPage={25} title="Customers">
    <CustomerListHeader />
    <Datagrid
      rowClick="show"
      sx={{
        border: '1.5px solid #000',
        boxShadow: '3px 3px 0px #000',
        borderRadius: 0,
        '& .RaDatagrid-headerCell': {
          fontWeight: 800,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.75rem',
          bgcolor: 'action.hover',
        },
      }}
    >
      <FunctionField source="customer_no" render={(r: any) => <Mono>{r.customer_no}</Mono>} />
      <TextField source="name" sx={{ fontWeight: 600 }} />
      <TextField source="phone" />
      <TextField source="email" />
      <TextField source="city" />
      <TextField source="package_name" />
      <FunctionField source="radius_username" render={(r: any) => <Mono>{r.radius_username || '-'}</Mono>} />
      <StatusField />
      <MoneyField source="outstanding" />
    </Datagrid>
  </List>
);

const CustomerForm = () => <SimpleForm>
  <TextInput source="name" isRequired /><TextInput source="phone" /><TextInput source="email" type="email" />
  <TextInput source="address" multiline /><TextInput source="city" /><TextInput source="province" />
  <TextInput source="identity_no" /><SelectInput source="status" choices={customerStatusChoices} defaultValue="active" />
  <TextInput source="odp_code" label="ODP Code" helperText="Fiber distribution splitter enclosure" />
  <NumberInput source="odp_port" label="ODP Drop Port Number" min={1} max={64} defaultValue={1} />
  <NumberInput source="latitude" label="GPS Latitude" step={0.000001} />
  <NumberInput source="longitude" label="GPS Longitude" step={0.000001} />
  <TextInput source="notes" multiline />
</SimpleForm>;
export const CustomerCreate = () => <Create title="Create customer"><CustomerForm /></Create>;
export const CustomerEdit = () => <Edit title="Edit customer"><CustomerForm /></Edit>;

const CustomerShowActions = () => {
  const record = useRecordContext();
  if (!record) return null;
  return (
    <TopToolbar>
      <EditButton />
      <Button
        component={RouterLink}
        to={`/isp/subscriptions/create?source=${encodeURIComponent(JSON.stringify({ customer_id: record.id }))}`}
        variant="contained"
        size="small"
        startIcon={<AddIcon />}
        sx={{ ml: 1 }}
      >
        Add Subscription
      </Button>
      <Button
        component="a"
        href={`/portal?q=${encodeURIComponent(record.customer_no)}`}
        target="_blank"
        rel="noopener noreferrer"
        variant="outlined"
        size="small"
        sx={{ ml: 1 }}
      >
        View Public Portal
      </Button>
    </TopToolbar>
  );
};

export const CustomerShow = () => (
  <Show title="Customer details" actions={<CustomerShowActions />}>
    <SimpleShowLayout>
      <Box sx={{ width: '100%', mb: 1 }}>
        <Panel title="CUSTOMER IDENTITY & CONTACT" subtitle="Personal credentials, address, and billing summary">
          <Grid container spacing={2} sx={{ p: 1 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="caption" color="text.secondary">CUSTOMER ID</Typography>
              <Box><FunctionField source="customer_no" render={(r: any) => <Mono sx={{ fontWeight: 800, fontSize: '0.95rem' }}>{r.customer_no}</Mono>} /></Box>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="caption" color="text.secondary">NAME</Typography>
              <Typography variant="body1" fontWeight={700}><TextField source="name" /></Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="caption" color="text.secondary">STATUS</Typography>
              <Box sx={{ mt: 0.5 }}><StatusField /></Box>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="caption" color="text.secondary">OUTSTANDING BALANCE</Typography>
              <Box sx={{ color: 'error.main', fontWeight: 800 }}><MoneyField source="outstanding" /></Box>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="caption" color="text.secondary">PHONE / WHATSAPP</Typography>
              <Typography variant="body2"><TextField source="phone" /></Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="caption" color="text.secondary">EMAIL</Typography>
              <Typography variant="body2"><TextField source="email" /></Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="caption" color="text.secondary">IDENTITY / KTP</Typography>
              <Typography variant="body2"><TextField source="identity_no" /></Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="caption" color="text.secondary">REGISTRATION DATE</Typography>
              <Typography variant="body2"><DateField source="created_at" showTime /></Typography>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="caption" color="text.secondary">INSTALLATION ADDRESS</Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}><TextField source="address" /></Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="caption" color="text.secondary">FTTH ODP SPLITTER</Typography>
              <Box><FunctionField source="odp_code" render={(r: any) => <Mono sx={{ fontWeight: 800 }}>{r.odp_code ? `${r.odp_code} (Port ${r.odp_port || 1})` : 'Unassigned'}</Mono>} /></Box>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="caption" color="text.secondary">GPS COORDINATES</Typography>
              <Box><FunctionField source="latitude" render={(r: any) => r.latitude && r.longitude ? <Button size="small" variant="text" href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" sx={{ p: 0, textTransform: 'none', fontWeight: 700 }}>{r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}</Button> : <Typography variant="caption" color="text.disabled">No GPS</Typography>} /></Box>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="caption" color="text.secondary">OPERATOR NOTES</Typography>
              <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}><TextField source="notes" /></Typography>
            </Grid>
          </Grid>
        </Panel>
      </Box>

      <Box sx={{ width: '100%', mb: 1 }}>
        <Panel title="ACTIVE SUBSCRIPTIONS" subtitle="Subscribed internet packages and live connection state">
          <ArrayField source="subscriptions">
            <Datagrid bulkActionButtons={false} rowClick={(id) => `/isp/subscriptions/${id}/show`}>
              <FunctionField source="subscription_no" render={(r: any) => <Mono>{r.subscription_no}</Mono>} />
              <TextField source="package_name" />
              <MoneyField source="package_price" />
              <FunctionField source="radius_username" render={(r: any) => <Mono>{r.radius_username || '-'}</Mono>} />
              <StatusField /> <OnlineField />
              <FunctionField source="current_ip" render={(r: any) => <Mono>{r.current_ip || '-'}</Mono>} />
              <FunctionField label="Bandwidth Usage" render={(r: any) => formatBytes(r?.total_traffic_bytes)} />
            </Datagrid>
          </ArrayField>
        </Panel>
      </Box>

      <Box sx={{ width: '100%', mb: 1 }}>
        <Panel title="RECENT INVOICES" subtitle="Billing statements and invoice payment balances">
          <ArrayField source="invoices">
            <Datagrid bulkActionButtons={false} rowClick={(id) => `/isp/invoices/${id}/show`}>
              <FunctionField source="invoice_no" render={(r: any) => <Mono>{r.invoice_no}</Mono>} />
              <DateField source="invoice_date" />
              <DateField source="due_date" />
              <MoneyField source="total" />
              <MoneyField source="paid_amount" />
              <MoneyField source="balance" />
              <StatusField />
            </Datagrid>
          </ArrayField>
        </Panel>
      </Box>

      <Box sx={{ width: '100%', mb: 1 }}>
        <Panel title="PAYMENT HISTORY" subtitle="Audit trail of receipts and recorded transactions">
          <ArrayField source="payments">
            <Datagrid bulkActionButtons={false} rowClick={(id) => `/isp/payments/${id}/show`}>
              <FunctionField source="payment_no" render={(r: any) => <Mono>{r.payment_no}</Mono>} />
              <MoneyField source="amount" />
              <TextField source="method" />
              <DateField source="paid_at" showTime />
            </Datagrid>
          </ArrayField>
        </Panel>
      </Box>
    </SimpleShowLayout>
  </Show>
);

const PackageListHeader = () => {
  const { total, data, isLoading } = useListContext<any>();
  const recordList: any[] = data || [];
  const activeCount = recordList.filter((r: any) => r.status === 'active').length;
  const fupCount = recordList.filter((r: any) => (r.fup_limit_gb || 0) > 0).length;
  const monthlyCount = recordList.filter((r: any) => r.billing_cycle === 'monthly').length;

  return (
    <Box sx={{ mb: 2 }}>
      <PageHeader
        section="PRODUCT CATALOG"
        title="Internet Packages & Plans"
        subtitle="Manage bandwidth plans, billing periods, RADIUS rate-limit profiles, and FUP quotas."
      />
      <KpiStrip>
        <KpiTile
          label="TOTAL PACKAGES"
          value={isLoading ? '...' : (total ?? recordList.length ?? 0)}
          hint="Catalog items"
          tone="primary"
        />
        <KpiTile
          label="ACTIVE PLANS"
          value={isLoading ? '...' : activeCount}
          hint="Published on website"
          tone="success"
        />
        <KpiTile
          label="FUP QUOTA POLICED"
          value={isLoading ? '...' : fupCount}
          hint="Fair usage policy"
          tone="warning"
        />
        <KpiTile
          label="MONTHLY BILLING"
          value={isLoading ? '...' : monthlyCount}
          hint="Standard recurring cycle"
          tone="info"
        />
      </KpiStrip>
    </Box>
  );
};

const packageFilters = [<SelectInput source="status" choices={[{ id: 'active', name: 'Active' }, { id: 'inactive', name: 'Inactive' }]} alwaysOn key="status" />];
export const PackageList = () => (
  <List actions={listActions} filters={packageFilters} perPage={25} title="Internet packages">
    <PackageListHeader />
    <Datagrid
      rowClick="edit"
      sx={{
        border: '1.5px solid #000',
        boxShadow: '3px 3px 0px #000',
        borderRadius: 0,
        '& .RaDatagrid-headerCell': {
          fontWeight: 800,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.75rem',
          bgcolor: 'action.hover',
        },
      }}
    >
      <FunctionField source="code" render={(r: any) => <Mono>{r.code}</Mono>} />
      <TextField source="name" sx={{ fontWeight: 600 }} />
      <MoneyField source="price" />
      <ReferenceField source="radius_profile_id" reference="radius/profiles" link={false}><TextField source="name" /></ReferenceField>
      <TextField source="billing_cycle" />
      <NumberField source="fup_limit_gb" label="FUP (GB)" />
      <StatusField />
    </Datagrid>
  </List>
);
const PackageForm = () => <SimpleForm>
  <TextInput source="name" isRequired />
  <NumberInput source="price" min={0} isRequired />
  <ReferenceInput source="radius_profile_id" reference="radius/profiles"><SelectInput optionText="name" isRequired /></ReferenceInput>
  <TextInput source="description" multiline />
  <SelectInput source="billing_cycle" choices={[{ id: 'monthly', name: 'Monthly' }]} defaultValue="monthly" />
  <NumberInput source="fup_limit_gb" label="FUP Quota Limit (GB, 0 = unlimited)" min={0} defaultValue={0} />
  <NumberInput source="fup_rate_down" label="FUP Down Rate (Kbps, 0 = disabled)" min={0} defaultValue={0} />
  <NumberInput source="fup_rate_up" label="FUP Up Rate (Kbps, 0 = disabled)" min={0} defaultValue={0} />
  <SelectInput source="status" choices={[{ id: 'active', name: 'Active' }, { id: 'inactive', name: 'Inactive' }]} defaultValue="active" />
</SimpleForm>;
export const PackageCreate = () => <Create title="Create internet package"><PackageForm /></Create>;
export const PackageEdit = () => <Edit title="Edit internet package"><PackageForm /></Edit>;

const SubscriptionActions = () => {
  const record = useRecordContext();
  const notify = useNotify();
  const refresh = useRefresh();
  if (!record) return null;
  const actions = record.status === 'pending' ? ['activate', 'terminate']
    : record.status === 'active' ? ['suspend', 'terminate', ...(record.online ? ['disconnect'] : [])]
      : record.status === 'suspended' ? ['reactivate', 'terminate', ...(record.online ? ['disconnect'] : [])] : [];
  const doAction = async (action: string) => {
    if ((action === 'suspend' || action === 'terminate') && !window.confirm(`Confirm ${action} for this subscription?`)) return;
    try { await apiRequest(`/isp/subscriptions/${record.id}/${action}`, { method: 'POST' }); notify(`Subscription ${action} successful`, { type: 'success' }); refresh(); }
    catch (error) { notify(error instanceof Error ? error.message : 'Action failed', { type: 'error' }); }
  };
  return <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ my: 1 }}>
    {actions.map(action => <Button key={action} size="small" color={action === 'terminate' ? 'error' : 'primary'} variant={action === 'activate' || action === 'reactivate' ? 'contained' : 'outlined'} onClick={() => void doAction(action)}>{action.replace(/_/g, ' ')}</Button>)}
    {record.status === 'active' && (
      record.fup_triggered ? (
        <Button
          size="small"
          color="success"
          variant="contained"
          onClick={async () => {
            try {
              await apiRequest(`/isp/subscriptions/${record.id}/reset-fup`, { method: 'POST' });
              notify('FUP quota reset successfully! Full speed restored via CoA.', { type: 'success' });
              refresh();
            } catch (err: any) {
              notify(err instanceof Error ? err.message : 'Failed to reset FUP', { type: 'error' });
            }
          }}
        >
          Reset FUP (Restore Speed)
        </Button>
      ) : (
        <Button
          size="small"
          color="warning"
          variant="outlined"
          onClick={async () => {
            try {
              await apiRequest(`/isp/subscriptions/${record.id}/apply-fup`, { method: 'POST' });
              notify('FUP throttle enforced via RFC 5176 CoA!', { type: 'warning' });
              refresh();
            } catch (err: any) {
              notify(err instanceof Error ? err.message : 'Failed to apply FUP', { type: 'error' });
            }
          }}
        >
          Enforce FUP Throttle
        </Button>
      )
    )}
    <Button
      component={RouterLink}
      to={`/isp/invoices?filter=${encodeURIComponent(JSON.stringify({ customer_id: record.customer_id }))}`}
      size="small"
      variant="outlined"
      startIcon={<ReceiptIcon />}
    >
      Invoices
    </Button>
  </Stack>;
};

const SubscriptionListHeader = () => {
  const { total, data, isLoading } = useListContext<any>();
  const recordList: any[] = data || [];
  const activeCount = recordList.filter((r: any) => r.status === 'active').length;
  const pendingCount = recordList.filter((r: any) => r.status === 'pending').length;
  const suspendedCount = recordList.filter((r: any) => r.status === 'suspended').length;

  return (
    <Box sx={{ mb: 2 }}>
      <PageHeader
        section="PROVISIONING & SUBSCRIPTIONS"
        title="Subscriber Subscriptions"
        subtitle="Active PPPoE/IPoE connections, billing cycle dates, and CoA status actions."
      />
      <KpiStrip>
        <KpiTile
          label="TOTAL SUBSCRIPTIONS"
          value={isLoading ? '...' : (total ?? recordList.length ?? 0)}
          hint="Subscribed services"
          tone="primary"
        />
        <KpiTile
          label="ACTIVE"
          value={isLoading ? '...' : activeCount}
          hint="Online / authorized"
          tone="success"
        />
        <KpiTile
          label="PENDING"
          value={isLoading ? '...' : pendingCount}
          hint="Awaiting activation"
          tone="warning"
        />
        <KpiTile
          label="SUSPENDED"
          value={isLoading ? '...' : suspendedCount}
          hint="Isolated / overdue"
          tone={suspendedCount > 0 ? "error" : "info"}
        />
      </KpiStrip>
    </Box>
  );
};

const subscriptionFilters = [
  <SelectInput source="status" choices={[{ id: 'pending', name: 'Pending' }, { id: 'active', name: 'Active' }, { id: 'suspended', name: 'Suspended' }, { id: 'terminated', name: 'Terminated' }]} key="status" />,
  <ReferenceInput source="customer_id" reference="isp/customers" key="customer_id"><SelectInput optionText="name" /></ReferenceInput>,
];
export const SubscriptionList = () => (
  <List actions={listActions} filters={subscriptionFilters} perPage={25} title="Subscriptions">
    <SubscriptionListHeader />
    <Datagrid
      rowClick="show"
      sx={{
        border: '1.5px solid #000',
        boxShadow: '3px 3px 0px #000',
        borderRadius: 0,
        '& .RaDatagrid-headerCell': {
          fontWeight: 800,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.75rem',
          bgcolor: 'action.hover',
        },
      }}
    >
      <FunctionField source="subscription_no" render={(r: any) => <Mono>{r.subscription_no}</Mono>} />
      <TextField source="customer_name" sx={{ fontWeight: 600 }} />
      <TextField source="package_name" />
      <MoneyField source="package_price" />
      <FunctionField source="radius_username" render={(r: any) => <Mono>{r.radius_username || '-'}</Mono>} />
      <StatusField />
      <NumberField source="billing_day" />
      <NumberField source="grace_days" />
    </Datagrid>
  </List>
);
export const SubscriptionCreate = () => <Create title="Create subscription"><SimpleForm>
  <ReferenceInput source="customer_id" reference="isp/customers"><SelectInput optionText="name" isRequired /></ReferenceInput>
  <ReferenceInput source="package_id" reference="isp/packages"><SelectInput optionText="name" isRequired /></ReferenceInput>
  <ReferenceInput source="radius_user_id" reference="radius/users"><SelectInput optionText="username" helperText="Choose an existing RADIUS user, or leave blank to create one below." /></ReferenceInput>
  <TextInput source="username" helperText="Provide a username and password to create a new RADIUS account." />
  <TextInput source="password" type="password" />
  <NumberInput source="billing_day" min={1} max={28} defaultValue={1} isRequired />
  <NumberInput source="grace_days" min={0} max={60} defaultValue={3} isRequired />
  <SelectInput source="status" choices={[{ id: 'pending', name: 'Pending' }, { id: 'active', name: 'Active' }]} defaultValue="pending" />
</SimpleForm></Create>;
export const SubscriptionShow = () => <Show title="Subscription details"><SimpleShowLayout>
  <TextField source="subscription_no" /><TextField source="customer_name" /><ReferenceField source="customer_id" reference="isp/customers" link="show"><TextField source="customer_no" /></ReferenceField>
  <TextField source="package_name" /><MoneyField source="package_price" /><TextField source="radius_username" />
  <TextField source="radius_user_id" /><StatusField /><TextField source="suspension_reason" />
  <OnlineField /><TextField source="current_ip" /><MoneyField source="outstanding" />
  <FunctionField label="Bandwidth Traffic" render={(r: any) => `${formatBytes(r?.total_download_bytes)} Download / ${formatBytes(r?.total_upload_bytes)} Upload (Total: ${formatBytes(r?.total_traffic_bytes)})`} />
  <FunctionField label="FUP Quota Policy" render={(r: any) => {
    if (!r?.fup_limit_gb || r.fup_limit_gb <= 0) return 'Unlimited (No FUP)';
    const statusText = r.fup_triggered ? 'THROTTLED (Over Quota)' : 'Normal';
    const rateText = r.fup_triggered && r.fup_rate_down > 0 ? ` (Capped at ${r.fup_rate_down} Kbps)` : '';
    return `${statusText} — ${formatBytes(r?.total_traffic_bytes)} / ${r.fup_limit_gb} GB${rateText}`;
  }} />
  <DateField source="start_date" /><NumberField source="billing_day" /><NumberField source="grace_days" />
  <SubscriptionActions />
  <SubscriptionTelemetryCard />
</SimpleShowLayout></Show>;

const SubscriptionTelemetryCard = () => {
  const record = useRecordContext();
  if (!record || !record.id) return null;
  return (
    <Box sx={{ mt: 2, mb: 1, width: '100%' }}>
      <MrtgTrafficGraph
        endpoint={`/isp/subscriptions/${record.id}/traffic`}
        title={`PPPoE Subscriber Live MRTG Bandwidth (${record.radius_username || record.subscription_no})`}
      />
    </Box>
  );
};


const InvoiceListHeader = () => {
  const { total, data, isLoading } = useListContext<any>();
  const recordList: any[] = data || [];
  const paidCount = recordList.filter((r: any) => r.status === 'paid').length;
  const overdueCount = recordList.filter((r: any) => r.status === 'overdue').length;
  const totalDue = recordList.reduce((acc: number, r: any) => acc + (Number(r.balance) || 0), 0);

  return (
    <Box sx={{ mb: 2 }}>
      <PageHeader
        section="BILLING & INVOICING"
        title="Customer Invoices"
        subtitle="Manage recurring bills, track balances, record payments, and dispatch WhatsApp invoices."
      />
      <KpiStrip>
        <KpiTile
          label="TOTAL INVOICES"
          value={isLoading ? '...' : (total ?? recordList.length ?? 0)}
          hint="Issued statements"
          tone="primary"
        />
        <KpiTile
          label="PAID INVOICES"
          value={isLoading ? '...' : paidCount}
          hint="Settled accounts"
          tone="success"
        />
        <KpiTile
          label="OVERDUE"
          value={isLoading ? '...' : overdueCount}
          hint="Action required"
          tone={overdueCount > 0 ? "error" : "success"}
        />
        <KpiTile
          label="UNCOLLECTED BALANCE"
          value={isLoading ? '...' : formatIDR(totalDue)}
          hint="Receivables balance"
          tone={totalDue > 0 ? "warning" : "success"}
        />
      </KpiStrip>
    </Box>
  );
};

const invoiceFilters = [
  <TextInput source="invoice_no" alwaysOn key="invoice_no" />,
  <ReferenceInput source="customer_id" reference="isp/customers" key="customer_id"><SelectInput optionText="name" /></ReferenceInput>,
  <SelectInput source="status" choices={billingStatusChoices} key="status" />,
];
export const InvoiceList = () => (
  <List filters={invoiceFilters} perPage={25} title="Invoices">
    <InvoiceListHeader />
    <Datagrid
      rowClick="show"
      sx={{
        border: '1.5px solid #000',
        boxShadow: '3px 3px 0px #000',
        borderRadius: 0,
        '& .RaDatagrid-headerCell': {
          fontWeight: 800,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.75rem',
          bgcolor: 'action.hover',
        },
      }}
    >
      <FunctionField source="invoice_no" render={(r: any) => <Mono>{r.invoice_no}</Mono>} />
      <TextField source="customer_name" sx={{ fontWeight: 600 }} />
      <FunctionField source="subscription_no" render={(r: any) => <Mono>{r.subscription_no || '-'}</Mono>} />
      <TextField source="package_name" />
      <DateField source="invoice_date" />
      <DateField source="due_date" />
      <MoneyField source="total" />
      <MoneyField source="paid_amount" />
      <MoneyField source="balance" />
      <StatusField />
    </Datagrid>
  </List>
);

const InvoicePaymentDialog = ({
  open,
  onClose,
  invoice,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  invoice: any;
  onSuccess: () => void;
}) => {
  const notify = useNotify();
  const [amount, setAmount] = useState<number>(invoice?.balance ?? 0);
  const [method, setMethod] = useState<string>('bank_transfer');
  const [reference, setReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (invoice) {
      setAmount(invoice.balance ?? 0);
    }
  }, [invoice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) {
      notify('Payment amount must be greater than zero', { type: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest('/isp/payments', {
        method: 'POST',
        body: JSON.stringify({
          invoice_id: invoice.id,
          amount: Number(amount),
          method,
          reference: reference.trim(),
          notes: notes.trim(),
        }),
      });
      notify('Payment recorded successfully', { type: 'success' });
      onClose();
      onSuccess();
    } catch (err: any) {
      notify(err instanceof Error ? err.message : 'Failed to record payment', { type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!invoice) return null;

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="xs" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Record Payment</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary" display="block">Invoice</Typography>
              <Typography variant="body2" fontWeight={600}>{invoice.invoice_no}</Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>Balance Due</Typography>
              <Typography variant="h6" color="error.main" fontWeight={700}>
                {formatIDR(invoice.balance)}
              </Typography>
            </Box>

            <MuiTextField
              label="Payment Amount (IDR)"
              type="number"
              required
              fullWidth
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              inputProps={{ min: 1, max: invoice.balance }}
              helperText="Pre-filled with remaining invoice balance"
            />

            <MuiTextField
              select
              label="Payment Method"
              required
              fullWidth
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
              <MenuItem value="cash">Cash</MenuItem>
              <MenuItem value="manual">Manual / POS</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </MuiTextField>

            <MuiTextField
              label="Reference / Receipt #"
              fullWidth
              placeholder="e.g. BCA Ref, Receipt code"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />

            <MuiTextField
              label="Notes"
              multiline
              rows={2}
              fullWidth
              placeholder="Operator notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={submitting} color="inherit">Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={submitting}
            startIcon={<PaymentIcon />}
          >
            {submitting ? 'Recording...' : 'Confirm Payment'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

const InvoiceDetailView = () => {
  const record = useRecordContext();
  const notify = useNotify();
  const refresh = useRefresh();
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [sendingWa, setSendingWa] = useState(false);

  if (!record) return null;

  const canPay = (record.balance ?? 0) > 0 && record.status !== 'void';

  const handleServerSendWhatsApp = async () => {
    setSendingWa(true);
    try {
      await apiRequest(`/isp/invoices/${record.id}/send-whatsapp`, { method: 'POST' });
      notify('WhatsApp invoice notification sent via server', { type: 'success' });
    } catch (err: any) {
      notify(err instanceof Error ? err.message : 'Failed to send WhatsApp notification', { type: 'error' });
    } finally {
      setSendingWa(false);
    }
  };

  return (
    <Box sx={{ width: '100%', maxWidth: 900, mx: 'auto', my: 2 }}>
      {/* Action Header (Hidden when printing) */}
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        justifyContent="space-between"
        className="no-print"
        sx={{ mb: 2 }}
      >
        <Button
          component={RouterLink}
          to="/isp/invoices"
          variant="outlined"
          size="small"
          color="inherit"
        >
          Back to Invoices
        </Button>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Button
            variant="contained"
            size="small"
            color="success"
            startIcon={<WhatsAppIcon />}
            disabled={sendingWa}
            onClick={handleServerSendWhatsApp}
          >
            {sendingWa ? 'Sending...' : 'Direct Send WA'}
          </Button>
          <Button
            variant="outlined"
            size="small"
            color="success"
            startIcon={<WhatsAppIcon />}
            component="a"
            href={generateWhatsAppInvoiceLink(record)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open wa.me
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<PrintIcon />}
            onClick={() => window.print()}
          >
            Print Invoice
          </Button>
          {canPay && (
            <Button
              variant="contained"
              size="small"
              color="primary"
              startIcon={<PaymentIcon />}
              onClick={() => setPaymentDialogOpen(true)}
            >
              Record Payment
            </Button>
          )}
        </Stack>
      </Stack>

      {/* Styled Printable Invoice Document */}
      <Paper
        id="printable-invoice"
        elevation={2}
        sx={{
          p: { xs: 2.5, sm: 4 },
          bgcolor: 'background.paper',
          borderRadius: 2,
          '@media print': {
            boxShadow: 'none',
            p: 0,
            m: 0,
            width: '100%',
          },
        }}
      >
        {/* Company & Invoice Top Header */}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          spacing={2}
          sx={{ pb: 3, borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Box>
            <Typography variant="h5" fontWeight={800} color="primary.main">
              {record.company_name || 'MWX-ISP Internet Services'}
            </Typography>
            {record.company_address && (
              <Typography variant="body2" color="text.secondary">
                {record.company_address}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              {[record.company_phone, record.company_email].filter(Boolean).join(' | ')}
            </Typography>
          </Box>
          <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
            <Typography variant="h4" fontWeight={900} letterSpacing={1}>
              INVOICE
            </Typography>
            <Typography variant="subtitle1" fontWeight={700} color="text.secondary">
              {record.invoice_no}
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              <StatusField />
            </Box>
          </Box>
        </Stack>

        {/* Bill To & Details */}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          spacing={3}
          sx={{ py: 3 }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" textTransform="uppercase" color="text.secondary" fontWeight={700}>
              Billed To
            </Typography>
            <Typography variant="h6" fontWeight={700} sx={{ mt: 0.5 }}>
              <RouterLink
                to={`/isp/customers/${record.customer_id}/show`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                {record.customer_no || `Customer #${record.customer_id}`}
              </RouterLink>
            </Typography>
            {record.customer_name && (
              <Typography variant="body2" color="text.secondary">
                {record.customer_name}
              </Typography>
            )}
            {record.subscription_no && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Subscription:{' '}
                <RouterLink
                  to={`/isp/subscriptions/${record.subscription_id}/show`}
                  style={{ textDecoration: 'none', color: 'inherit', fontWeight: 600 }}
                >
                  {record.subscription_no}
                </RouterLink>
              </Typography>
            )}
          </Box>
          <Box sx={{ minWidth: 220, textAlign: { xs: 'left', sm: 'right' } }}>
            <Typography variant="caption" textTransform="uppercase" color="text.secondary" fontWeight={700}>
              Invoice Details
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 0.5 }}>
              <Typography variant="body2">
                <strong>Invoice Date:</strong> {record.invoice_date ? new Date(record.invoice_date).toLocaleDateString() : '-'}
              </Typography>
              <Typography variant="body2">
                <strong>Due Date:</strong> {record.due_date ? new Date(record.due_date).toLocaleDateString() : '-'}
              </Typography>
              {record.period_start && (
                <Typography variant="caption" color="text.secondary">
                  Period: {new Date(record.period_start).toLocaleDateString()} - {record.period_end ? new Date(record.period_end).toLocaleDateString() : ''}
                </Typography>
              )}
            </Stack>
          </Box>
        </Stack>

        {/* Line Items Table */}
        <TableContainer sx={{ my: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>Qty</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Unit Price</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {record.items && record.items.length > 0 ? (
                record.items.map((item: any, idx: number) => (
                  <TableRow key={item.id || idx}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell align="center">{item.quantity}</TableCell>
                    <TableCell align="right">{formatIDR(item.unit_price)}</TableCell>
                    <TableCell align="right">{formatIDR(item.total)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 2, color: 'text.secondary' }}>
                    No items in this invoice
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Financial Summary */}
        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
          <Box sx={{ width: { xs: '100%', sm: 300 } }}>
            <Stack spacing={1} sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Total Amount:</Typography>
                <Typography variant="body2" fontWeight={600}>{formatIDR(record.total)}</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Paid Amount:</Typography>
                <Typography variant="body2" fontWeight={600} color="success.main">{formatIDR(record.paid_amount)}</Typography>
              </Stack>
              <Divider />
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="subtitle2" fontWeight={700}>Balance Due:</Typography>
                <Typography
                  variant="subtitle1"
                  fontWeight={800}
                  color={(record.balance ?? 0) > 0 ? 'error.main' : 'success.main'}
                >
                  {formatIDR(record.balance)}
                </Typography>
              </Stack>
            </Stack>
          </Box>
        </Stack>

        {/* Payments History (if any) */}
        {record.payments && record.payments.length > 0 && (
          <Box sx={{ mt: 4 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
              Recorded Payments
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell sx={{ fontWeight: 700 }}>Payment #</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Method</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Reference</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {record.payments.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <RouterLink
                          to={`/isp/payments/${p.id}/show`}
                          style={{ textDecoration: 'none', color: 'inherit', fontWeight: 600 }}
                        >
                          {p.payment_no}
                        </RouterLink>
                      </TableCell>
                      <TableCell>{p.paid_at ? new Date(p.paid_at).toLocaleString() : '-'}</TableCell>
                      <TableCell sx={{ textTransform: 'capitalize' }}>{(p.method || '').replace(/_/g, ' ')}</TableCell>
                      <TableCell>{p.reference || '-'}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, color: 'success.main' }}>
                        {formatIDR(p.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Footer Note */}
        <Box sx={{ mt: 5, pt: 2, borderTop: '1px dashed', borderColor: 'divider', textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            Thank you for choosing our ISP services. For inquiries or payment confirmation, please contact support.
          </Typography>
        </Box>
      </Paper>

      {/* Payment Dialog */}
      <InvoicePaymentDialog
        open={paymentDialogOpen}
        onClose={() => setPaymentDialogOpen(false)}
        invoice={record}
        onSuccess={() => refresh()}
      />

      {/* Global Print Styling */}
      <style>{`
        @media print {
          body {
            background-color: #fff !important;
            color: #000 !important;
          }
          header.MuiAppBar-root,
          .MuiDrawer-root,
          .no-print,
          .RaTopToolbar-root,
          button {
            display: none !important;
          }
          #printable-invoice {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }
          .MuiPaper-root {
            background-color: transparent !important;
          }
        }
      `}</style>
    </Box>
  );
};

export const InvoiceShow = () => (
  <Show title="Invoice details" actions={false}>
    <InvoiceDetailView />
  </Show>
);

const PaymentListHeader = () => {
  const { total, data, isLoading } = useListContext<any>();
  const recordList: any[] = data || [];
  const totalAmount = recordList.reduce((acc: number, r: any) => acc + (Number(r.amount) || 0), 0);
  const transferCount = recordList.filter((r: any) => r.method === 'bank_transfer').length;
  const cashCount = recordList.filter((r: any) => r.method === 'cash').length;

  return (
    <Box sx={{ mb: 2 }}>
      <PageHeader
        section="TREASURY & PAYMENTS"
        title="Payment Receipts"
        subtitle="Real-time audit log of recorded payments, bank transfers, manual POS, and WhatsApp receipts."
      />
      <KpiStrip>
        <KpiTile
          label="TRANSACTIONS"
          value={isLoading ? '...' : (total ?? recordList.length ?? 0)}
          hint="Recorded receipts"
          tone="primary"
        />
        <KpiTile
          label="TOTAL COLLECTED"
          value={isLoading ? '...' : formatIDR(totalAmount)}
          hint="Revenue received"
          tone="success"
        />
        <KpiTile
          label="BANK TRANSFERS"
          value={isLoading ? '...' : transferCount}
          hint="Direct bank clearance"
          tone="info"
        />
        <KpiTile
          label="CASH / MANUAL"
          value={isLoading ? '...' : cashCount}
          hint="POS and teller receipts"
          tone="secondary"
        />
      </KpiStrip>
    </Box>
  );
};

const paymentFilters = [
  <ReferenceInput source="customer_id" reference="isp/customers" key="customer_id"><SelectInput optionText="name" /></ReferenceInput>,
  <ReferenceInput source="invoice_id" reference="isp/invoices" key="invoice_id"><SelectInput optionText="invoice_no" /></ReferenceInput>,
];
export const PaymentList = () => (
  <List actions={listActions} filters={paymentFilters} perPage={25} title="Payments">
    <PaymentListHeader />
    <Datagrid
      rowClick="show"
      sx={{
        border: '1.5px solid #000',
        boxShadow: '3px 3px 0px #000',
        borderRadius: 0,
        '& .RaDatagrid-headerCell': {
          fontWeight: 800,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.75rem',
          bgcolor: 'action.hover',
        },
      }}
    >
      <FunctionField source="payment_no" render={(r: any) => <Mono>{r.payment_no}</Mono>} />
      <ReferenceField source="customer_id" reference="isp/customers" link="show"><TextField source="name" sx={{ fontWeight: 600 }} /></ReferenceField>
      <ReferenceField source="invoice_id" reference="isp/invoices" link="show"><TextField source="invoice_no" /></ReferenceField>
      <MoneyField source="amount" />
      <TextField source="method" />
      <DateField source="paid_at" showTime />
    </Datagrid>
  </List>
);
export const PaymentCreate = () => <Create title="Record payment"><SimpleForm>
  <ReferenceInput source="invoice_id" reference="isp/invoices"><SelectInput optionText="invoice_no" isRequired /></ReferenceInput>
  <NumberInput source="amount" min={1} isRequired />
  <SelectInput source="method" choices={[{ id: 'cash', name: 'Cash' }, { id: 'bank_transfer', name: 'Bank transfer' }, { id: 'manual', name: 'Manual' }, { id: 'other', name: 'Other' }]} isRequired />
  <TextInput source="reference" /><TextInput source="notes" multiline />
</SimpleForm></Create>;
const PaymentShowActions = () => {
  const record = useRecordContext();
  const notify = useNotify();
  const [sendingWa, setSendingWa] = useState(false);
  if (!record) return null;

  const handleServerSendWhatsApp = async () => {
    setSendingWa(true);
    try {
      await apiRequest(`/isp/payments/${record.id}/send-whatsapp`, { method: 'POST' });
      notify('WhatsApp receipt notification sent via server', { type: 'success' });
    } catch (err: any) {
      notify(err instanceof Error ? err.message : 'Failed to send WhatsApp receipt', { type: 'error' });
    } finally {
      setSendingWa(false);
    }
  };

  return (
    <TopToolbar>
      <Button
        variant="contained"
        size="small"
        color="success"
        startIcon={<WhatsAppIcon />}
        disabled={sendingWa}
        onClick={handleServerSendWhatsApp}
        sx={{ mr: 1 }}
      >
        {sendingWa ? 'Sending...' : 'Direct Send WA'}
      </Button>
      <Button
        variant="outlined"
        size="small"
        color="success"
        startIcon={<WhatsAppIcon />}
        component="a"
        href={generateWhatsAppReceiptLink(record)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open wa.me
      </Button>
    </TopToolbar>
  );
};

export const PaymentShow = () => <Show title="Payment details" actions={<PaymentShowActions />}><SimpleShowLayout>
  <TextField source="payment_no" />
  <ReferenceField source="customer_id" reference="isp/customers" link="show"><TextField source="customer_no" /></ReferenceField>
  <ReferenceField source="invoice_id" reference="isp/invoices" link="show"><TextField source="invoice_no" /></ReferenceField>
  <MoneyField source="amount" /><TextField source="method" /><TextField source="reference" />
  <DateField source="paid_at" showTime /><StatusField /><TextField source="notes" />
</SimpleShowLayout></Show>;
