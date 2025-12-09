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
  Show,
  SimpleShowLayout,
} from 'react-admin';
import { Box, Typography, Button } from '@mui/material';
import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { apiRequest } from '../utils/apiClient';
import { useRecordContext } from 'react-admin';

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
        console.log('[ServiceList] totals response', res);
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

export const ServiceShow = () => {
  // service detail with small time-series chart (last 1 hour)
  const record = useRecordContext();
  const params = useParams<{ id?: string }>();
  // prefer record id from react-admin when available, fallback to URL param
  const urlId = params?.id ?? '';
  const id = record ? String((record as unknown as { id?: number | string }).id ?? '') : urlId;
  const [data, setData] = useState<Array<{ ts: number; up_kbps: number; down_kbps: number }>>([]);
  const notify = useNotify();
  const [fetching, setFetching] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<string>('');
  const [lastError, setLastError] = useState<string>('');
  // local wrapper will render echarts core directly to avoid echarts-for-react ResizeObserver bug
  const EChartsWrapper = ({ option }: { option: any }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      let chart: any = null;
      let mounted = true;
      let onResize: (() => void) | null = null;

      const init = async () => {
        try {
          const echarts = await import('echarts');
          if (!mounted || !containerRef.current) return;
          chart = echarts.init(containerRef.current);
          chart.setOption(option);
          onResize = () => chart && chart.resize();
          window.addEventListener('resize', onResize);
        } catch (e) {
          console.error('Failed to load echarts', e);
        }
      };

      init();

      return () => {
        mounted = false;
        if (onResize) window.removeEventListener('resize', onResize);
        if (chart) {
          try {
            chart.dispose();
          } catch (e) {
            // ignore
          }
        }
      };
    }, [option]);

    return <div ref={containerRef} style={{ height: '100%' }} />;
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!id) return;
      try {
        const now = Math.floor(Date.now() / 1000);
        const oneHourAgo = now - 3600;
        console.log('[ServiceShow] fetching metrics', { id, start: oneHourAgo, end: now });
        setLastAttempt(new Date().toLocaleString());
        setLastError('');
        let res = await apiRequest<{ ts: number; up_kbps: number; down_kbps: number }[]>(`/network/services/${id}/metrics?start=${oneHourAgo}&end=${now}`);
        console.log('[ServiceShow] metrics response (1h)', { id, res });
        if (!mounted) return;
        if (!res || res.length === 0) {
          // fallback to 24h window if nothing in last 1h
          const oneDayAgo = now - 24 * 3600;
          try {
            const res24 = await apiRequest<{ ts: number; up_kbps: number; down_kbps: number }[]>(`/network/services/${id}/metrics?start=${oneDayAgo}&end=${now}`);
            console.log('[ServiceShow] metrics response (24h fallback)', { id, res24 });
            res = res24 || [];
          } catch (e) {
            console.error('[ServiceShow] fallback metrics fetch failed', e);
          }
        }
        setData(res || []);
        console.log('[ServiceShow] setData', { id, length: (res || []).length });
      } catch (err) {
        console.error('[ServiceShow] failed to fetch metrics', { id, err });
        setLastAttempt(new Date().toLocaleString());
        setLastError(String(err));
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  // No-op: chart is rendered via local EChartsWrapper which dynamically imports 'echarts'.

  const option = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['Up Kbps', 'Down Kbps'] },
    xAxis: { type: 'category', data: data.map(d => new Date(d.ts * 1000).toLocaleTimeString()) },
    yAxis: { type: 'value' },
    series: [
      { name: 'Up Kbps', type: 'line', data: data.map(d => d.up_kbps) },
      { name: 'Down Kbps', type: 'line', data: data.map(d => d.down_kbps) },
    ],
  };

  return (
    <Show>
      <SimpleShowLayout>
        <TextField source="id" />
        <TextField source="name" />
        <TextField source="service_type" />
        <TextField source="endpoint" />
        {/* Fetch now button: triggers NAS fetch and polls metrics until data appears */}
        {record && (
          <Box sx={{ mb: 2 }}>
            <Button
              variant="contained"
              size="small"
              disabled={fetching}
              onClick={async () => {
                try {
                  setFetching(true);
                  console.log('[ServiceShow] fetch now clicked', { serviceId: record.id, nasId: record.nas_id });
                  const resp = await apiRequest(`/network/nas/${record.nas_id}/fetch-services`, { method: 'POST' });
                  console.log('[ServiceShow] fetch-services response', resp);
                  notify('Fetch scheduled, polling metrics...', { type: 'info' });
                  setLastAttempt(new Date().toLocaleString());
                  setLastError('');
                  // poll for up to 30 seconds
                  const deadline = Date.now() + 30000;
                  const poll = async () => {
                    const now = Math.floor(Date.now() / 1000);
                    const oneHourAgo = now - 3600;
                    try {
                      const metrics = await apiRequest(`/network/services/${record.id}/metrics?start=${oneHourAgo}&end=${now}`);
                      console.log('[ServiceShow] poll metrics', { metrics });
                      if (Array.isArray(metrics) && metrics.length > 0) {
                        setData(metrics as unknown as Array<{ ts: number; up_kbps: number; down_kbps: number }>);
                        notify('Metrics available', { type: 'success' });
                          setLastAttempt(new Date().toLocaleString());
                          setLastError('');
                        setFetching(false);
                        return;
                      }
                    } catch (e) {
                      console.error('[ServiceShow] poll error', e);
                    }
                    if (Date.now() < deadline) {
                      setTimeout(poll, 2000);
                    } else {
                      notify('No metrics after fetch (timeout)', { type: 'warning' });
                      setLastAttempt(new Date().toLocaleString());
                      setLastError('No metrics after fetch (timeout)');
                      setFetching(false);
                    }
                  };
                  setTimeout(poll, 1000);
                } catch (e) {
                  console.error('[ServiceShow] fetch now failed', e);
                  setLastAttempt(new Date().toLocaleString());
                  setLastError(String(e));
                  notify('Fetch failed', { type: 'error' });
                  setFetching(false);
                }
              }}
            >
              {fetching ? 'Fetching...' : 'Fetch now'}
            </Button>
          </Box>
        )}
        {/* Visible debug status so user can see last attempt and error */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2">Last fetch attempt: {lastAttempt || 'never'}</Typography>
          {lastError && <Typography variant="body2" color="error">Last error: {lastError}</Typography>}
          <Typography variant="body2">Metric points: {data ? data.length : 0}</Typography>
        </Box>
        <Box sx={{ height: 360 }}>
          {/* Render chart only on client and when we have at least one point. This avoids an echarts-for-react
              unmount bug where a missing ResizeObserver causes `disconnect` of undefined. */}
          {typeof window !== 'undefined' && data && data.length > 0 ? (
            <EChartsWrapper option={option} />
          ) : (
            <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'gray' }}>
              No metric data
            </Box>
          )}
        </Box>
      </SimpleShowLayout>
    </Show>
  );
};

export default ServiceList;
