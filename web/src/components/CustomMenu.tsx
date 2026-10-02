import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import SensorsOutlinedIcon from '@mui/icons-material/SensorsOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import SettingsSuggestOutlinedIcon from '@mui/icons-material/SettingsSuggestOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import RouterOutlinedIcon from '@mui/icons-material/RouterOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined';
import { Box, Typography, useTheme } from '@mui/material';
import { MenuItemLink, MenuProps, useGetIdentity, useTranslate } from 'react-admin';

const menuItems = [
  { to: '/', labelKey: 'menu.dashboard', icon: <DashboardOutlinedIcon /> },
  { to: '/isp/customers', labelKey: 'menu.customers', sectionKey: 'menu.isp', icon: <PeopleAltOutlinedIcon /> },
  { to: '/isp/packages', labelKey: 'menu.packages', sectionKey: 'menu.services', icon: <Inventory2OutlinedIcon /> },
  { to: '/isp/subscriptions', labelKey: 'menu.subscriptions', icon: <AutorenewOutlinedIcon /> },
  { to: '/isp/invoices', labelKey: 'menu.invoices', sectionKey: 'menu.billing', icon: <ReceiptLongOutlinedIcon /> },
  { to: '/isp/payments', labelKey: 'menu.payments', icon: <ReceiptLongOutlinedIcon /> },
  { to: '/radius/users', labelKey: 'menu.radius_users', sectionKey: 'menu.radius', icon: <PeopleAltOutlinedIcon /> },
  { to: '/radius/profiles', labelKey: 'menu.radius_profiles', icon: <SettingsSuggestOutlinedIcon /> },
  { to: '/radius/online', labelKey: 'menu.online_sessions', icon: <SensorsOutlinedIcon /> },
  { to: '/radius/accounting', labelKey: 'menu.accounting', icon: <ReceiptLongOutlinedIcon /> },
  { to: '/network/nodes', labelKey: 'menu.network_nodes', sectionKey: 'menu.network', icon: <AccountTreeOutlinedIcon /> },
  { to: '/network/nas', labelKey: 'menu.nas_devices', icon: <RouterOutlinedIcon /> },
  { to: '/operations', labelKey: 'menu.operations', sectionKey: 'menu.network', icon: <SensorsOutlinedIcon />, permissions: ['super', 'admin'] },
  { to: '/system/config', labelKey: 'menu.system_config', sectionKey: 'menu.system', icon: <SettingsOutlinedIcon />, permissions: ['super', 'admin'] },
  { to: '/system/operators', labelKey: 'menu.operators', icon: <AdminPanelSettingsOutlinedIcon />, permissions: ['super', 'admin'] },
  { to: '/system/certificate', labelKey: 'menu.certificates', icon: <VerifiedUserOutlinedIcon />, permissions: ['super', 'admin'] },
];

export const CustomMenu = ({ dense, onMenuClick, logout }: MenuProps) => {
  const currentYear = new Date().getFullYear();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { data: identity } = useGetIdentity();
  const translate = useTranslate();

  // Filter menu items by user permissions
  const filteredMenuItems = menuItems.filter(item => {
    if (!item.permissions) return true; // No permissions restriction
    if (!identity?.level) return false; // User is not signed in
    return item.permissions.includes(identity.level); // Check user permissions
  });

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        // Keep the navigation anchored to the MWX green brand.
        background: isDark
          ? 'linear-gradient(180deg, #0e2417 0%, #0a1910 100%)'
          : 'linear-gradient(180deg, #14532d 0%, #166534 100%)',
        color: '#ffffff',
        pt: 0,
        transition: 'background-color 0.3s ease',
      }}
    >
      <Box sx={{ flexGrow: 1, overflowY: 'auto', pt: 1, marginTop: 2 }}>
        {filteredMenuItems.map((item) => (
          <Box key={item.to}>
            {item.sectionKey && <Typography variant="overline" sx={{ display: 'block', px: 2.5, pt: 1.5, color: 'rgba(255,255,255,0.62)' }}>
              {translate(item.sectionKey)}
            </Typography>}
            <MenuItemLink
              to={item.to}
              primaryText={translate(item.labelKey)}
              leftIcon={item.icon}
              dense={dense}
              onClick={onMenuClick}
            />
          </Box>
        ))}
      </Box>

      <Box
        sx={{
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          textAlign: 'center',
          px: 2,
          py: 3,
          fontSize: 12,
          color: 'rgba(255, 255, 255, 0.6)',
          transition: 'all 0.3s ease',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>MWX-ISP</div>
        <div>© {currentYear} ALL RIGHTS RESERVED</div>
        {logout && <Box sx={{ mt: 2 }}>{logout}</Box>}
      </Box>
    </Box>
  );
};
