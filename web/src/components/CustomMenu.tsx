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
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import { useBranding } from '../branding/BrandingContext';
import { BrandMark } from './BrandMark';

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
  { to: '/system/branding', labelKey: 'menu.branding', icon: <BrushOutlinedIcon />, permissions: ['super', 'admin'] },
  { to: '/system/operators', labelKey: 'menu.operators', icon: <AdminPanelSettingsOutlinedIcon />, permissions: ['super', 'admin'] },
  { to: '/system/certificate', labelKey: 'menu.certificates', icon: <VerifiedUserOutlinedIcon />, permissions: ['super', 'admin'] },
];

export const CustomMenu = ({ dense, onMenuClick, logout }: MenuProps) => {
  const currentYear = new Date().getFullYear();
  const theme = useTheme();
  const { data: identity } = useGetIdentity();
  const translate = useTranslate();
  const { branding } = useBranding();

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
        backgroundColor: theme.palette.background.paper,
        color: theme.palette.text.primary,
        borderRight: '2px solid',
        borderColor: theme.palette.text.primary,
        pt: 0,
        transition: 'background-color 0.3s ease',
      }}
    >
      <Box sx={{ flexGrow: 1, overflowY: 'auto', pt: 1, marginTop: 2 }}>
        {filteredMenuItems.map((item) => (
          <Box key={item.to}>
            {item.sectionKey && <Typography variant="overline" sx={{ display: 'block', px: 2.5, pt: 1.5, color: 'text.secondary', fontFamily: 'monospace', letterSpacing: '0.16em', fontSize: '0.65rem' }}>
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
          borderTop: '2px solid',
          borderColor: theme.palette.divider,
          textAlign: 'center',
          px: 2,
          py: 3,
          fontSize: 12,
          color: theme.palette.text.secondary,
          transition: 'all 0.3s ease',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}><BrandMark size={26} /></Box>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{branding.product_name}</div>
        <div>© {currentYear} ALL RIGHTS RESERVED</div>
        {logout && <Box sx={{ mt: 2 }}>{logout}</Box>}
      </Box>
    </Box>
  );
};
