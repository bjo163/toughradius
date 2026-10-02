import {
  ArrayField, Create, Datagrid, DateField, Edit, List, NumberField,
  NumberInput, ReferenceInput, SelectInput, Show, SimpleForm, SimpleShowLayout,
  TextField, TextInput, TopToolbar, CreateButton, useNotify, useRefresh,
  useRecordContext,
} from 'react-admin';
import { Button, Stack } from '@mui/material';
import { apiRequest } from '../utils/apiClient';

const listActions = <TopToolbar><CreateButton /></TopToolbar>;

export const CustomerList = () => <List actions={listActions} perPage={25}>
  <Datagrid rowClick="show">
    <TextField source="customer_no" /><TextField source="name" /><TextField source="phone" />
    <TextField source="email" /><TextField source="city" /><TextField source="package_name" />
    <TextField source="radius_username" /><TextField source="status" />
    <NumberField source="outstanding" options={{ style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }} />
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
export const CustomerCreate = () => <Create><CustomerForm /></Create>;
export const CustomerEdit = () => <Edit><CustomerForm /></Edit>;
export const CustomerShow = () => <Show><SimpleShowLayout>
  <TextField source="customer_no" /><TextField source="name" /><TextField source="phone" />
  <TextField source="email" /><TextField source="address" /><TextField source="city" />
  <TextField source="province" /><TextField source="identity_no" /><TextField source="status" />
  <NumberField source="outstanding" options={{ style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }} />
  <TextField source="notes" /><DateField source="created_at" showTime />
  <ArrayField source="subscriptions"><Datagrid bulkActionButtons={false} rowClick={false}>
    <TextField source="subscription_no" /><TextField source="package_name" /><NumberField source="package_price" />
    <TextField source="radius_username" /><TextField source="status" /><TextField source="online" /><TextField source="current_ip" />
  </Datagrid></ArrayField>
  <ArrayField source="invoices"><Datagrid bulkActionButtons={false} rowClick={false}>
    <TextField source="invoice_no" /><NumberField source="total" /><NumberField source="balance" /><TextField source="status" />
  </Datagrid></ArrayField>
  <ArrayField source="payments"><Datagrid bulkActionButtons={false} rowClick={false}>
    <TextField source="payment_no" /><NumberField source="amount" /><TextField source="method" /><DateField source="paid_at" />
  </Datagrid></ArrayField>
</SimpleShowLayout></Show>;

export const PackageList = () => <List actions={listActions} perPage={25}>
  <Datagrid rowClick="edit"><TextField source="code" /><TextField source="name" />
    <NumberField source="price" options={{ style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }} />
    <TextField source="radius_profile_id" /><TextField source="billing_cycle" /><TextField source="status" />
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
export const PackageCreate = () => <Create><PackageForm /></Create>;
export const PackageEdit = () => <Edit><PackageForm /></Edit>;

const SubscriptionActions = () => {
  const record = useRecordContext(); const notify = useNotify(); const refresh = useRefresh();
  if (!record) return null;
  const doAction = async (action: string) => {
    if ((action === 'suspend' || action === 'terminate') && !window.confirm(`Confirm ${action} for this subscription?`)) return;
    try { await apiRequest(`/isp/subscriptions/${record.id}/${action}`, { method: 'POST' }); notify(`Subscription ${action} successful`, { type: 'success' }); refresh(); }
    catch (error) { notify(error instanceof Error ? error.message : 'Action failed', { type: 'error' }); }
  };
  return <Stack direction="row" spacing={1} sx={{ my: 1 }}>
    {['activate', 'suspend', 'reactivate', 'disconnect', 'terminate'].map(action =>
      <Button key={action} size="small" variant="outlined" onClick={() => void doAction(action)}>{action}</Button>)}
  </Stack>;
};
export const SubscriptionList = () => <List actions={listActions} perPage={25}>
  <Datagrid rowClick="show"><TextField source="subscription_no" /><TextField source="customer_name" />
    <TextField source="package_name" /><NumberField source="package_price" /><TextField source="radius_username" /><TextField source="status" />
    <NumberField source="billing_day" /><NumberField source="grace_days" />
  </Datagrid>
