import {
  List,
  Datagrid,
  TextField,
  Edit,
  Create,
  SimpleForm,
  TextInput,
  required,
  EditButton,
  DeleteButton,
  TopToolbar,
  CreateButton,
  ExportButton,
  useTranslate,
} from 'react-admin';
import { Box } from '@mui/material';

const ListActions = () => (
  <TopToolbar>
    <CreateButton />
    <ExportButton />
  </TopToolbar>
);

export const VendorList = () => {
  const translate = useTranslate();
  return (
    <List actions={<ListActions />} sort={{ field: 'id', order: 'DESC' }} perPage={25}>
      <Datagrid>
        <TextField source="id" label="ID" />
        <TextField source="code" label={translate('resources.network/vendors.fields.code', { _: 'Code' })} />
        <TextField source="name" label={translate('resources.network/vendors.fields.name', { _: 'Name' })} />
        <TextField source="remark" label={translate('resources.network/vendors.fields.remark', { _: 'Remark' })} />
        <EditButton />
        <DeleteButton />
      </Datagrid>
    </List>
  );
};

export const VendorEdit = () => {
  const translate = useTranslate();
  return (
    <Edit>
      <SimpleForm>
        <Box display="flex" flexDirection="column" gap={2} width="100%" maxWidth={600}>
          <TextInput source="code" label={translate('resources.network/vendors.fields.code', { _: 'Code' })} validate={required()} fullWidth />
          <TextInput source="name" label={translate('resources.network/vendors.fields.name', { _: 'Name' })} validate={required()} fullWidth />
          <TextInput source="remark" label={translate('resources.network/vendors.fields.remark', { _: 'Remark' })} multiline rows={3} fullWidth />
        </Box>
      </SimpleForm>
    </Edit>
  );
};

export const VendorCreate = () => {
  const translate = useTranslate();
  return (
    <Create>
      <SimpleForm>
        <Box display="flex" flexDirection="column" gap={2} width="100%" maxWidth={600}>
          <TextInput source="code" label={translate('resources.network/vendors.fields.code', { _: 'Code' })} validate={required()} fullWidth />
          <TextInput source="name" label={translate('resources.network/vendors.fields.name', { _: 'Name' })} validate={required()} fullWidth />
          <TextInput source="remark" label={translate('resources.network/vendors.fields.remark', { _: 'Remark' })} multiline rows={3} fullWidth />
        </Box>
      </SimpleForm>
    </Create>
  );
};

export default VendorList;
