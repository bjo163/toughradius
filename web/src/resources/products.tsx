import {
  List,
  Datagrid,
  TextField,
  DateField,
  Edit,
  SimpleForm,
  TextInput,
  NumberInput,
  Create,
  Show,
  SimpleShowLayout,
  required,
  minLength,
  minValue,
  FunctionField,
  SelectInput,
  FormDataConsumer,
} from 'react-admin';

const currencyFormat = (v?: number) => {
  if (v === undefined || v === null) return '-';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(v));
  } catch (_e) {
    return String(v);
  }
};

export const ProductList = (props: Record<string, unknown>) => (
  <List {...props} perPage={25}>
    <Datagrid rowClick="show">
        <TextField source="id" />
        <TextField source="name" />
        <TextField source="type" />
        <FunctionField label="Qty" render={(record: Record<string, unknown> | undefined) => {
          if (!record) return '-';
          const v = record['qty'];
          if (v === null || v === undefined) return '-';
          return String(v);
        }} />
        <FunctionField label="Image" render={(record: Record<string, unknown> | undefined) => {
          if (!record) return null;
          const url = record['image'];
          if (!url) return null;
          return (<img src={String(url)} alt="img" style={{ width: 48, height: 32, objectFit: 'cover' }} />);
        }} />
      <FunctionField
        label="Price"
        render={(record: Record<string, unknown> | undefined) => {
          if (!record) return '-';
          const v = record['price'];
          let num: number | undefined;
          if (typeof v === 'number') num = v;
          else if (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v))) num = Number(v);
          return currencyFormat(num);
        }}
      />
      <DateField source="created_at" showTime />
    </Datagrid>
  </List>
);

export const ProductCreate = (props: Record<string, unknown>) => (
  <Create {...props}>
    <SimpleForm>
      <TextInput source="name" validate={[required(), minLength(2)]} />
      <NumberInput source="price" step={0.01} validate={[required(), minValue(0)]} />
      <TextInput source="image" />
      <SelectInput source="type" choices={[{ id: 'service', name: 'Service' }, { id: 'consumable', name: 'Consumable' }]} validate={[required()]} />
      <FormDataConsumer>
        {(props) => {
          const fd = props.formData as Record<string, unknown> | undefined;
          if (fd && fd['type'] === 'consumable') {
            return <NumberInput source="qty" validate={[required(), minValue(0)]} />;
          }
          return null;
        }}
      </FormDataConsumer>
    </SimpleForm>
  </Create>
);

export const ProductEdit = (props: Record<string, unknown>) => (
  <Edit {...props}>
    <SimpleForm>
      <TextInput source="name" validate={[required(), minLength(2)]} />
      <NumberInput source="price" step={0.01} validate={[required(), minValue(0)]} />
      <TextInput source="image" />
      <SelectInput source="type" choices={[{ id: 'service', name: 'Service' }, { id: 'consumable', name: 'Consumable' }]} validate={[required()]} />
      <FormDataConsumer>
        {(props) => {
          const fd = props.formData as Record<string, unknown> | undefined;
          if (fd && fd['type'] === 'consumable') {
            return <NumberInput source="qty" validate={[required(), minValue(0)]} />;
          }
          return null;
        }}
      </FormDataConsumer>
    </SimpleForm>
  </Edit>
);

export const ProductShow = (props: Record<string, unknown>) => (
  <Show {...props}>
    <SimpleShowLayout>
      <TextField source="id" />
      <TextField source="name" />
      <FunctionField
        label="Price"
        render={(r: Record<string, unknown> | undefined) => {
          if (!r) return '-';
          const v = r['price'];
          let num: number | undefined;
          if (typeof v === 'number') num = v;
          else if (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v))) num = Number(v);
          return currencyFormat(num);
        }}
      />
        <TextField source="type" />
        <FunctionField label="Qty" render={(r: Record<string, unknown> | undefined) => {
          if (!r) return '-';
          const v = r['qty'];
          if (v === null || v === undefined) return '-';
          return String(v);
        }} />
        <FunctionField label="Image" render={(r: Record<string, unknown> | undefined) => {
          if (!r) return null;
          const url = r['image'];
          if (!url) return null;
          return (<img src={String(url)} alt="img" style={{ maxWidth: 320, maxHeight: 160, objectFit: 'contain' }} />);
        }} />
      <DateField source="created_at" showTime />
      <DateField source="updated_at" showTime />
    </SimpleShowLayout>
  </Show>
);

export default ProductList;