</List>;
export const SubscriptionCreate = () => <Create><SimpleForm>
  <ReferenceInput source="customer_id" reference="isp/customers"><SelectInput optionText="name" isRequired /></ReferenceInput>
  <ReferenceInput source="package_id" reference="isp/packages"><SelectInput optionText="name" isRequired /></ReferenceInput>
  <ReferenceInput source="radius_user_id" reference="radius/users"><SelectInput optionText="username" helperText="Choose an existing RADIUS user, or leave blank to create one below." /></ReferenceInput>
  <TextInput source="username" helperText="Provide a username and password to create a new RADIUS account." />
  <TextInput source="password" type="password" />
  <NumberInput source="billing_day" min={1} max={28} defaultValue={1} isRequired />
  <NumberInput source="grace_days" min={0} max={60} defaultValue={3} isRequired />
  <SelectInput source="status" choices={[{ id: 'pending', name: 'Pending' }, { id: 'active', name: 'Active' }]} defaultValue="pending" />
</SimpleForm></Create>;
export const SubscriptionShow = () => <Show><SimpleShowLayout>
  <TextField source="subscription_no" /><TextField source="customer_id" /><TextField source="package_id" />
  <TextField source="customer_name" /><TextField source="package_name" /><NumberField source="package_price" />
  <TextField source="radius_username" /><TextField source="radius_user_id" /><TextField source="online" /><TextField source="current_ip" />
  <TextField source="status" /><TextField source="suspension_reason" />
  <NumberField source="outstanding" options={{ style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }} />
  <DateField source="start_date" /><NumberField source="billing_day" /><NumberField source="grace_days" />
  <SubscriptionActions />
</SimpleShowLayout></Show>;

export const InvoiceList = () => <List perPage={25}>
  <Datagrid rowClick="show"><TextField source="invoice_no" /><TextField source="customer_name" />
    <TextField source="subscription_no" /><TextField source="package_name" /><DateField source="invoice_date" /><DateField source="due_date" />
    <NumberField source="total" options={{ style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }} />
    <NumberField source="paid_amount" /><NumberField source="balance" /><TextField source="status" />
  </Datagrid>
</List>;
export const InvoiceShow = () => <Show><SimpleShowLayout>
  <TextField source="company_name" /><TextField source="company_address" />
  <TextField source="company_phone" /><TextField source="company_email" />
  <TextField source="invoice_no" /><TextField source="customer_id" /><TextField source="subscription_id" />
  <DateField source="invoice_date" /><DateField source="due_date" /><DateField source="period_start" /><DateField source="period_end" />
  <NumberField source="total" /><NumberField source="paid_amount" /><NumberField source="balance" /><TextField source="status" />
  <ArrayField source="items"><Datagrid bulkActionButtons={false} rowClick={false}>
    <TextField source="description" /><NumberField source="quantity" /><NumberField source="unit_price" /><NumberField source="total" />
  </Datagrid></ArrayField>
  <ArrayField source="payments"><Datagrid bulkActionButtons={false} rowClick={false}>
    <TextField source="payment_no" /><NumberField source="amount" /><TextField source="method" /><DateField source="paid_at" />
  </Datagrid></ArrayField>
</SimpleShowLayout></Show>;

export const PaymentList = () => <List actions={listActions} perPage={25}>
  <Datagrid rowClick="show"><TextField source="payment_no" /><TextField source="customer_id" />
    <TextField source="invoice_no" /><NumberField source="amount" options={{ style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }} />
    <TextField source="method" /><DateField source="paid_at" showTime />
  </Datagrid>
</List>;
export const PaymentCreate = () => <Create><SimpleForm>
  <ReferenceInput source="invoice_id" reference="isp/invoices"><SelectInput optionText="invoice_no" isRequired /></ReferenceInput>
  <NumberInput source="amount" min={1} isRequired />
  <SelectInput source="method" choices={[{ id: 'cash', name: 'Cash' }, { id: 'bank_transfer', name: 'Bank transfer' }, { id: 'manual', name: 'Manual' }, { id: 'other', name: 'Other' }]} isRequired />
  <TextInput source="reference" /><TextInput source="notes" multiline />
</SimpleForm></Create>;
export const PaymentShow = () => <Show><SimpleShowLayout>
  <TextField source="payment_no" /><TextField source="customer_id" /><TextField source="invoice_id" />
  <NumberField source="amount" /><TextField source="method" /><TextField source="reference" />
  <DateField source="paid_at" showTime /><TextField source="status" /><TextField source="notes" />
</SimpleShowLayout></Show>;
