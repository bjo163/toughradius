import {
  ArrayField, Create, Datagrid, DateField, Edit, FunctionField, List, NumberField,
  NumberInput, ReferenceField, ReferenceInput, SearchInput, SelectInput, Show, SimpleForm,
  SimpleShowLayout, TextField, TextInput, TopToolbar, CreateButton, useNotify,
  useRefresh, useRecordContext,
} from 'react-admin';
import { Button, Chip, Stack } from '@mui/material';
import { apiRequest } from '../utils/apiClient';

const listActions = <TopToolbar><CreateButton /></TopToolbar>;
const idrOptions: Intl.NumberFormatOptions = { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 };
const customerStatusChoices = [
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
    const color = ['active', 'enabled', 'paid', 'received'].includes(value) ? 'success'
      : ['pending', 'issued', 'partial'].includes(value) ? 'warning'
        : ['suspended', 'overdue', 'disabled', 'terminated', 'void'].includes(value) ? 'error' : 'default';
    return <Chip size="small" variant="outlined" color={color} label={value.replace(/_/g, ' ')} sx={{ textTransform: 'capitalize', fontWeight: 700 }} />;
  }} />
);

const OnlineField = () => <FunctionField source="online" render={(record) => (
  <Chip size="small" color={record?.online ? 'success' : 'default'} label={record?.online ? 'Online' : 'Offline'} />
)} />;

const customerFilters = [<SearchInput source="q" alwaysOn key="q" />, <SelectInput source="status" choices={customerStatusChoices} key="status" />];
export const CustomerList = () => <List actions={listActions} filters={customerFilters} perPage={25} title="Customers">
  <Datagrid rowClick="show">
    <TextField source="customer_no" /><TextField source="name" /><TextField source="phone" />
    <TextField source="email" /><TextField source="city" /><TextField source="package_name" />
    <TextField source="radius_username" /><StatusField /> <MoneyField source="outstanding" />
  </Datagrid>
</List>;

const CustomerForm = () => <SimpleForm>
  <TextInput source="name" isRequired /><TextInput source="phone" /><TextInput source="email" type="email" />
  <TextInput source="address" multiline /><TextInput source="city" /><TextInput source="province" />
  <TextInput source="identity_no" /><SelectInput source="status" choices={[
    { id: 'active', name: 'Active' }, { id: 'inactive', name: 'Inactive' },
    { id: 'suspended', name: 'Suspended' }, { id: 'terminated', name: 'Terminated' },
  ]} defaultValue="active" /><TextInput source="notes" multiline />
</SimpleForm>;
export const CustomerCreate = () => <Create title="Create customer"><CustomerForm /></Create>;
export const CustomerEdit = () => <Edit title="Edit customer"><CustomerForm /></Edit>;
export const CustomerShow = () => <Show title="Customer details"><SimpleShowLayout>
  <TextField source="customer_no" /><TextField source="name" /><StatusField />
  <TextField source="phone" /><TextField source="email" /><TextField source="address" />
  <TextField source="city" /><TextField source="province" /><TextField source="identity_no" />
  <MoneyField source="outstanding" /><TextField source="notes" /><DateField source="created_at" showTime />
  <ArrayField source="subscriptions"><Datagrid bulkActionButtons={false} rowClick={false}>
    <TextField source="subscription_no" /><TextField source="package_name" /><MoneyField source="package_price" />
    <TextField source="radius_username" /><StatusField /> <OnlineField /><TextField source="current_ip" />
  </Datagrid></ArrayField>
  <ArrayField source="invoices"><Datagrid bulkActionButtons={false} rowClick={false}>
    <TextField source="invoice_no" /><MoneyField source="total" /><MoneyField source="balance" /><StatusField />
  </Datagrid></ArrayField>
  <ArrayField source="payments"><Datagrid bulkActionButtons={false} rowClick={false}>
    <TextField source="payment_no" /><MoneyField source="amount" /><TextField source="method" /><DateField source="paid_at" />
  </Datagrid></ArrayField>
</SimpleShowLayout></Show>;

const packageFilters = [<SelectInput source="status" choices={[{ id: 'active', name: 'Active' }, { id: 'inactive', name: 'Inactive' }]} alwaysOn key="status" />];
export const PackageList = () => <List actions={listActions} filters={packageFilters} perPage={25} title="Internet packages">
  <Datagrid rowClick="edit"><TextField source="code" /><TextField source="name" />
    <MoneyField source="price" /><ReferenceField source="radius_profile_id" reference="radius/profiles" link={false}><TextField source="name" /></ReferenceField>
    <TextField source="billing_cycle" /><StatusField />
  </Datagrid>
