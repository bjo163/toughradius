import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import { Box, IconButton, Stack, Tooltip, Typography, useTheme } from '@mui/material';
import { AppBar, AppBarProps, TitlePortal, ToggleThemeButton, useRedirect, useGetIdentity, useTranslate, useSidebarState } from 'react-admin';

export const CustomAppBar = (props: AppBarProps) => {
  const redirect = useRedirect();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { data: identity } = useGetIdentity();
  const translate = useTranslate();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();

  const handleToggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <AppBar
      {...props}
      toolbar={false}
      elevation={0}
      alwaysOn={true}
      sx={{
        backgroundColor: isDark ? '#0e1f15' : '#ffffff',
        color: isDark ? '#f1f5f9' : '#1f2937',
        borderBottom: isDark
          ? '1px solid rgba(74, 222, 128, 0.2)'
          : '1px solid rgba(22, 163, 74, 0.18)',
        boxShadow: isDark 
          ? 'none' 
          : '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        transition: 'all 0.3s ease',
        // 隐藏默认的汉堡菜单button，我们自己添加
        '& .RaAppBar-menuButton': {
          display: 'none',
        },
      }}
    >
      <TitlePortal />
      <Box
        sx={{
          width: '100%',
          px: { xs: 0.75, sm: 2 },
          py: 0.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 0.5,
          '& .MuiIconButton-root': {
            width: { xs: 38, sm: 48 },
            height: { xs: 38, sm: 48 },
          },
        }}
      >
        <Stack direction="row" spacing={{ xs: 0.5, sm: 1 }} alignItems="center" sx={{ minWidth: 0, flexShrink: 1 }}>
          {/* 侧边栏展开/收起button */}
          <Tooltip title={sidebarOpen ? translate('appbar.collapse_menu') : translate('appbar.expand_menu')}>
            <IconButton 
              size="medium"
              onClick={handleToggleSidebar}
              sx={{
                color: isDark ? '#f1f5f9' : '#6b7280',
                transition: 'all 0.2s ease',
                '&:hover': {
                  backgroundColor: isDark 
                    ? 'rgba(255, 255, 255, 0.1)'
                    : 'rgba(0, 0, 0, 0.05)',
                },
              }}
            >
              {sidebarOpen ? <MenuOpenIcon /> : <MenuIcon />}
            </IconButton>
          </Tooltip>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.1 }}>
          <Box sx={{
            width: 30,
            height: 30,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 1.5,
            color: isDark ? '#07130d' : '#ffffff',
            background: isDark ? 'linear-gradient(135deg, #86efac, #22c55e)' : 'linear-gradient(135deg, #22c55e, #15803d)',
            fontSize: 15,
            fontWeight: 900,
            letterSpacing: '-0.08em',
            boxShadow: '0 4px 16px rgba(34, 197, 94, 0.28)',
          }}>M</Box>
          <Typography
            variant="h6" 
            sx={{ 
              fontSize: { xs: 15, sm: 18 },
              fontWeight: 700, 
              whiteSpace: 'nowrap',
              color: isDark ? '#f1f5f9' : '#1f2937',
              letterSpacing: '0.04em',
              background: isDark ? 'linear-gradient(90deg, #f0fdf4, #86efac)' : 'linear-gradient(90deg, #14532d, #16a34a)',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
              MWX-ISP
          </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={{ xs: 0.25, sm: 1 }} alignItems="center" sx={{ flexShrink: 0 }}>
          <Typography aria-label="Interface language" variant="caption" sx={{ color: isDark ? '#86efac' : '#166534', fontWeight: 800, letterSpacing: '0.08em', px: 1 }}>
            EN
          </Typography>

          <Tooltip title={translate('appbar.toggle_theme')}>
            <Box 
              sx={{ 
                '& svg': { 
                  fontSize: 22, 
                  color: isDark ? '#f1f5f9' : '#6b7280',
                },
                '& button': {
                  color: isDark ? '#f1f5f9' : '#6b7280',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    transform: 'rotate(180deg)',
                    backgroundColor: isDark 
                      ? 'rgba(255, 255, 255, 0.1)'
                      : 'rgba(0, 0, 0, 0.05)',
                  },
                },
              }}
            >
              <ToggleThemeButton />
            </Box>
          </Tooltip>
          
          {/* 只对Super admin和Admin显示系统设置button */}
          {identity?.level === 'super' || identity?.level === 'admin' ? (
            <Tooltip title={translate('appbar.system_settings')}>
              <IconButton 
                size="large" 
                onClick={() => redirect('/system/config')}
                sx={{
                  color: isDark ? '#f1f5f9' : '#6b7280',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    transform: 'scale(1.05)',
                    backgroundColor: isDark 
                      ? 'rgba(255, 255, 255, 0.1)'
                      : 'rgba(0, 0, 0, 0.05)',
                  },
                }}
              >
                <SettingsOutlinedIcon />
              </IconButton>
            </Tooltip>
          ) : null}

          {/* Account settingsbutton - 所有User都可见 */}
          <Tooltip title={translate('appbar.account_settings')}>
            <IconButton 
              size="large" 
              onClick={() => redirect('/account/settings')}
              sx={{
                color: isDark ? '#f1f5f9' : '#6b7280',
                transition: 'all 0.2s ease',
                '&:hover': {
                  transform: 'scale(1.05)',
                  backgroundColor: isDark 
                    ? 'rgba(255, 255, 255, 0.1)'
                    : 'rgba(0, 0, 0, 0.05)',
                },
              }}
            >
              <AccountCircleOutlinedIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
    </AppBar>
  );
};
