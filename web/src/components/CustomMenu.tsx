import type { ReactElement } from 'react';
import React from 'react';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import SensorsOutlinedIcon from '@mui/icons-material/SensorsOutlined';
import ContactsOutlinedIcon from '@mui/icons-material/ContactsOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import SettingsSuggestOutlinedIcon from '@mui/icons-material/SettingsSuggestOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import RouterOutlinedIcon from '@mui/icons-material/RouterOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import { Box, Typography, Divider, IconButton, Collapse, useTheme, List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { MenuProps, useGetIdentity, useTranslate } from 'react-admin';
import { Link, useLocation } from 'react-router-dom';

type MenuItem = {
  to: string;
  labelKey: string;
  icon: ReactElement;
  permissions?: string[];
};

type MenuGroup = {
  key: string;
  labelKey: string;
  items: MenuItem[];
};

const menuGroups: MenuGroup[] = [
  {
    key: 'crm',
    labelKey: 'menu.crm',
    items: [
      { to: '/crm/products', labelKey: 'menu.products', icon: <Inventory2OutlinedIcon /> },
      { to: '/radius/users', labelKey: 'menu.radius_users', icon: <PeopleAltOutlinedIcon /> },
      { to: '/radius/profiles', labelKey: 'menu.radius_profiles', icon: <SettingsSuggestOutlinedIcon /> },
    ],
  },
  {
    key: 'isp',
    labelKey: 'menu.isp',
    items: [
      { to: '/network/nodes', labelKey: 'menu.network_nodes', icon: <AccountTreeOutlinedIcon /> },
      { to: '/network/nas', labelKey: 'menu.nas_devices', icon: <RouterOutlinedIcon /> },
      { to: '/network/vendors', labelKey: 'menu.vendors', icon: <StorageOutlinedIcon /> },
      { to: '/network/services', labelKey: 'menu.services', icon: <StorageOutlinedIcon /> },
      { to: '/network/schedulers', labelKey: 'menu.schedulers', icon: <ScheduleOutlinedIcon />, permissions: ['super', 'admin'] },
      { to: '/radius/online', labelKey: 'menu.online_sessions', icon: <SensorsOutlinedIcon /> },
      { to: '/radius/accounting', labelKey: 'menu.accounting', icon: <ReceiptLongOutlinedIcon /> },
    ],
  },
  {
    key: 'system',
    labelKey: 'menu.system',
    items: [
      { to: '/system/config', labelKey: 'menu.system_config', icon: <SettingsOutlinedIcon />, permissions: ['super', 'admin'] },
      { to: '/system/dbms', labelKey: 'menu.dbms', icon: <StorageOutlinedIcon />, permissions: ['super'] },
      { to: '/system/operators', labelKey: 'menu.operators', icon: <AdminPanelSettingsOutlinedIcon />, permissions: ['super', 'admin'] },
      { to: '/system/partners', labelKey: 'menu.partners', icon: <ContactsOutlinedIcon />, permissions: ['super', 'admin'] },
      { to: '/whatsapp/devices', labelKey: 'menu.whatsapp', icon: <ChatBubbleOutlineIcon />, permissions: ['super', 'admin'] },
    ],
  },
];

