import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { Box, IconButton, Stack, Tooltip, Typography, useTheme } from '@mui/material';
import { AppBar, AppBarProps, TitlePortal, ToggleThemeButton, useRedirect, useGetIdentity, useTranslate, useSidebarState } from 'react-admin';

export const CustomAppBar = (props: AppBarProps) => {
  const redirect = useRedirect();
  const theme = useTheme();
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
        backgroundColor: theme.palette.background.paper,
        color: theme.palette.text.primary,
        borderBottom: '2px solid ' + theme.palette.text.primary,
        boxShadow: '0 2px 0 ' + theme.palette.text.primary,
        transition: 'background-color 0.16s ease, color 0.16s ease',
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
                color: theme.palette.text.primary,
                transition: 'all 0.2s ease',
                '&:hover': {
                  backgroundColor: theme.palette.action.hover,
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
            borderRadius: 0.5,
            border: '1px solid ' + theme.palette.text.primary,
            color: theme.palette.primary.contrastText,
            backgroundColor: theme.palette.primary.main,
            fontSize: 15,
            fontWeight: 900,
            letterSpacing: '-0.08em',
            boxShadow: '2px 2px 0 ' + theme.palette.text.primary,
          }}>M</Box>
          <Typography
            variant="h6" 
            sx={{ 
              fontSize: { xs: 15, sm: 18 },
              fontWeight: 900,
              fontFamily: '"Arial Narrow", "Franklin Gothic Medium", Impact, sans-serif',
              whiteSpace: 'nowrap',
              color: theme.palette.text.primary,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
              MWX-ISP
          </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={{ xs: 0.25, sm: 1 }} alignItems="center" sx={{ flexShrink: 0 }}>
          <Typography aria-label="Interface language" variant="caption" sx={{ color: theme.palette.primary.main, fontWeight: 800, letterSpacing: '0.12em', px: 1 }}>
            EN
          </Typography>

          <Tooltip title="User guide">
            <IconButton size="large" aria-label="Open user guide" onClick={() => redirect('/guide')} sx={{ color: theme.palette.text.secondary }}>
              <HelpOutlineIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title={translate('appbar.toggle_theme')}>
            <Box 
              sx={{ 
                '& svg': { 
                  fontSize: 22, 
                  color: theme.palette.text.secondary,
                },
                '& button': {
                  color: theme.palette.text.secondary,
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    transform: 'rotate(180deg)',
                    backgroundColor: theme.palette.action.hover,
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
                  color: theme.palette.text.secondary,
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    transform: 'scale(1.05)',
                    backgroundColor: theme.palette.action.hover,
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
                color: theme.palette.text.secondary,
                transition: 'all 0.2s ease',
                '&:hover': {
                  transform: 'scale(1.05)',
                  backgroundColor: theme.palette.action.hover,
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
