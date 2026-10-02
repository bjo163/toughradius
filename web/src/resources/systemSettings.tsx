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
  CreateButton,
  ExportButton,
} from 'react-admin';

// 系统设置列表操作栏
const SettingsListActions = () => (
  <TopToolbar>
    <FilterButton />
    <CreateButton />
    <ExportButton />
  </TopToolbar>
);

// 系统设置列表
export const SystemSettingsList = () => (
  <List actions={<SettingsListActions />} filters={settingsFilters}>
    <Datagrid rowClick="edit">
      <TextField source="id" label="ID" />
      <TextField source="type" label="Type" />
      <TextField source="name" label="Setting name" />
      <TextField source="value" label="Setting value" />
      <TextField source="sort" label="Sort" />
      <TextField source="remark" label="Notes" />
      <DateField source="created_at" label="Created at" showTime />
      <DateField source="updated_at" label="Updated at" showTime />
    </Datagrid>
  </List>
);

// 筛选器
const settingsFilters = [
  <TextInput label="Type" source="type" alwaysOn />,
  <TextInput label="Name" source="name" />,
];

// 系统设置Edit
export const SystemSettingsEdit = () => (
  <Edit>
    <SimpleForm>
      <TextInput source="id" disabled />
      <SelectInput
        source="type"
        label="Type"
        required
        choices={[
          { id: 'system', name: 'System configuration' },
          { id: 'radius', name: 'RADIUS configuration' },
          { id: 'security', name: 'Security configuration' },
          { id: 'network', name: 'Network configuration' },
          { id: 'email', name: 'Email configuration' },
          { id: 'other', name: 'Other configuration' },
        ]}
      />
      <TextInput source="name" label="Setting name" required />
      <TextInput source="value" label="Setting value" required multiline rows={3} />
      <NumberInput source="sort" label="Sort" defaultValue={0} />
      <TextInput source="remark" label="Notes" multiline rows={2} />
    </SimpleForm>
  </Edit>
);

// 系统设置Create
export const SystemSettingsCreate = () => (
  <Create>
    <SimpleForm>
      <SelectInput
        source="type"
        label="Type"
        required
        defaultValue="system"
        choices={[
          { id: 'system', name: 'System configuration' },
          { id: 'radius', name: 'RADIUS configuration' },
          { id: 'security', name: 'Security configuration' },
          { id: 'network', name: 'Network configuration' },
          { id: 'email', name: 'Email configuration' },
          { id: 'other', name: 'Other configuration' },
        ]}
      />
      <TextInput source="name" label="Setting name" required />
      <TextInput source="value" label="Setting value" required multiline rows={3} />
      <NumberInput source="sort" label="Sort" defaultValue={0} />
      <TextInput source="remark" label="Notes" multiline rows={2} />
    </SimpleForm>
  </Create>
);

// 系统设置详情
export const SystemSettingsShow = () => (
  <Show>
    <SimpleShowLayout>
      <TextField source="id" label="ID" />
      <TextField source="type" label="Type" />
      <TextField source="name" label="Setting name" />
      <TextField source="value" label="Setting value" />
      <TextField source="sort" label="Sort" />
      <TextField source="remark" label="Notes" />
      <DateField source="created_at" label="Created at" showTime />
      <DateField source="updated_at" label="Updated at" showTime />
    </SimpleShowLayout>
  </Show>
);