export default function CustomMenu(props: MenuProps) {
  const translate = useTranslate();
  const { data: identity } = useGetIdentity();
  const { onMenuClick, logout } = props;
  const theme = useTheme();

  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('tough_menu_open_groups');
      if (saved) return JSON.parse(saved);
    } catch (e) { /* ignore read error */ }
    const init: Record<string, boolean> = {};
    menuGroups.forEach((g) => {
      init[g.key] = true; // default expanded
    });
    return init;
  });

  const toggleGroup = (key: string) => {
    setOpenGroups((s) => {
      const next = { ...s, [key]: !s[key] };
      try { localStorage.setItem('tough_menu_open_groups', JSON.stringify(next)); } catch (e) { /* ignore write error */ }
      return next;
    });
  };

  const location = useLocation();
  const pathname = location.pathname || '/';
  const isActive = (to: string) => pathname === to || pathname.startsWith(to + '/') || pathname.startsWith(to + '?');

  const filteredMenuGroups: MenuGroup[] = menuGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item: MenuItem) => {
        if (!item.permissions) return true;
        if (!identity?.level) return false;
        return item.permissions.includes(identity.level);
      }),
    }))
    .filter((g) => g.items && g.items.length > 0) as MenuGroup[];

  const currentYear = new Date().getFullYear();
  const textColor = theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.95)' : '#111827';
  const mutedColor = theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.72)' : '#4B5563';
  const dividerColor = theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', color: textColor }}>
      {/* compact logo to avoid duplicate full title (main title is in AppBar) */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ width: 28, height: 28, borderRadius: 1, bgcolor: theme.palette.primary.main, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 12 }}>TR</Typography>
        </Box>
        <Typography sx={{ fontWeight: 600, fontSize: 13, color: mutedColor }}>TOUGHRADIUS</Typography>
      </Box>

      <Box
        sx={{
          flexGrow: 1,
          overflowY: 'auto',
          pt: 1,
          marginTop: 2,
          color: textColor,
          // force high contrast for links/icons in light mode
          '& a, & .MuiListItemText-root, & .MuiListItemIcon-root': {
            color: textColor + ' !important',
            opacity: 1 + ' !important',
          },
        }}
      >
        {/* Dashboard */}
        <List component="nav" disablePadding>
          <ListItemButton
            component={Link}
            to={`/`}
            onClick={() => onMenuClick?.()}
            sx={{
              px: 2,
              borderRadius: 1,
              mb: 1,
              bgcolor: isActive('/') ? theme.palette.action.selected : 'transparent',
            }}
          >
            <ListItemIcon sx={{ color: textColor, minWidth: 40 }}><DashboardOutlinedIcon /></ListItemIcon>
            <ListItemText primary={translate('menu.dashboard')} primaryTypographyProps={{ color: textColor }} />
          </ListItemButton>
        </List>

        {filteredMenuGroups.map((group) => (
          <Box key={group.key} sx={{ mt: 1, px: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1, cursor: 'pointer' }} onClick={() => toggleGroup(group.key)}>
              <Typography variant="caption" sx={{ color: mutedColor }}>
                {translate(group.labelKey)}
              </Typography>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); toggleGroup(group.key); }}>
                {openGroups[group.key] ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
            </Box>

            <Collapse in={!!openGroups[group.key]} timeout="auto" unmountOnExit>
              <List component="nav" disablePadding>
                {group.items.map((item) => (
                  <ListItemButton
                    key={item.to}
                    component={Link}
                    to={item.to}
                    onClick={() => onMenuClick?.()}
                    sx={{
                      pl: 3,
                      borderRadius: 1,
                      my: 0.5,
                      bgcolor: isActive(item.to) ? theme.palette.action.selected : 'transparent',
                    }}
                  >
                    <ListItemIcon sx={{ color: textColor, minWidth: 40 }}>{item.icon}</ListItemIcon>
                    <ListItemText primary={translate(item.labelKey)} primaryTypographyProps={{ color: textColor }} />
                  </ListItemButton>
                ))}
              </List>
            </Collapse>

            <Divider sx={{ my: 1, borderColor: dividerColor }} />
          </Box>
        ))}
      </Box>

      <Box
        sx={{
          borderTop: `1px solid ${dividerColor}`,
          textAlign: 'center',
          px: 2,
          py: 3,
          fontSize: 12,
          color: mutedColor,
          transition: 'all 0.3s ease',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>TOUGHRADIUS v9</div>
        <div>© {currentYear} ALL RIGHTS RESERVED</div>
        {logout && <Box sx={{ mt: 2 }}>{logout}</Box>}
      </Box>
    </Box>
  );
}
