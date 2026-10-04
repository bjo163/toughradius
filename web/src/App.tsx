import { Admin, Resource, CustomRoutes } from 'react-admin';
import { Route } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { dataProvider } from './providers/dataProvider';
import { authProvider } from './providers/authProvider';
import { i18nProvider } from './i18n';
import Dashboard from './pages/Dashboard';
import AccountSettings from './pages/AccountSettings';
import { SystemConfigPage } from './pages/SystemConfigPage';
import OperationsPage from './pages/OperationsPage';
import UserGuidePage from './pages/UserGuidePage';
import BrandingPage from './pages/BrandingPage';
import WebsiteEditorPage from './pages/WebsiteEditorPage';
import { LoginPage } from './pages/LoginPage';
import LandingPage from './pages/LandingPage';
import CustomerPortalPage from './pages/CustomerPortalPage';
import HotspotVouchersPage from './pages/HotspotVouchersPage';
import IPAMPage from './pages/IPAMPage';
import ODPPage from './pages/ODPPage';
import TroubleTicketsPage from './pages/TroubleTicketsPage';
import { CustomLayout, CustomError } from './components';
import { createAppTheme } from './theme';
import { BrandingContext, defaultProductBranding, useBranding } from './branding/BrandingContext';
import type { ProductBranding } from './branding/BrandingContext';
import {
  CustomerList, CustomerCreate, CustomerEdit, CustomerShow,
  PackageList, PackageCreate, PackageEdit,
  SubscriptionList, SubscriptionCreate, SubscriptionShow,
  InvoiceList, InvoiceShow, PaymentList, PaymentCreate, PaymentShow,
} from './resources/isp';

const CustomLoading = () => {
  const { branding } = useBranding();
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        bgcolor: 'background.default',
        color: 'text.primary',
        gap: 2,
      }}
    >
      <CircularProgress size={36} color="primary" />
      <Typography variant="body2" color="text.secondary">Loading {branding.product_name}...</Typography>
    </Box>
  );
};

// 导入资源组件
import {
  RadiusUserList,
  RadiusUserEdit,
  RadiusUserCreate,
  RadiusUserShow,
} from './resources/radiusUsers';
import { OnlineSessionList, OnlineSessionShow } from './resources/onlineSessions';
import { AccountingList, AccountingShow } from './resources/accounting';
import {
  RadiusProfileList,
  RadiusProfileEdit,
  RadiusProfileCreate,
  RadiusProfileShow,
} from './resources/radiusProfiles';
import {
  NASList,
  NASEdit,
  NASCreate,
  NASShow,
} from './resources/nas';
import {
  NodeList,
  NodeEdit,
  NodeCreate,
  NodeShow,
} from './resources/nodes';
import {
  OperatorList,
  OperatorEdit,
  OperatorCreate,
  OperatorShow,
} from './resources/operators';
import {
  CertificateList,
  CertificateEdit,
  CertificateCreate,
  CertificateShow,
  CertificateIcon,
} from './resources/certificates';

type AppProps = { initialBranding?: ProductBranding };

const App = ({ initialBranding = defaultProductBranding }: AppProps) => {
  const [branding, setBranding] = useState(initialBranding);
  const darkTheme = useMemo(() => createAppTheme('dark', branding.accent_color), [branding.accent_color]);
  const lightTheme = useMemo(() => createAppTheme('light', branding.accent_color), [branding.accent_color]);

  useEffect(() => {
    document.title = `${branding.product_name} - ISP Management`;
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) {
      icon = document.createElement('link');
      icon.rel = 'icon';
      document.head.appendChild(icon);
    }
    icon.href = branding.logo_url || '/admin/mwx-isp.svg';
    icon.type = branding.logo_url ? 'image/png' : 'image/svg+xml';
  }, [branding.product_name, branding.logo_url]);

  return (
  <BrandingContext.Provider value={{ branding, updateBranding: setBranding }}>
  <Admin
    dataProvider={dataProvider}
    authProvider={authProvider}
    i18nProvider={i18nProvider}
    dashboard={Dashboard}
    loginPage={LoginPage}
    title={branding.product_name}
    lightTheme={lightTheme}
    darkTheme={darkTheme}
    defaultTheme="dark"
    layout={CustomLayout}
    loading={CustomLoading}
    error={CustomError}
    requireAuth
  >
    <Resource name="isp/customers" list={CustomerList} create={CustomerCreate} edit={CustomerEdit} show={CustomerShow} />
    <Resource name="isp/packages" list={PackageList} create={PackageCreate} edit={PackageEdit} />
    <Resource name="isp/subscriptions" list={SubscriptionList} create={SubscriptionCreate} show={SubscriptionShow} />
    <Resource name="isp/invoices" list={InvoiceList} show={InvoiceShow} />
    <Resource name="isp/payments" list={PaymentList} create={PaymentCreate} show={PaymentShow} />
    {/* RADIUS User management */}
    <Resource
      name="radius/users"
      list={RadiusUserList}
      edit={RadiusUserEdit}
      create={RadiusUserCreate}
      show={RadiusUserShow}
    />

    {/* OnlineSession */}
    <Resource
      name="radius/online"
      list={OnlineSessionList}
      show={OnlineSessionShow}
    />

    {/* Accounting records */}
    <Resource
      name="radius/accounting"
      list={AccountingList}
      show={AccountingShow}
    />

    {/* RADIUS Settings */}
    <Resource
      name="radius/profiles"
      list={RadiusProfileList}
      edit={RadiusProfileEdit}
      create={RadiusProfileCreate}
      show={RadiusProfileShow}
    />

    {/* NAS device management */}
    <Resource
      name="network/nas"
      list={NASList}
      edit={NASEdit}
      create={NASCreate}
      show={NASShow}
    />

    {/* Network node */}
    <Resource
      name="network/nodes"
      list={NodeList}
      edit={NodeEdit}
      create={NodeCreate}
      show={NodeShow}
    />

    {/* Operator management */}
    <Resource
      name="system/operators"
      list={OperatorList}
      edit={OperatorEdit}
      create={OperatorCreate}
      show={OperatorShow}
    />

    {/* Certificate management */}
    <Resource
      name="system/certificate"
      list={CertificateList}
      edit={CertificateEdit}
      create={CertificateCreate}
      show={CertificateShow}
      icon={CertificateIcon}
    />

    {/* Custom routes */}
    <CustomRoutes noLayout>
      <Route path="/" element={<LandingPage />} />
      <Route path="/home" element={<LandingPage />} />
      <Route path="/portal" element={<CustomerPortalPage />} />
    </CustomRoutes>
    <CustomRoutes>
      <Route path="/account/settings" element={<AccountSettings />} />
      <Route path="/system/config" element={<SystemConfigPage />} />
      <Route path="/system/website" element={<WebsiteEditorPage />} />
      <Route path="/system/branding" element={<BrandingPage />} />
      <Route path="/operations" element={<OperationsPage />} />
      <Route path="/isp/vouchers" element={<HotspotVouchersPage />} />
      <Route path="/network/ipam" element={<IPAMPage />} />
      <Route path="/network/odp" element={<ODPPage />} />
      <Route path="/isp/tickets" element={<TroubleTicketsPage />} />
      <Route path="/guide" element={<UserGuidePage />} />
    </CustomRoutes>
    </Admin>
  </BrandingContext.Provider>
  );
};

export default App;
