import React, { useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { Refresh, ShowChart, TrendingUp, Speed, Storage } from '@mui/icons-material';
import ReactECharts from 'echarts-for-react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, extractData } from '../utils/apiClient';

export interface TrafficPoint {
  timestamp: string;
  in_bps: number;
  out_bps: number;
}

export interface TrafficSeriesResponse {
  entity_id: string;
  title: string;
  interface_name?: string;
  available_interfaces?: string[];
  current_in_bps: number;
  current_out_bps: number;
  peak_in_bps: number;
  peak_out_bps: number;
  avg_in_bps: number;
  avg_out_bps: number;
  total_in_bytes: number;
  total_out_bytes: number;
  points: TrafficPoint[];
}

export const formatBps = (bps: number): string => {
  if (!Number.isFinite(bps) || bps <= 0) return '0 bps';
  if (bps < 1_000) return `${Math.round(bps)} bps`;
  if (bps < 1_000_000) return `${(bps / 1_000).toFixed(1)} Kbps`;
  if (bps < 1_000_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
};

export const formatTrafficBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(val >= 100 ? 0 : 2)} ${units[idx]}`;
};

interface MrtgTrafficGraphProps {
  endpoint: string; // e.g. "/network/monitor-targets/1/traffic" or "/isp/subscriptions/2/traffic"
  title?: string;
  showInterfaceSelector?: boolean;
}

export const MrtgTrafficGraph: React.FC<MrtgTrafficGraphProps> = ({
  endpoint,
  title,
  showInterfaceSelector = false,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [timeRange, setTimeRange] = useState<string>('24h');
  const [selectedInterface, setSelectedInterface] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  // Construct query URL
  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('range', timeRange);
    if (selectedInterface) {
      params.set('interface', selectedInterface);
    }
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${cleanEndpoint}?${params.toString()}`;
  }, [endpoint, timeRange, selectedInterface]);

  const { data, isLoading, isFetching, refetch } = useQuery<TrafficSeriesResponse>({
    queryKey: ['mrtg-traffic', queryUrl],
    queryFn: async () => {
      const payload = await apiRequest<unknown>(queryUrl);
      return extractData<TrafficSeriesResponse>(payload);
    },
    refetchInterval: autoRefresh ? 15000 : false,
  });

  const availableInterfaces = data?.available_interfaces ?? [];
  const currentInterface = data?.interface_name || selectedInterface || (availableInterfaces[0] ?? '');

  // ECharts options
  const chartOption = useMemo(() => {
    if (!data?.points || data.points.length === 0) {
      return null;
    }

    const timestamps = data.points.map((p) => {
      const d = new Date(p.timestamp);
      return timeRange === '1h' || timeRange === '6h'
        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : timeRange === '7d'
        ? `${d.toLocaleDateString([], { month: 'numeric', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });

    // In Mbps for easy viewing on axis
    const inSeries = data.points.map((p) => Number((p.in_bps / 1_000_000).toFixed(2)));
    const outSeries = data.points.map((p) => Number((p.out_bps / 1_000_000).toFixed(2)));

    const inColor = '#10b981'; // emerald green
    const outColor = '#3b82f6'; // royal blue

    return {
      backgroundColor: 'transparent',
      animation: false,
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          lineStyle: { color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)' },
        },
        formatter: (params: Array<{ axisValue: string; seriesName: string; value: number; color: string }>) => {
          if (!params || params.length === 0) return '';
          let tip = `<div style="font-size:12px;font-weight:600;margin-bottom:4px">${params[0].axisValue}</div>`;
          for (const item of params) {
            const bpsVal = item.value * 1_000_000;
            tip += `
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin:2px 0;">
                <span style="color:${item.color};font-weight:600">● ${item.seriesName}</span>
                <span style="font-family:monospace;font-weight:700">${formatBps(bpsVal)}</span>
              </div>
            `;
          }
          return tip;
        },
      },
      legend: {
        data: ['Inbound / Download', 'Outbound / Upload'],
        textStyle: { color: theme.palette.text.secondary },
        top: 0,
        right: 10,
      },
      grid: {
        top: 36,
        left: '2%',
        right: '3%',
        bottom: '8%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: timestamps,
        boundaryGap: false,
        axisLine: { lineStyle: { color: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' } },
        axisLabel: {
          color: theme.palette.text.secondary,
          fontSize: 10,
          hideOverlap: true,
        },
      },
      yAxis: {
        type: 'value',
        name: 'Mbps',
        nameTextStyle: { color: theme.palette.text.secondary, fontSize: 11 },
        splitLine: {
          lineStyle: {
            color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            type: 'dashed',
          },
        },
        axisLabel: {
          color: theme.palette.text.secondary,
          fontSize: 10,
          formatter: (v: number) => `${v.toFixed(1)}M`,
        },
      },
      series: [
        {
          name: 'Inbound / Download',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: inSeries,
          lineStyle: { width: 2, color: inColor },
          itemStyle: { color: inColor },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: alpha(inColor, 0.45) },
                { offset: 1, color: alpha(inColor, 0.02) },
              ],
            },
          },
        },
        {
          name: 'Outbound / Upload',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: outSeries,
          lineStyle: { width: 2, color: outColor },
          itemStyle: { color: outColor },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: alpha(outColor, 0.35) },
                { offset: 1, color: alpha(outColor, 0.02) },
              ],
            },
          },
        },
      ],
    };
  }, [data, isDark, theme, timeRange]);

  return (
    <Card
      sx={{
        borderRadius: 0,
        border: '1.5px solid #000',
        boxShadow: '3px 3px 0px #000',
        overflow: 'hidden',
      }}
    >
      <CardContent sx={{ p: 2 }}>
        {/* Top Control Header */}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          spacing={1.5}
          sx={{ mb: 2, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Box>
            <Stack direction="row" alignItems="center" spacing={1}>
              <ShowChart color="primary" />
              <Typography variant="h6" fontWeight={900} sx={{ letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
                {title || data?.title || 'MRTG Traffic Telemetry'}
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              High-resolution live bandwidth utilization curve with delta octet rate sampling.
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            {showInterfaceSelector && availableInterfaces.length > 0 && (
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel id="mrtg-if-label">Interface</InputLabel>
                <Select
                  labelId="mrtg-if-label"
                  label="Interface"
                  value={currentInterface}
                  onChange={(e) => setSelectedInterface(e.target.value)}
                  sx={{ borderRadius: 0 }}
                >
                  {availableInterfaces.map((ifName) => (
                    <MenuItem key={ifName} value={ifName}>
                      {ifName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <ToggleButtonGroup
              size="small"
              value={timeRange}
              exclusive
              onChange={(_, next) => next && setTimeRange(next)}
              aria-label="time range"
              sx={{
                borderRadius: 0,
                border: '1px solid #000',
                '& .MuiToggleButton-root': { borderRadius: 0 },
              }}
            >
              <ToggleButton value="1h" sx={{ px: 1.25, py: 0.25, fontSize: '0.75rem', fontWeight: 700 }}>
                1H
              </ToggleButton>
              <ToggleButton value="6h" sx={{ px: 1.25, py: 0.25, fontSize: '0.75rem', fontWeight: 700 }}>
                6H
              </ToggleButton>
              <ToggleButton value="24h" sx={{ px: 1.25, py: 0.25, fontSize: '0.75rem', fontWeight: 700 }}>
                24H
              </ToggleButton>
              <ToggleButton value="7d" sx={{ px: 1.25, py: 0.25, fontSize: '0.75rem', fontWeight: 700 }}>
                7D
              </ToggleButton>
            </ToggleButtonGroup>

            <Tooltip title={autoRefresh ? 'Auto-refresh active (15s)' : 'Auto-refresh paused'}>
              <IconButton
                size="small"
                color={autoRefresh ? 'primary' : 'default'}
                onClick={() => setAutoRefresh((prev) => !prev)}
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 0 }}
              >
                <Speed fontSize="small" />
              </IconButton>
            </Tooltip>

            <Tooltip title="Refresh metrics">
              <IconButton
                size="small"
                onClick={() => void refetch()}
                disabled={isFetching}
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 0 }}
              >
                <Refresh fontSize="small" sx={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        {/* 4 KPI Summary Cards */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
            gap: 1.25,
            mb: 2,
          }}
        >
          <Box
            sx={{
              p: 1.25,
              borderRadius: 0,
              bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              border: '1px solid #000',
              boxShadow: '2px 2px 0px #000',
            }}
          >
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5 }}>
              <Speed sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary" fontWeight={800} sx={{ letterSpacing: '0.04em' }}>
                CURRENT RATE
              </Typography>
            </Stack>
            <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: '#10b981' }}>
              ↓ {formatBps(data?.current_in_bps ?? 0)}
            </Typography>
            <Typography variant="caption" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, color: '#3b82f6', display: 'block' }}>
              ↑ {formatBps(data?.current_out_bps ?? 0)}
            </Typography>
          </Box>

          <Box
            sx={{
              p: 1.25,
              borderRadius: 0,
              bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              border: '1px solid #000',
              boxShadow: '2px 2px 0px #000',
            }}
          >
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5 }}>
              <TrendingUp sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary" fontWeight={800} sx={{ letterSpacing: '0.04em' }}>
                PEAK RATE
              </Typography>
            </Stack>
            <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: '#10b981' }}>
              ↓ {formatBps(data?.peak_in_bps ?? 0)}
            </Typography>
            <Typography variant="caption" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, color: '#3b82f6', display: 'block' }}>
              ↑ {formatBps(data?.peak_out_bps ?? 0)}
            </Typography>
          </Box>

          <Box
            sx={{
              p: 1.25,
              borderRadius: 0,
              bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              border: '1px solid #000',
              boxShadow: '2px 2px 0px #000',
            }}
          >
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5 }}>
              <ShowChart sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary" fontWeight={800} sx={{ letterSpacing: '0.04em' }}>
                AVERAGE RATE
              </Typography>
            </Stack>
            <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: '#10b981' }}>
              ↓ {formatBps(data?.avg_in_bps ?? 0)}
            </Typography>
            <Typography variant="caption" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, color: '#3b82f6', display: 'block' }}>
              ↑ {formatBps(data?.avg_out_bps ?? 0)}
            </Typography>
          </Box>

          <Box
            sx={{
              p: 1.25,
              borderRadius: 0,
              bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              border: '1px solid #000',
              boxShadow: '2px 2px 0px #000',
            }}
          >
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5 }}>
              <Storage sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary" fontWeight={800} sx={{ letterSpacing: '0.04em' }}>
                TOTAL TRANSFERRED
              </Typography>
            </Stack>
            <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: '#10b981' }}>
              ↓ {formatTrafficBytes(data?.total_in_bytes ?? 0)}
            </Typography>
            <Typography variant="caption" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, color: '#3b82f6', display: 'block' }}>
              ↑ {formatTrafficBytes(data?.total_out_bytes ?? 0)}
            </Typography>
          </Box>
        </Box>

        {/* Chart Canvas */}
        <Box sx={{ height: 280, position: 'relative' }}>
          {isLoading && !data ? (
            <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
              <CircularProgress size={32} />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                Loading MRTG telemetry points...
              </Typography>
            </Stack>
          ) : chartOption ? (
            <ReactECharts option={chartOption} style={{ height: '100%', width: '100%' }} notMerge />
          ) : (
            <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
              <Typography color="text.secondary">No traffic points recorded for this range.</Typography>
            </Stack>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};
