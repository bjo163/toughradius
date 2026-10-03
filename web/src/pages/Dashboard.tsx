import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import SwapVertOutlinedIcon from '@mui/icons-material/SwapVertOutlined';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import Grid from '@mui/material/GridLegacy';
import {
  Alert,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import ReactECharts from 'echarts-for-react';
import { useMemo } from 'react';
import { useTranslate } from 'react-admin';
import { Link as RouterLink } from 'react-router-dom';
import { useApiQuery } from '../hooks/useApiQuery';
import { GettingStartedCard } from '../components/onboarding/GettingStartedCard';

interface DashboardStats {
  total_users: number;
  online_users: number;
  today_auth_count: number;
  today_acct_count: number;
  total_profiles: number;
  disabled_users: number;
  expired_users: number;
  today_input_gb: number;
  today_output_gb: number;
  auth_trend: DashboardAuthTrendPoint[];
  traffic_24h: DashboardTrafficPoint[];
  profile_distribution: DashboardProfileSlice[];
  ipv6_stats: DashboardIPv6Stats;
}

interface ISPDashboardStats {
  customers: number;
  active_subscriptions: number;
  suspended_subscriptions: number;
  online_users: number;
  invoices_this_month: number;
  payments_this_month: number;
  outstanding: number;
  overdue: number;
}

interface DashboardIPv6Stats {
  online_with_ipv6: number;
  online_with_ipv6_address: number;
  online_with_framed_prefix: number;
  online_with_delegated_prefix: number;
  users_with_static_address: number;
  users_with_delegated_prefix: number;
  adoption_rate: number;
}

interface DashboardAuthTrendPoint {
  date: string;
  count: number;
}

interface DashboardTrafficPoint {
  hour: string;
  upload_gb: number;
  download_gb: number;
}

interface DashboardProfileSlice {
  profile_id: number;
  profile_name: string;
  value: number;
}

const emptyStats: DashboardStats = {
  total_users: 0,
  online_users: 0,
  today_auth_count: 0,
  today_acct_count: 0,
  total_profiles: 0,
  disabled_users: 0,
  expired_users: 0,
  today_input_gb: 0,
  today_output_gb: 0,
  auth_trend: [],
  traffic_24h: [],
  profile_distribution: [],
  ipv6_stats: {
    online_with_ipv6: 0,
    online_with_ipv6_address: 0,
    online_with_framed_prefix: 0,
    online_with_delegated_prefix: 0,
    users_with_static_address: 0,
    users_with_delegated_prefix: 0,
    adoption_rate: 0,
  },
};

const Dashboard = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const translate = useTranslate();
  const { data: statsPayload, isFetching, isError: statsError } = useApiQuery<DashboardStats>({
    path: '/dashboard/stats',
    queryKey: ['dashboard', 'stats'],
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    retry: 1,
    enabled: Boolean(localStorage.getItem('token')),
  });
  const { data: ispStats, isError: ispStatsError } = useApiQuery<ISPDashboardStats>({
    path: '/dashboard/isp-stats',
    queryKey: ['dashboard', 'isp-stats'],
    enabled: Boolean(localStorage.getItem('token')),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    retry: 1,
  });

  const stats = statsPayload ?? emptyStats;

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }), []);
  const hourFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }),
    [],
  );

  const numberFormatter = useMemo(() => new Intl.NumberFormat(), []);

  const onlineRatio =
    stats.total_users > 0 ? Math.min((stats.online_users / stats.total_users) * 100, 100) : 0;

  const authTrendLabels = useMemo(
    () => (stats.auth_trend ?? []).map((point) => {
      const normalized = `${point.date}T00:00:00`;
      const parsed = new Date(normalized);
      return Number.isNaN(parsed.getTime()) ? point.date : dateFormatter.format(parsed);
    }),
    [stats.auth_trend, dateFormatter],
  );

  const authTrendSeries = useMemo(() => (stats.auth_trend ?? []).map((point) => point.count), [stats.auth_trend]);

  const profileSlices = useMemo(() => (
    stats.profile_distribution ?? []
  ).map((item) => ({
    value: item.value,
    name: item.profile_name?.trim() || translate('dashboard.profile_unassigned'),
  })), [stats.profile_distribution, translate]);

  const trafficData = useMemo(() => {
    const formatHourLabel = (value: string) => {
      const normalized = value.replace(' ', 'T');
      const parsed = new Date(normalized);
      return Number.isNaN(parsed.getTime()) ? value : hourFormatter.format(parsed);
    };

    return {
      labels: (stats.traffic_24h ?? []).map((item) => formatHourLabel(item.hour)),
      upload: (stats.traffic_24h ?? []).map((item) => item.upload_gb),
      download: (stats.traffic_24h ?? []).map((item) => item.download_gb),
    };
  }, [stats.traffic_24h, hourFormatter]);

  const statCards = [
    {
      title: translate('dashboard.total_users'),
      value: numberFormatter.format(stats.total_users),
      icon: <PeopleAltOutlinedIcon fontSize="large" />,
      accent: theme.palette.primary.main,
      highlights: [
        { label: translate('dashboard.total_profiles'), value: stats.total_profiles },
        { label: translate('dashboard.disabled'), value: stats.disabled_users },
        { label: translate('dashboard.expired'), value: stats.expired_users },
      ],
    },
    {
      title: translate('dashboard.today_auth'),
      value: numberFormatter.format(stats.today_auth_count),
      icon: <VerifiedUserOutlinedIcon fontSize="large" />,
      accent: theme.palette.secondary.main,
      highlights: [{ label: translate('dashboard.acct_records'), value: stats.today_acct_count }],
    },
    {
      title: translate('dashboard.today_traffic'),
      value: `↑ ${stats.today_input_gb.toFixed(2)} GB`,
      secondaryValue: `↓ ${stats.today_output_gb.toFixed(2)} GB`,
      icon: <SwapVertOutlinedIcon fontSize="large" />,
      accent: '#f97316',
      highlights: [],
    },
  ];

  const ipv6 = stats.ipv6_stats ?? emptyStats.ipv6_stats;
  const ipv6Cards = [
    { label: translate('dashboard.ipv6_online'), value: ipv6.online_with_ipv6, accent: '#4ade80' },
    { label: translate('dashboard.ipv6_address'), value: ipv6.online_with_ipv6_address, accent: '#2dd4bf' },
    { label: translate('dashboard.ipv6_framed_prefix'), value: ipv6.online_with_framed_prefix, accent: '#86efac' },
    { label: translate('dashboard.ipv6_delegated_prefix'), value: ipv6.online_with_delegated_prefix, accent: '#a3e635' },
    { label: translate('dashboard.ipv6_users_static_address'), value: ipv6.users_with_static_address, accent: '#34d399' },
    { label: translate('dashboard.ipv6_users_delegated_prefix'), value: ipv6.users_with_delegated_prefix, accent: '#14b8a6' },
  ];

  const authTrendOption = useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      textStyle: { color: alpha(theme.palette.text.primary, 0.7) },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: authTrendLabels,
        boundaryGap: false,
        axisLine: {
          lineStyle: { color: alpha(theme.palette.text.secondary, 0.25) },
        },
        axisLabel: {
          color: alpha(theme.palette.text.primary, 0.6),
        },
      },
      yAxis: {
        type: 'value',
        splitLine: {
          lineStyle: { color: alpha(theme.palette.text.secondary, 0.15) },
        },
        axisLabel: {
          color: alpha(theme.palette.text.secondary, 0.65),
        },
      },
      series: [
        {
          name: translate('dashboard.auth_trend').replace(/（.*?）/, '').replace(/ \(.*?\)/, ''),
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 10,
          data: authTrendSeries,
          lineStyle: { width: 4 },
          itemStyle: { color: theme.palette.primary.main },
          areaStyle: {
            color: alpha(theme.palette.primary.main, 0.18),
          },
        },
      ],
    }),
    [theme, authTrendLabels, authTrendSeries, translate],
  );

  const onlineDistributionOption = useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
      },
      legend: {
        orient: 'vertical',
        left: 0,
        textStyle: { color: alpha(theme.palette.text.primary, 0.75) },
      },
      series: [
        {
          name: translate('dashboard.online_users'),
          type: 'pie',
          radius: ['35%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 8,
            borderColor: '#fff',
            borderWidth: 2,
          },
          label: {
            formatter: '{b}\n{d}%',
            color: theme.palette.text.primary,
          },
          labelLine: {
            smooth: true,
            length: 20,
          },
          data: profileSlices,
          color: [
            theme.palette.primary.main,
            theme.palette.secondary.main,
            '#34d399',
            '#facc15',
          ],
        },
      ],
    }),
    [theme, profileSlices, translate],
  );

  const trafficOption = useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: {
        data: [translate('dashboard.upload'), translate('dashboard.download')],
        top: 0,
        textStyle: { color: alpha(theme.palette.text.primary, 0.7) },
      },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: trafficData.labels,
        axisLine: {
          lineStyle: { color: alpha(theme.palette.text.secondary, 0.2) },
        },
        axisLabel: {
          color: alpha(theme.palette.text.primary, 0.6),
        },
      },
      yAxis: {
        type: 'value',
        name: 'GB',
        nameTextStyle: {
          color: alpha(theme.palette.text.secondary, 0.7),
        },
        splitLine: {
          lineStyle: { color: alpha(theme.palette.text.secondary, 0.1) },
        },
      },
      series: [
        {
          name: translate('dashboard.upload'),
          type: 'bar',
          stack: 'traffic',
          emphasis: { focus: 'series' },
          data: trafficData.upload,
          color: alpha(theme.palette.secondary.main, 0.7),
        },
        {
          name: translate('dashboard.download'),
          type: 'bar',
          stack: 'traffic',
          emphasis: { focus: 'series' },
          data: trafficData.download,
          color: theme.palette.primary.main,
        },
      ],
    }),
    [theme, trafficData, translate],
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxWidth: 1760, mx: 'auto' }}>
      {isFetching && (
        <LinearProgress
          sx={{
            position: 'sticky',
            top: 0,
            left: 0,
            right: 0,
            borderRadius: 2,
          }}
        />
      )}
      {(statsError || ispStatsError) && <Alert severity="warning">Some dashboard data could not be loaded. Values may be incomplete; retry after checking the server connection.</Alert>}
      <GettingStartedCard />
      <Card
        sx={{
          borderRadius: 2,
          overflow: 'hidden',
          position: 'relative',
          background: isDark
            ? 'radial-gradient(ellipse at 85% 5%, rgba(34,197,94,0.16), transparent 32%), linear-gradient(112deg, #0e1f15 0%, #10271a 58%, #123321 100%)'
            : 'radial-gradient(ellipse at 85% 5%, rgba(34,197,94,0.12), transparent 32%), linear-gradient(112deg, #ffffff, #effaf2)',
          border: `1px solid ${isDark ? 'rgba(74,222,128,0.25)' : 'rgba(22,163,74,0.2)'}`,
          boxShadow: isDark ? '0 16px 42px rgba(0,0,0,0.2), inset 0 1px rgba(255,255,255,0.035)' : '0 12px 30px rgba(22,101,52,0.08)',
          '&::after': {
            content: '""', position: 'absolute', inset: 0, pointerEvents: 'none', opacity: isDark ? 0.28 : 0.18,
            backgroundImage: 'linear-gradient(rgba(134,239,172,0.11) 1px, transparent 1px), linear-gradient(90deg, rgba(134,239,172,0.11) 1px, transparent 1px)',
            backgroundSize: '24px 24px', maskImage: 'linear-gradient(90deg, transparent 42%, black 100%)',
          },
        }}
      >
        <CardContent sx={{ position: 'relative', zIndex: 1, p: { xs: 1.5, md: 2 } }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems="stretch"
            justifyContent="space-between"
          >
            <Box>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.6 }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#4ade80', boxShadow: '0 0 12px #4ade80' }} />
                <Typography variant="overline" sx={{ color: 'primary.light', fontWeight: 800, letterSpacing: '0.15em', lineHeight: 1.3 }}>MWX / NETWORK CONTROL</Typography>
              </Stack>
              <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.025em', mb: 0.4 }}>
                {translate('dashboard.title')}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 520 }}>
                {translate('dashboard.subtitle')}
              </Typography>

            </Box>

            <Box sx={{ minWidth: { xs: '100%', md: 260 }, alignSelf: 'center', p: 1.5, borderLeft: { md: '1px solid rgba(134,239,172,0.22)' }, borderTop: { xs: '1px solid rgba(134,239,172,0.22)', md: 'none' } }}>
              <Typography variant="caption" color="text.secondary">
                {translate('dashboard.online_ratio')}
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 800, my: 0.3, color: 'primary.light', fontVariantNumeric: 'tabular-nums', textShadow: '0 0 28px rgba(74,222,128,0.24)' }}>
                {onlineRatio.toFixed(1)}%
              </Typography>
              <LinearProgress
                variant="determinate"
                value={onlineRatio}
                sx={{
                  height: 6,
                  borderRadius: 999,
                  backgroundColor: alpha(theme.palette.primary.main, 0.15),
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 999,
                  },
                }}
              />
              <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.8 }}>
                <Typography variant="caption" color="text.secondary">
                  {translate('dashboard.online_count')} <Box component="span" sx={{ color: '#86efac', fontWeight: 800 }}>{stats.online_users}</Box>
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {translate('dashboard.total_count')} {stats.total_users}
                </Typography>
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={1}>
        {[
          { label: 'dashboard.customers', value: ispStats?.customers ?? 0, to: '/isp/customers' },
          { label: 'dashboard.active_subscriptions', value: ispStats?.active_subscriptions ?? 0, to: '/isp/subscriptions' },
          { label: 'dashboard.suspended_subscriptions', value: ispStats?.suspended_subscriptions ?? 0, to: '/isp/subscriptions' },
          { label: 'dashboard.invoices_this_month', value: ispStats?.invoices_this_month ?? 0, to: '/isp/invoices' },
          { label: 'dashboard.payments_this_month', value: ispStats?.payments_this_month ?? 0, to: '/isp/payments' },
          { label: 'dashboard.outstanding', value: ispStats?.outstanding ?? 0, to: '/isp/invoices' },
          { label: 'dashboard.overdue', value: ispStats?.overdue ?? 0, to: '/isp/invoices' },
        ].map(({ label, value, to }) => (
          <Grid item xs={6} sm={3} key={label}>
            <Card sx={{ height: '100%', borderRadius: 1.5, position: 'relative', overflow: 'hidden', '&::before': { content: '""', position: 'absolute', inset: '0 auto 0 0', width: 2, bgcolor: label === 'dashboard.overdue' ? 'error.main' : 'primary.main', opacity: 0.8 } }}>
              <CardActionArea component={RouterLink} to={to} sx={{ height: '100%', textAlign: 'left' }}>
              <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={0.5}>
                <Typography variant="caption" color="text.secondary" noWrap>{translate(label as string)}</Typography>
                <FiberManualRecordIcon sx={{ fontSize: 7, color: label === 'dashboard.overdue' ? 'error.main' : 'primary.main', opacity: 0.8 }} />
              </Stack>
              <Typography variant="h6" sx={{ fontWeight: 800, mt: 0.35, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.025em' }}>
                  {label === 'dashboard.outstanding'
                    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
                    : numberFormatter.format(value)}
              </Typography>
              </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={1.25}>
        {statCards.map((card) => (
          <Grid item xs={12} sm={6} lg={4} key={card.title}>
            <Card
              sx={{
                height: '100%',
                borderRadius: 1.5,
                overflow: 'hidden',
                position: 'relative',
                '&::before': { content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${card.accent}, transparent 82%)` },
              }}
            >
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      {card.title}
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800, my: 0.5, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.035em' }}>
                      {card.value}
                    </Typography>
                    {card.secondaryValue && (
                      <Typography variant="h6" sx={{ color: alpha(theme.palette.text.primary, 0.65) }}>
                        {card.secondaryValue}
                      </Typography>
                    )}
                  </Box>
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 1.5,
                      display: 'grid',
                      placeItems: 'center',
                      backgroundColor: alpha(card.accent, 0.15),
                      color: card.accent,
                    }}
                  >
                    <Box sx={{ '& svg': { fontSize: 24 } }}>{card.icon}</Box>
                  </Box>
                </Stack>
                {card.highlights.length > 0 && <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap' }}>
                  {card.highlights.map((item) => <Chip key={item.label} label={`${item.label}: ${item.value}`} size="small" />)}
                </Stack>}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card sx={{ borderRadius: 1.5 }}>
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            spacing={1}
            sx={{ mb: 1 }}
          >
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {translate('dashboard.ipv6_coverage')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {translate('dashboard.ipv6_coverage_desc')}
              </Typography>
            </Box>
            <Chip
              label={`${translate('dashboard.ipv6_adoption')}: ${ipv6.adoption_rate.toFixed(1)}%`}
              color="primary"
              sx={{ fontWeight: 600 }}
            />
          </Stack>
          <Grid container spacing={0.75}>
            {ipv6Cards.map((item) => (
              <Grid item xs={6} md={3} key={item.label}>
                <Box sx={{ p: 1, borderRadius: 1, backgroundColor: alpha(item.accent, 0.075), border: `1px solid ${alpha(item.accent, 0.12)}` }}>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {item.label}
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: item.accent, fontVariantNumeric: 'tabular-nums' }}>
                    {numberFormatter.format(item.value)}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      <Grid container spacing={1.25}>
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 1.5, height: '100%' }}>
            <CardContent sx={{ height: '100%', p: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5 }}>
                {translate('dashboard.auth_trend')}
              </Typography>
              {authTrendSeries.some((value) => value > 0)
                ? <ReactECharts option={authTrendOption} style={{ height: 270 }} />
                : <Box sx={{ height: 270, display: 'grid', placeItems: 'center', color: 'text.secondary' }}>{translate('dashboard.no_auth_data')}</Box>}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 1.5, height: '100%' }}>
            <CardContent sx={{ height: '100%', p: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5 }}>
                {translate('dashboard.online_distribution')}
              </Typography>
              {profileSlices.length > 0
                ? <ReactECharts option={onlineDistributionOption} style={{ height: 270 }} />
                : <Box sx={{ height: 270, display: 'grid', placeItems: 'center', color: 'text.secondary' }}>{translate('dashboard.no_online_data')}</Box>}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card sx={{ borderRadius: 1.5 }}>
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5 }}>
                {translate('dashboard.traffic_stats')}
              </Typography>
              {trafficData.upload.some((value) => value > 0) || trafficData.download.some((value) => value > 0)
                ? <ReactECharts option={trafficOption} style={{ height: 290 }} />
                : <Box sx={{ height: 290, display: 'grid', placeItems: 'center', color: 'text.secondary' }}>{translate('dashboard.no_traffic_data')}</Box>}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

    </Box>
  );
};


export default Dashboard;
