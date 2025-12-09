import {
  List,
  Datagrid,
  TextField,
  DateField,
  DeleteButton,
  useTranslate,
  ReferenceField,
  TextInput,
  FunctionField,
  useNotify,
} from 'react-admin';
import { Box, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/apiClient';

const ServiceFilters = [
  <TextInput source="q" label="Search" alwaysOn />,
  <TextInput source="nas_id" label="NAS ID" />,
];

export const ServiceList = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const [totalUp, setTotalUp] = useState<number>(0);
  const [totalDown, setTotalDown] = useState<number>(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest<{ total_rate_up: number; total_rate_down: number }>(`/network/services/summary`);
        setTotalUp(res.total_rate_up || 0);
        setTotalDown(res.total_rate_down || 0);
      } catch (err) {
        notify('Failed to fetch service totals', { type: 'warning' });
      }
    })();
  }, [notify]);

  const renderHuman = (v: number) => {
    if (!v) return '0';
    if (v >= 1000000) return `${(v / 1000000).toFixed(2).replace(/\.00$/, '')}G`;
    if (v >= 1000) return `${(v / 1000).toFixed(2).replace(/\.00$/, '')}M`;
    return `${v}K`;
  };

  const Actions = () => (
    <Box display="flex" alignItems="center" gap={2} padding={2}>
      <Typography variant="subtitle2">Total Rate Up: {renderHuman(totalUp)}</Typography>
      <Typography variant="subtitle2">Total Rate Down: {renderHuman(totalDown)}</Typography>
    </Box>
  );

  return (
    <List perPage={50} filters={ServiceFilters} exporter={false} title={translate('resources.network/services.name', { _: 'Services' })} actions={<Actions />}>
      <Datagrid rowClick="show">
        <TextField source="id" />
        <TextField source="vendor_service_id" label="Vendor Service ID" />
        <ReferenceField label="NAS" source="nas_id" reference="network/nas" link="show">
          <TextField source="name" />
        </ReferenceField>
        <TextField source="name" />
        <TextField source="service_type" />
        <TextField source="endpoint" />
        {/* show human friendly rate and upload/download units, sort by underlying Kbps fields */}
        <FunctionField
          label="Rate Up"
          source="rate_up_kbps"
          sortBy="rate_up_kbps"
          render={(record: Record<string, unknown>) => {
            const v = Number(record?.['rate_up_kbps'] ?? 0);
            if (!v) return '0';
            if (v >= 1000000) return `${(v / 1000000).toFixed(2).replace(/\.00$/, '')}G`;
            if (v >= 1000) return `${(v / 1000).toFixed(2).replace(/\.00$/, '')}M`;
            return `${v}K`;
          }}
        />

        <FunctionField
          label="Rate Down"
          source="rate_down_kbps"
          sortBy="rate_down_kbps"
          render={(record: Record<string, unknown>) => {
            const v = Number(record?.['rate_down_kbps'] ?? 0);
            if (!v) return '0';
            if (v >= 1000000) return `${(v / 1000000).toFixed(2).replace(/\.00$/, '')}G`;
            if (v >= 1000) return `${(v / 1000).toFixed(2).replace(/\.00$/, '')}M`;
            return `${v}K`;
          }}
        />

        <FunctionField
          label="Upload"
          source="upload_kbps"
          sortBy="upload_kbps"
          render={(record: Record<string, unknown>) => {
            const v = Number(record?.['upload_kbps'] ?? 0);
            if (!v) return '0';
            if (v >= 1000000) return `${(v / 1000000).toFixed(2).replace(/\.00$/, '')}G`;
            if (v >= 1000) return `${(v / 1000).toFixed(2).replace(/\.00$/, '')}M`;
            return `${v}K`;
          }}
        />

        <FunctionField
          label="Download"
          source="download_kbps"
          sortBy="download_kbps"
          render={(record: Record<string, unknown>) => {
            const v = Number(record?.['download_kbps'] ?? 0);
            if (!v) return '0';
            if (v >= 1000000) return `${(v / 1000000).toFixed(2).replace(/\.00$/, '')}G`;
            if (v >= 1000) return `${(v / 1000).toFixed(2).replace(/\.00$/, '')}M`;
            return `${v}K`;
          }}
        />
        <TextField source="status" label="Status" />
  <DateField source="last_seen_at" />
        <DeleteButton />
      </Datagrid>
    </List>
  );
};

export default ServiceList;
