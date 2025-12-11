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
import { Box, Typography, Button, TextField as MuiTextField, MenuItem } from '@mui/material';
import type { ECharts, EChartsOption } from 'echarts';
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
        <FunctionField
          label={translate('resources.network/services.fields.params', { _: 'Params' })}
          render={(rec: Record<string, unknown> | undefined) => {
            if (!rec || !rec.params) return '—';
            try {
              const raw = rec.params as unknown;
              const p = typeof raw === 'string' ? JSON.parse(String(raw)) : (raw as Record<string, unknown>);
              // show dynamic if present, otherwise show a compact JSON preview
              const dynamic = (p && ((p['dynamic'] ?? p['type']) ?? p['queue_type'])) ?? null;
              if (dynamic !== null && dynamic !== undefined) {
                return String(dynamic);
              }
              // pretty print a few keys if available
              const keys = Object.keys((p as Record<string, unknown>) || {}).slice(0, 6);
              if (keys.length === 0) return '—';
              return keys.map(k => `${k}: ${String((p as Record<string, unknown>)[k])}`).join('; ');
            } catch (e) {
              return 'invalid params';
            }
          }}
        />
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
  // service detail with small time-series chart (last 24 hours)
  const record = useRecordContext();
  const translate = useTranslate();
  const params = useParams<{ id?: string }>();
  // prefer record id from react-admin when available, fallback to URL param
  const urlId = params?.id ?? '';
  const id = record ? String((record as unknown as { id?: number | string }).id ?? '') : urlId;
  const [data, setData] = useState<Array<Record<string, unknown>>>([]);
  const notify = useNotify();
  const [fetching, setFetching] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<string>('');
  const [lastError, setLastError] = useState<string>('');
  const [month, setMonth] = useState<string>(''); // format: YYYY-MM, empty = use default 24h
  const [period, setPeriod] = useState<'24h' | 'this_week' | 'this_month' | 'this_year' | 'month'>('24h');
  // local wrapper will render echarts core directly to avoid echarts-for-react ResizeObserver bug
  const EChartsWrapper = ({ option }: { option: EChartsOption }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      let chart: ECharts | null = null;
      let mounted = true;
      let onResize: (() => void) | null = null;

      const init = async () => {
        try {
          const echarts = await import('echarts');
          if (!mounted || !containerRef.current) return;
          chart = echarts.init(containerRef.current) as ECharts;
          chart.setOption(option as EChartsOption);
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
          const now = new Date();
          let startDate: Date;
          let endDate = now;

          if (period === 'month' && month) {
            const [yStr, mStr] = month.split('-');
            const y = Number(yStr);
            const m = Number(mStr); // 1-12
            // local timezone start at first day 00:00:00
            startDate = new Date(y, m - 1, 1, 0, 0, 0);
            // end is first day of next month minus 1 second (local)
            const nextMonth = new Date(y, m, 1, 0, 0, 0);
            endDate = new Date(nextMonth.getTime() - 1000);
            console.log('[ServiceShow] fetching metrics for month (local)', { id, month, startDate, endDate });
          } else if (period === '24h') {
            endDate = now;
            startDate = new Date(now.getTime() - 24 * 3600 * 1000);
          } else if (period === 'this_week') {
            // local week start (Monday)
            const day = now.getDay(); // 0 = Sunday
            const diff = (day + 6) % 7; // days since Monday
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff, 0, 0, 0);
          } else if (period === 'this_month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
          } else if (period === 'this_year') {
            startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
          } else {
            // fallback to last 24h
            endDate = now;
            startDate = new Date(now.getTime() - 24 * 3600 * 1000);
          }

          const start = Math.floor(startDate.getTime() / 1000);
          const end = Math.floor(endDate.getTime() / 1000);
          console.log('[ServiceShow] fetching metrics', { id, period, start, end });

          setLastAttempt(new Date().toLocaleString());
          setLastError('');
          const res = await apiRequest<{ ts: number; up_kbps: number; down_kbps: number }[]>(`/network/services/${id}/metrics?start=${start}&end=${end}`);
          console.log('[ServiceShow] metrics response', { id, month, res });
          if (!mounted) return;
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
  }, [id, month, period]);

  // No-op: chart is rendered via local EChartsWrapper which dynamically imports 'echarts'.

  // Build chart option dynamically but only for traffic metrics (ignore latency).
  const option = (() => {
  // decide whether to show date+time or only time on x axis
  const startTs = data && data.length > 0 ? Number((data[0] as Record<string, unknown>)['ts'] ?? 0) * 1000 : 0;
  const endTs = data && data.length > 0 ? Number((data[data.length - 1] as Record<string, unknown>)['ts'] ?? 0) * 1000 : 0;
  const rangeSeconds = endTs > startTs ? Math.floor((endTs - startTs) / 1000) : 0;
  const showDate = rangeSeconds > 24 * 3600;
  const xData = data.map(d => {
    const dt = new Date(Number((d as Record<string, unknown>)['ts'] ?? 0) * 1000);
    return showDate ? dt.toLocaleString() : dt.toLocaleTimeString();
  });
  const sample = data && data.length > 0 ? (data[0] as Record<string, unknown>) : ({} as Record<string, unknown>);

    // Possible traffic keys in order of preference
    const upKeys = ['up_kbps', 'upload_kbps', 'rate_up_kbps', 'total_rate_up'];
    const downKeys = ['down_kbps', 'download_kbps', 'rate_down_kbps', 'total_rate_down'];

    const findKey = (keys: string[]) => keys.find(k => typeof sample[k] === 'number');

    const upKey = findKey(upKeys);
    const downKey = findKey(downKeys);

    if (upKey || downKey) {
      const series: unknown[] = [];
      if (upKey) series.push({ name: 'Up Kbps', type: 'line', data: data.map(d => Number((d as Record<string, unknown>)[upKey] ?? 0)) });
      if (downKey) series.push({ name: 'Down Kbps', type: 'line', data: data.map(d => Number((d as Record<string, unknown>)[downKey] ?? 0)) });

      return {
        tooltip: { trigger: 'axis' },
  legend: { data: (series as Array<Record<string, unknown>>).map(s => String((s as Record<string, unknown>)['name'] ?? '')) },
        xAxis: { type: 'category', data: xData },
        yAxis: { type: 'value' },
        series: series as EChartsOption['series'],
      } as EChartsOption;
    }

    // If no traffic keys found, return empty series — do NOT plot latency
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: [] },
      xAxis: { type: 'category', data: xData },
      yAxis: { type: 'value' },
      series: [],
    } as EChartsOption;
  })();

  // Compute small traffic statistics: current (last), average, peak, low for up/down
  const sample = data && data.length > 0 ? (data[0] as Record<string, unknown>) : ({} as Record<string, unknown>);
  const upKeys = ['up_kbps', 'upload_kbps', 'rate_up_kbps', 'total_rate_up'];
  const downKeys = ['down_kbps', 'download_kbps', 'rate_down_kbps', 'total_rate_down'];
  const findKey = (keys: string[]) => keys.find(k => typeof sample[k] === 'number');
  const upKey = findKey(upKeys);
  const downKey = findKey(downKeys);

  const toNumberArray = (key?: string) => {
    if (!key) return [] as number[];
    return data.map(d => {
      const v = (d as Record<string, unknown>)[key];
      return typeof v === 'number' ? v : Number(v || 0);
    });
  };

  const upSeries = toNumberArray(upKey);
  const downSeries = toNumberArray(downKey);

  const computeStats = (arr: number[]) => {
    if (!arr || arr.length === 0) return { current: 0, avg: 0, peak: 0, low: 0 };
    const filtered = arr.filter(v => !Number.isNaN(v));
    if (filtered.length === 0) return { current: 0, avg: 0, peak: 0, low: 0 };
    const current = filtered[filtered.length - 1];
    const sum = filtered.reduce((s, x) => s + x, 0);
    const avg = Math.round(sum / filtered.length);
    const peak = Math.max(...filtered);
    const low = Math.min(...filtered);
    return { current, avg, peak, low };
  };

  const upStats = computeStats(upSeries);
  const downStats = computeStats(downSeries);

  const renderHuman = (v: number) => {
    if (!v) return '0';
    if (v >= 1000000) return `${(v / 1000000).toFixed(2).replace(/\.00$/, '')}G`;
    if (v >= 1000) return `${(v / 1000).toFixed(2).replace(/\.00$/, '')}M`;
    return `${v}K`;
  };

  return (
    <Show>
      <SimpleShowLayout>
        <TextField source="id" />
        <TextField source="name" />
        <TextField source="service_type" />
        <TextField source="endpoint" />
        {/* Month picker (always visible) */}
        <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <MuiTextField
            select
            size="small"
            label={translate('resources.network/services.metrics.timeframe_label', { _: 'Timeframe' })}
            value={period}
            onChange={(e) => {
              const v = e.target.value as typeof period;
              setPeriod(v);
              // if switching away from month, clear month picker
              if (v !== 'month') setMonth('');
            }}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="24h">{translate('resources.network/services.metrics.last_24_hours', { _: 'Last 24 hours' })}</MenuItem>
            <MenuItem value="this_week">{translate('resources.network/services.metrics.this_week', { _: 'This week' })}</MenuItem>
            <MenuItem value="this_month">{translate('resources.network/services.metrics.this_month', { _: 'This month' })}</MenuItem>
            <MenuItem value="this_year">{translate('resources.network/services.metrics.this_year', { _: 'This year' })}</MenuItem>
            <MenuItem value="month">{translate('resources.network/services.metrics.select_month', { _: 'Select month' })}</MenuItem>
          </MuiTextField>

          {period === 'month' && (
            <MuiTextField
              type="month"
              label={translate('resources.network/services.metrics.month_label', { _: 'Month' })}
              size="small"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              helperText={translate('resources.network/services.metrics.month_helper', { _: 'Empty = last 24 hours' })}
            />
          )}
          <Button size="small" onClick={() => { setMonth(''); setPeriod('24h'); }}>
            {translate('resources.network/services.metrics.clear_month', { _: 'Clear month' })}
          </Button>
        </Box>
        {/* Fetch now button: triggers NAS fetch and polls metrics until data appears (requires record) */}
        {record && (
          <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              size="small"
              disabled={fetching}
              onClick={async () => {
                try {
                  setFetching(true);
                  console.log('[ServiceShow] fetch now clicked', { serviceId: record.id, nasId: record.nas_id, month });
                  const resp = await apiRequest(`/network/nas/${record.nas_id}/fetch-services`, { method: 'POST' });
                  console.log('[ServiceShow] fetch-services response', resp);
                  notify('Fetch scheduled, polling metrics...', { type: 'info' });
                  setLastAttempt(new Date().toLocaleString());
                  setLastError('');
                  // poll for up to 30 seconds
                  const deadline = Date.now() + 30000;
                  const poll = async () => {
                    const now = Math.floor(Date.now() / 1000);
                    let start: number;
                    let end = now;
                    if (month) {
                      const [yStr, mStr] = month.split('-');
                      const y = Number(yStr);
                      const m = Number(mStr);
                      const startDate = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
                      const nextMonth = new Date(Date.UTC(y, m - 1 + 1, 1, 0, 0, 0));
                      const endDate = new Date(nextMonth.getTime() - 1000);
                      start = Math.floor(startDate.getTime() / 1000);
                      end = Math.floor(endDate.getTime() / 1000);
                    } else {
                      start = now - 24 * 3600;
                    }
                    try {
                      const metrics = await apiRequest(`/network/services/${record.id}/metrics?start=${start}&end=${end}`);
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
        {/* Small traffic summary: current / avg / peak / low */}
        <Box sx={{ display: 'flex', gap: 3, mb: 2 }}>
          <Box>
            <Typography variant="subtitle2">Up (current / avg / peak / low)</Typography>
            <Typography variant="body2">{renderHuman(upStats.current)} / {renderHuman(upStats.avg)} / {renderHuman(upStats.peak)} / {renderHuman(upStats.low)}</Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2">Down (current / avg / peak / low)</Typography>
            <Typography variant="body2">{renderHuman(downStats.current)} / {renderHuman(downStats.avg)} / {renderHuman(downStats.peak)} / {renderHuman(downStats.low)}</Typography>
          </Box>
        </Box>
        <Box sx={{ height: 360 }}>
          {/* Render chart only on client and when we have at least one point. This avoids an echarts-for-react
              unmount bug where a missing ResizeObserver causes `disconnect` of undefined. */}
          {typeof window !== 'undefined' && (Array.isArray(option.series) ? option.series.length > 0 : false) ? (
            <EChartsWrapper option={option as unknown as EChartsOption} />
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