</List>;
const PackageForm = () => <SimpleForm>
  <TextInput source="name" isRequired />
  <NumberInput source="price" min={0} isRequired />
  <ReferenceInput source="radius_profile_id" reference="radius/profiles"><SelectInput optionText="name" isRequired /></ReferenceInput>
  <TextInput source="description" multiline />
  <SelectInput source="billing_cycle" choices={[{ id: 'monthly', name: 'Monthly' }]} defaultValue="monthly" />
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
  </Stack>;
};
const subscriptionFilters = [
  <SelectInput source="status" choices={[{ id: 'pending', name: 'Pending' }, { id: 'active', name: 'Active' }, { id: 'suspended', name: 'Suspended' }, { id: 'terminated', name: 'Terminated' }]} key="status" />,
  <ReferenceInput source="customer_id" reference="isp/customers" key="customer_id"><SelectInput optionText="name" /></ReferenceInput>,
];
export const SubscriptionList = () => <List actions={listActions} filters={subscriptionFilters} perPage={25} title="Subscriptions">
  <Datagrid rowClick="show"><TextField source="subscription_no" /><TextField source="customer_name" />
    <TextField source="package_name" /><MoneyField source="package_price" /><TextField source="radius_username" /><StatusField />
    <NumberField source="billing_day" /><NumberField source="grace_days" />
  </Datagrid>
</List>;
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
  <DateField source="start_date" /><NumberField source="billing_day" /><NumberField source="grace_days" />
  <SubscriptionActions />
</SimpleShowLayout></Show>;

const invoiceFilters = [
  <TextInput source="invoice_no" alwaysOn key="invoice_no" />,
  <ReferenceInput source="customer_id" reference="isp/customers" key="customer_id"><SelectInput optionText="name" /></ReferenceInput>,
  <SelectInput source="status" choices={billingStatusChoices} key="status" />,
];
export const InvoiceList = () => <List filters={invoiceFilters} perPage={25} title="Invoices">
  <Datagrid rowClick="show"><TextField source="invoice_no" /><TextField source="customer_name" />
    <TextField source="subscription_no" /><TextField source="package_name" /><DateField source="invoice_date" /><DateField source="due_date" />
    <MoneyField source="total" /><MoneyField source="paid_amount" /><MoneyField source="balance" /><StatusField />
  </Datagrid>
</List>;
export const InvoiceShow = () => <Show title="Invoice details"><SimpleShowLayout>
  <TextField source="company_name" /><TextField source="company_address" /><TextField source="company_phone" /><TextField source="company_email" />
  <TextField source="invoice_no" />
  <ReferenceField source="customer_id" reference="isp/customers" link="show"><TextField source="customer_no" /></ReferenceField>
  <ReferenceField source="subscription_id" reference="isp/subscriptions" link="show"><TextField source="subscription_no" /></ReferenceField>
  <DateField source="invoice_date" /><DateField source="due_date" /><DateField source="period_start" /><DateField source="period_end" />
  <MoneyField source="total" /><MoneyField source="paid_amount" /><MoneyField source="balance" /><StatusField />
  <ArrayField source="items"><Datagrid bulkActionButtons={false} rowClick={false}>
    <TextField source="description" /><NumberField source="quantity" /><MoneyField source="unit_price" /><MoneyField source="total" />
  </Datagrid></ArrayField>
  <ArrayField source="payments"><Datagrid bulkActionButtons={false} rowClick={false}>
    <TextField source="payment_no" /><MoneyField source="amount" /><TextField source="method" /><DateField source="paid_at" />
  </Datagrid></ArrayField>
</SimpleShowLayout></Show>;

const paymentFilters = [
  <ReferenceInput source="customer_id" reference="isp/customers" key="customer_id"><SelectInput optionText="name" /></ReferenceInput>,
  <ReferenceInput source="invoice_id" reference="isp/invoices" key="invoice_id"><SelectInput optionText="invoice_no" /></ReferenceInput>,
];
export const PaymentList = () => <List actions={listActions} filters={paymentFilters} perPage={25} title="Payments">
  <Datagrid rowClick="show"><TextField source="payment_no" />
    <ReferenceField source="customer_id" reference="isp/customers" link="show"><TextField source="customer_no" /></ReferenceField>
    <TextField source="invoice_no" /><MoneyField source="amount" /><TextField source="method" /><DateField source="paid_at" showTime />
  </Datagrid>
</List>;
export const PaymentCreate = () => <Create title="Record payment"><SimpleForm>
  <ReferenceInput source="invoice_id" reference="isp/invoices"><SelectInput optionText="invoice_no" isRequired /></ReferenceInput>
  <NumberInput source="amount" min={1} isRequired />
  <SelectInput source="method" choices={[{ id: 'cash', name: 'Cash' }, { id: 'bank_transfer', name: 'Bank transfer' }, { id: 'manual', name: 'Manual' }, { id: 'other', name: 'Other' }]} isRequired />
  <TextInput source="reference" /><TextInput source="notes" multiline />
</SimpleForm></Create>;
export const PaymentShow = () => <Show title="Payment details"><SimpleShowLayout>
  <TextField source="payment_no" />
  <ReferenceField source="customer_id" reference="isp/customers" link="show"><TextField source="customer_no" /></ReferenceField>
  <ReferenceField source="invoice_id" reference="isp/invoices" link="show"><TextField source="invoice_no" /></ReferenceField>
  <MoneyField source="amount" /><TextField source="method" /><TextField source="reference" />
  <DateField source="paid_at" showTime /><StatusField /><TextField source="notes" />
</SimpleShowLayout></Show>;
