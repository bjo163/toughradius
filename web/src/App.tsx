import { Admin, Resource, CustomRoutes } from 'react-admin';
import { Route } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { dataProvider } from './providers/dataProvider';
import { authProvider } from './providers/authProvider';
import { i18nProvider } from './i18n';
import Dashboard from './pages/Dashboard';
import AccountSettings from './pages/AccountSettings';
import { SystemConfigPage } from './pages/SystemConfigPage';
import OperationsPage from './pages/OperationsPage';
import UserGuidePage from './pages/UserGuidePage';
import { LoginPage } from './pages/LoginPage';
import { CustomLayout, CustomError } from './components';
import { theme, lightTheme } from './theme';
import {
  CustomerList, CustomerCreate, CustomerEdit, CustomerShow,
  PackageList, PackageCreate, PackageEdit,
  SubscriptionList, SubscriptionCreate, SubscriptionShow,
  InvoiceList, InvoiceShow, PaymentList, PaymentCreate, PaymentShow,
} from './resources/isp';

const CustomLoading = () => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        bgcolor: '#07130d',
        color: '#cbd5e1',
        gap: 2,
      }}
    >
      <CircularProgress size={36} sx={{ color: '#4ade80' }} />
      <Typography variant="body2" color="text.secondary">Loading MWX-ISP...</Typography>
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

const App = () => (
  <Admin
    dataProvider={dataProvider}
    authProvider={authProvider}
    i18nProvider={i18nProvider}
    dashboard={Dashboard}
    loginPage={LoginPage}
    title="MWX-ISP"
    theme={theme}
    lightTheme={lightTheme}
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
    <CustomRoutes>
      <Route path="/account/settings" element={<AccountSettings />} />
      <Route path="/system/config" element={<SystemConfigPage />} />
      <Route path="/operations" element={<OperationsPage />} />
      <Route path="/guide" element={<UserGuidePage />} />
    </CustomRoutes>
    </Admin>
);

export default App;
