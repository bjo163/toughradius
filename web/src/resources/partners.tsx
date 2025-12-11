// React import not required for JSX with new JSX transform; keep file simple
import { List, Datagrid, TextField, EmailField, EditButton, Edit, SimpleForm, TextInput, Create, Show, SimpleShowLayout, useTranslate } from 'react-admin';

export const PartnerList = () => {
  const translate = useTranslate();
  return (
    <List title={translate('resources.system/partners.name', { _: 'Partners' })}>
      <Datagrid rowClick="show">
        <TextField source="id" />
        <TextField source="name" />
        <TextField source="company" />
        <EmailField source="email" />
        <TextField source="mobile" />
        <EditButton />
      </Datagrid>
    </List>
  );
};

export const PartnerEdit = () => (
  <Edit>
    <SimpleForm>
      <TextInput source="name" />
      <TextInput source="company" />
      <TextInput source="email" />
      <TextInput source="mobile" />
      <TextInput source="phone" />
      <TextInput source="address" />
      <TextInput source="city" />
      <TextInput source="country" />
      <TextInput source="remark" />
    </SimpleForm>
  </Edit>
);

export const PartnerCreate = () => (
  <Create>
    <SimpleForm>
      <TextInput source="name" />
      <TextInput source="company" />
      <TextInput source="email" />
      <TextInput source="mobile" />
      <TextInput source="phone" />
      <TextInput source="address" />
      <TextInput source="city" />
      <TextInput source="country" />
+      <TextInput source="remark" />
    </SimpleForm>
  </Create>
);

export const PartnerShow = () => (
  <Show>
    <SimpleShowLayout>
      <TextField source="id" />
      <TextField source="name" />
      <TextField source="company" />
      <EmailField source="email" />
      <TextField source="mobile" />
      <TextField source="phone" />
      <TextField source="address" />
      <TextField source="city" />
      <TextField source="country" />
      <TextField source="remark" />
    </SimpleShowLayout>
  </Show>
);
