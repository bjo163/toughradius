import {
  List,
  Datagrid,
  TextField,
  DateField,
  Edit,
  SimpleForm,
  TextInput,
  NumberInput,
  SelectInput,
  Create,
  Show,
  SimpleShowLayout,
  FilterButton,
  TopToolbar,
  ExportButton,
} from 'react-admin';
import { CreateButton } from 'react-admin';

// System settings list toolbar
const SettingsListActions = () => (
  <TopToolbar>
    <FilterButton />
  <CreateButton />
    <ExportButton />
  </TopToolbar>
);

// System settings list
export const SystemSettingsList = () => (
  <List actions={<SettingsListActions />} filters={settingsFilters}>
    <Datagrid rowClick="edit">
      <TextField source="id" label="ID" />
      <TextField source="type" label="Type" />
      <TextField source="name" label="Config Name" />
      <TextField source="value" label="Config Value" />
      <TextField source="sort" label="Sort" />
      <TextField source="remark" label="Remark" />
      <DateField source="created_at" label="Created At" showTime />
      <DateField source="updated_at" label="Updated At" showTime />
    </Datagrid>
  </List>
);

// Filters
const settingsFilters = [
  <TextInput label="Type" source="type" alwaysOn />,
  <TextInput label="Name" source="name" />,
];

// System settings edit
export const SystemSettingsEdit = () => (
  <Edit>
    <SimpleForm>
      <TextInput source="id" disabled />
      <SelectInput
        source="type"
        label="Type"
        required
        choices={[
          { id: 'system', name: 'System Config' },
          { id: 'radius', name: 'RADIUS Config' },
          { id: 'security', name: 'Security Config' },
          { id: 'network', name: 'Network Config' },
          { id: 'email', name: 'Email Config' },
          { id: 'other', name: 'Other Config' },
        ]}
      />
      <TextInput source="name" label="Config Name" required />
      <TextInput source="value" label="Config Value" required multiline rows={3} />
      <NumberInput source="sort" label="Sort" defaultValue={0} />
      <TextInput source="remark" label="Remark" multiline rows={2} />
    </SimpleForm>
  </Edit>
);

// System settings create
export const SystemSettingsCreate = () => (
  <Create>
    <SimpleForm>
      <SelectInput
        source="type"
        label="Type"
        required
        defaultValue="system"
        choices={[
          { id: 'system', name: 'System Config' },
          { id: 'radius', name: 'RADIUS Config' },
          { id: 'security', name: 'Security Config' },
          { id: 'network', name: 'Network Config' },
          { id: 'email', name: 'Email Config' },
          { id: 'other', name: 'Other Config' },
        ]}
      />
      <TextInput source="name" label="Config Name" required />
      <TextInput source="value" label="Config Value" required multiline rows={3} />
      <NumberInput source="sort" label="Sort" defaultValue={0} />
      <TextInput source="remark" label="Remark" multiline rows={2} />
    </SimpleForm>
  </Create>
);

// System settings detail view
export const SystemSettingsShow = () => (
  <Show>
    <SimpleShowLayout>
      <TextField source="id" label="ID" />
      <TextField source="type" label="Type" />
      <TextField source="name" label="Config Name" />
      <TextField source="value" label="Config Value" />
      <TextField source="sort" label="Sort" />
      <TextField source="remark" label="Remark" />
      <DateField source="created_at" label="Created At" showTime />
      <DateField source="updated_at" label="Updated At" showTime />
    </SimpleShowLayout>
  </Show>
);
