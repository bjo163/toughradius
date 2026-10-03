import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Typography,
  TextField,
  Switch,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Alert,
  Chip,
  Tooltip,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  Info as InfoIcon,
  Settings as SettingsIcon,
  Security as SecurityIcon,
  Router as RouterIcon,
  Backup as BackupIcon,
  RestorePage as RestoreIcon,
  AccountTree as AccountTreeIcon,
} from '@mui/icons-material';
import { useDataProvider, useNotify, useTranslate, useGetList } from 'react-admin';
import { useApiQuery } from '../hooks/useApiQuery';
import { API_BASE } from '../utils/apiClient';

// Configuration schema type definitions
interface ConfigSchema {
  key: string;
  type: 'string' | 'int' | 'bool' | 'duration' | 'json';
  default: string;
  enum?: string[];
  min?: number;
  max?: number;
  description: string;
  title?: string;
  title_i18n?: string;
  description_i18n?: string;
  group?: string;
}

interface ConfigValue {
  id?: string;
  type: string;
  name: string;
  value: string;
  sort?: number;
  remark?: string;
  updated_at?: string;
}

const SCHEMA_QUERY_KEY = ['system', 'config', 'schemas'] as const;
const SETTINGS_QUERY_KEY = ['system', 'settings'] as const;

// Deterministic display order for config groups. Groups not listed here render
// afterwards in their first-appearance order. Keeps RADIUS general config first
// and the EAP block (plus its collapsed advanced paths) grouped right after it.
const GROUP_ORDER = ['radius', 'eap', 'isp_company', 'isp_billing', 'ldap', 'security', 'system'];

export const SystemConfigPage: React.FC = () => {
  const [configs, setConfigs] = useState<Record<string, ConfigValue>>({});
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['radius', 'eap', 'isp_company', 'isp_billing']);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [pendingRestoreFile, setPendingRestoreFile] = useState<File | null>(null);
  const restoreInputRef = React.useRef<HTMLInputElement>(null);

  const dataProvider = useDataProvider();
  const notify = useNotify();
  const translate = useTranslate();
  const queryClient = useQueryClient();

  // Load managed certificates so the EAP block can offer them as a dropdown
  // selection (radius.EapTlsServerCert / radius.EapTlsClientCa) instead of
  // free-text file paths.
  const { data: certificateList } = useGetList('system/certificate', {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: 'name', order: 'ASC' },
  });
  const serverCertOptions = useMemo(
    () => (certificateList ?? []).filter((c) => c.cert_type === 'server').map((c) => String(c.name)),
    [certificateList],
  );
  const caCertOptions = useMemo(
    () => (certificateList ?? []).filter((c) => c.cert_type === 'ca').map((c) => String(c.name)),
    [certificateList],
  );

  const schemaQuery = useApiQuery<ConfigSchema[]>({
    path: '/system/config/schemas',
    queryKey: SCHEMA_QUERY_KEY,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const settingsQuery = useQuery<ConfigValue[]>({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const response = await dataProvider.getList('system/settings', {
        pagination: { page: 1, perPage: 1000 },
        sort: { field: 'type', order: 'ASC' },
        filter: {},
      });
      return response.data as ConfigValue[];
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }
    const map = settingsQuery.data.reduce<Record<string, ConfigValue>>((acc, config) => {
      const key = `${config.type}.${config.name}`;
      acc[key] = config;
      return acc;
    }, {});
    setConfigs(map);
  }, [settingsQuery.data]);

  const configGroups = useMemo(() => ({
    radius: {
      title: translate('pages.system_config.groups.radius.title'),
      description: translate('pages.system_config.groups.radius.description'),
      icon: <RouterIcon />,
      color: 'info',
    },
    system: {
      title: translate('pages.system_config.groups.system.title'),
      description: translate('pages.system_config.groups.system.description'),
      icon: <SettingsIcon />,
      color: 'success',
    },
    security: {
      title: translate('pages.system_config.groups.security.title'),
      description: translate('pages.system_config.groups.security.description'),
      icon: <SecurityIcon />,
      color: 'error',
    },
    ldap: {
      title: translate('pages.system_config.groups.ldap.title'),
      description: translate('pages.system_config.groups.ldap.description'),
      icon: <AccountTreeIcon />,
      color: 'secondary',
    },
    eap: {
      title: translate('pages.system_config.groups.eap.title'),
      description: translate('pages.system_config.groups.eap.description'),
      icon: <SecurityIcon />,
      color: 'info',
    },
    isp_company: {
      title: translate('pages.system_config.groups.isp_company.title'),
      description: translate('pages.system_config.groups.isp_company.description'),
      icon: <SettingsIcon />,
      color: 'primary',
    },
    isp_billing: {
      title: translate('pages.system_config.groups.isp_billing.title'),
      description: translate('pages.system_config.groups.isp_billing.description'),
      icon: <BackupIcon />,
      color: 'warning',
    },
  }), [translate]);

  const groupedSchemas = useMemo(() => {
    if (!schemaQuery.data) {
      return {} as Record<string, ConfigSchema[]>;
    }
    return schemaQuery.data.reduce<Record<string, ConfigSchema[]>>((groups, schema) => {
      const group = schema.group ?? schema.key.split('.')[0];
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(schema);
      return groups;
    }, {});
  }, [schemaQuery.data]);

  const orderedGroupEntries = useMemo(() => {
    const entries = Object.entries(groupedSchemas);
    return entries.sort(([a], [b]) => {
      const ia = GROUP_ORDER.indexOf(a);
      const ib = GROUP_ORDER.indexOf(b);
      const ra = ia === -1 ? GROUP_ORDER.length : ia;
      const rb = ib === -1 ? GROUP_ORDER.length : ib;
      return ra - rb;
    });
  }, [groupedSchemas]);

  const resolveSchemaTitle = React.useCallback((schema: ConfigSchema) => {
    const fallback = schema.title || schema.key.split('.')[1];
    if (schema.title_i18n) {
      return translate(schema.title_i18n, { _: fallback });
    }
    return fallback;
  }, [translate]);

  const resolveSchemaDescription = React.useCallback((schema: ConfigSchema) => {
    const fallback = schema.description;
    if (schema.description_i18n) {
      return translate(schema.description_i18n, { _: fallback });
    }
    return fallback;
  }, [translate]);

  const isLoading = schemaQuery.isLoading || settingsQuery.isLoading;

  const updateConfigValue = (key: string, value: string) => {
    setConfigs(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        type: key.split('.')[0],
        name: key.split('.')[1],
        value,
      },
    }));
  };

  const getConfigValue = (schema: ConfigSchema): string => configs[schema.key]?.value ?? schema.default;

  const renderConfigInput = (schema: ConfigSchema, label: string, description: string) => {
    const value = getConfigValue(schema);

    // EAP certificate references are selected from the managed certificate store
    // (Certificates page) rather than typed as file paths, satisfying the
    // "select a certificate, don't write a path" requirement.
    if (schema.key === 'radius.EapTlsServerCert' || schema.key === 'radius.EapTlsClientCa') {
      const options = schema.key === 'radius.EapTlsServerCert' ? serverCertOptions : caCertOptions;
      const allOptions = value && !options.includes(value) ? [value, ...options] : options;
      return (
        <FormControl fullWidth>
          <InputLabel>{label}</InputLabel>
          <Select
            value={value}
            label={label}
            onChange={(e) => updateConfigValue(schema.key, e.target.value)}
          >
            <MenuItem value="">
              <em>{translate('pages.system_config.cert_select_none', { _: 'None selected (None)' })}</em>
            </MenuItem>
            {allOptions.map((name) => (
              <MenuItem key={name} value={name}>
                {name}
              </MenuItem>
            ))}
          </Select>
          {description && <FormHelperText>{description}</FormHelperText>}
        </FormControl>
      );
    }

    switch (schema.type) {
      case 'bool':
        return (
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={value === 'true'}
                  onChange={(e) => updateConfigValue(schema.key, e.target.checked ? 'true' : 'false')}
                />
              }
              label={label}
            />
            {description && (
              <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 0.5 }}>
                {description}
              </Typography>
            )}
          </Box>
        );
      case 'string':
        if (schema.enum) {
          return (
            <FormControl fullWidth>
              <InputLabel>{label}</InputLabel>
              <Select
                value={value}
                label={label}
                onChange={(e) => updateConfigValue(schema.key, e.target.value)}
              >
                {schema.enum.map(option => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </Select>
              {description && (
                <FormHelperText>{description}</FormHelperText>
              )}
            </FormControl>
          );
        }
        return (
          <TextField
            fullWidth
            label={label}
            value={value}
            onChange={(e) => updateConfigValue(schema.key, e.target.value)}
            helperText={description || undefined}
          />
        );
      case 'int':
        return (
          <TextField
            fullWidth
            type="number"
            label={label}
            value={value}
            onChange={(e) => updateConfigValue(schema.key, e.target.value)}
            helperText={description || undefined}
            InputProps={{
              inputProps: {
                min: schema.min,
                max: schema.max,
              },
            }}
          />
        );
      default:
        return (
          <TextField
            fullWidth
            label={label}
            value={value}
            onChange={(e) => updateConfigValue(schema.key, e.target.value)}
            helperText={description || undefined}
          />
        );
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (draft: Record<string, ConfigValue>) => {
      const schemaList = schemaQuery.data ?? [];
      await Promise.all(
        schemaList.map(async schema => {
          const [type, name] = schema.key.split('.');
          const currentConfig = draft[schema.key];
          const payload = {
            type,
            name,
            value: currentConfig?.value ?? schema.default,
            sort: currentConfig?.sort ?? 0,
            remark: currentConfig?.remark ?? schema.description,
          };

          if (currentConfig?.id) {
            await dataProvider.update('system/settings', {
              id: currentConfig.id,
              data: payload,
              previousData: currentConfig,
            });
            return;
          }

          const created = await dataProvider.create('system/settings', {
            data: payload,
          });
          const createdData = created.data as ConfigValue;
          draft[schema.key] = {
            ...payload,
            id: createdData?.id,
            updated_at: createdData?.updated_at,
          };
        }),
      );
    },
    onSuccess: () => {
      notify('Configuration saved', { type: 'success' });
      queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'unknown error';
      notify(`Failed to save configuration: ${message}`, { type: 'error' });
    },
  });

  const handleResetConfigs = () => {
    if (!schemaQuery.data?.length) {
      setResetDialogOpen(false);
      return;
    }
    const nextConfigs = { ...configs };
    schemaQuery.data.forEach(schema => {
      nextConfigs[schema.key] = {
        ...nextConfigs[schema.key],
        type: schema.key.split('.')[0],
        name: schema.key.split('.')[1],
        value: schema.default,
      };
    });
    setConfigs(nextConfigs);
    setResetDialogOpen(false);
    notify('Reset to defaults', { type: 'info' });
  };

  const handleGroupToggle = (group: string) => {
    setExpandedGroups(prev =>
      prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group],
    );
  };

  const handleReload = () => {
    queryClient.invalidateQueries({ queryKey: SCHEMA_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/system/backup`, {
        method: 'GET',
        headers: token ? { Authorization: 'Bearer ' + token } : undefined,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || translate('pages.system_config.backup.failed', { _: 'Backup failed' }));
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename=([^;]+)/);
      const filename = match ? match[1].trim() : `toughradius-backup-${Date.now()}.json`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      notify(translate('pages.system_config.backup.success', { _: 'Backup complete' }), { type: 'success' });
      notify(
        translate('pages.system_config.backup.notice', { _: 'The backup contains plaintext passwords and credentials. Store it securely.' }),
        { type: 'info', autoHideDuration: 8000 }
      );
    } catch (error) {
      notify((error as Error).message, { type: 'error' });
    } finally {
      setBackupLoading(false);
    }
  };

  // Confirm before restoring a file because it replaces the current settings.
  const handleRestoreSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (restoreInputRef.current) {
      restoreInputRef.current.value = '';
    }
    if (!file) {
      return;
    }
    setPendingRestoreFile(file);
    setRestoreDialogOpen(true);
  };

  const handleRestoreConfirm = () => {
    const file = pendingRestoreFile;
    setRestoreDialogOpen(false);
    setPendingRestoreFile(null);
    if (file) {
      void doRestore(file);
    }
  };

  const handleRestoreCancel = () => {
    setRestoreDialogOpen(false);
    setPendingRestoreFile(null);
  };

  const doRestore = async (file: File) => {
    setRestoreLoading(true);
    try {
      const formData = new FormData();
      formData.append('upload', file);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/system/restore`, {
        method: 'POST',
        headers: token ? { Authorization: 'Bearer ' + token } : undefined,
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || translate('pages.system_config.restore.failed', { _: 'Restore failed' }));
      }
      notify(translate('pages.system_config.restore.success', { _: 'Restore completed' }), { type: 'success' });
      handleReload();
    } catch (error) {
      notify((error as Error).message, { type: 'error' });
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleSave = () => {
    if (!schemaQuery.data?.length) {
      notify('No configuration changes to save', { type: 'warning' });
      return;
    }
    saveMutation.mutate({ ...configs });
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Page title */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          {translate('pages.system_config.title')}
        </Typography>
        <Typography variant="body1" color="textSecondary">
          {translate('pages.system_config.subtitle')}
        </Typography>
      </Box>

      {/* Action buttons */}
      <Box sx={{ mb: 3 }}>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={saveMutation.isPending || isLoading}
          sx={{ mr: 2 }}
        >
          {saveMutation.isPending ? translate('pages.system_config.saving') : translate('pages.system_config.save')}
        </Button>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => setResetDialogOpen(true)}
          disabled={saveMutation.isPending || isLoading}
          sx={{ mr: 2 }}
        >
          {translate('pages.system_config.reset')}
        </Button>
        <Button
          variant="text"
          startIcon={<RefreshIcon />}
          onClick={handleReload}
          disabled={isLoading}
        >
          {isLoading ? translate('pages.system_config.loading') : translate('pages.system_config.reload')}
        </Button>
        <Button
          variant="outlined"
          startIcon={<BackupIcon />}
          onClick={handleBackup}
          disabled={backupLoading}
          sx={{ ml: 2, mr: 2 }}
        >
          {translate('pages.system_config.backup.button', { _: 'System backup' })}
        </Button>
        <Button
          variant="outlined"
          startIcon={<RestoreIcon />}
          onClick={() => restoreInputRef.current?.click()}
          disabled={restoreLoading}
        >
          {translate('pages.system_config.restore.button', { _: 'System restore' })}
        </Button>
        <input
          ref={restoreInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleRestoreSelect}
        />
      </Box>

      {/* Configuration groups */}
      {!isLoading && (schemaQuery.data?.length ?? 0) > 0 && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            {translate('pages.system_config.info_message')}
          </Alert>

          {orderedGroupEntries.map(([groupKey, groupSchemas]) => {
          const groupConfig = configGroups[groupKey as keyof typeof configGroups] || {
            title: groupKey,
            description: `${groupKey} related settings`,
            icon: <SettingsIcon />,
            color: 'text.secondary',
          };

          const isExpanded = expandedGroups.includes(groupKey);

          return (
            <Accordion 
              key={groupKey} 
              expanded={isExpanded}
              onChange={() => handleGroupToggle(groupKey)}
              sx={{ mb: 2 }}
            >
              <AccordionSummary 
                expandIcon={<ExpandMoreIcon />}
                sx={{ 
                  bgcolor: theme => theme.palette.action.hover,
                  borderLeft: theme => `3px solid ${theme.palette[groupConfig.color as 'primary'].main}`,
                  '&:hover': { bgcolor: theme => theme.palette.action.selected }
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box sx={{ color: theme => theme.palette[groupConfig.color as 'primary'].main }}>
                    {groupConfig.icon}
                  </Box>
                  <Box>
                    <Typography variant="h6" sx={{ color: theme => theme.palette[groupConfig.color as 'primary'].main }}>
                      {groupConfig.title}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      {groupConfig.description} ({groupSchemas.length} {translate('pages.system_config.config_items')})
                    </Typography>
                  </Box>
                </Box>
              </AccordionSummary>
              
              <AccordionDetails>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 3 }}>
                  {groupSchemas.map((schema) => {
                    const schemaTitle = resolveSchemaTitle(schema);
                    const schemaDescription = resolveSchemaDescription(schema);
                    return (
                      <Box key={schema.key} sx={{ mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Typography variant="subtitle2">
                            {schemaTitle}
                          </Typography>
                          <Tooltip title={schemaDescription}>
                            <IconButton size="small">
                              <InfoIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Chip 
                            label={schema.type} 
                            size="small" 
                            variant="outlined"
                            sx={{ ml: 'auto' }}
                          />
                        </Box>
                        {renderConfigInput(schema, schemaTitle, schemaDescription)}
                        {schema.enum && (
                          <Typography variant="caption" color="textSecondary" sx={{ mt: 0.5, display: 'block' }}>
                            {translate('pages.system_config.available_values')}: {schema.enum.join(', ')}
                          </Typography>
                        )}
                        {(schema.min !== undefined || schema.max !== undefined) && (
                          <Typography variant="caption" color="textSecondary" sx={{ mt: 0.5, display: 'block' }}>
                            {translate('pages.system_config.value_range')}: {schema.min !== undefined ? `${translate('pages.system_config.min')} ${schema.min}` : ''} 
                            {schema.min !== undefined && schema.max !== undefined ? ', ' : ''}
                            {schema.max !== undefined ? `${translate('pages.system_config.max')} ${schema.max}` : ''}
                          </Typography>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              </AccordionDetails>
            </Accordion>
          );
        })}
        </Box>
      )}

      {isLoading && (
        <Alert severity="info">
          {translate('pages.system_config.loading_message')}
          <br />
          {translate('pages.system_config.loading_detail')}
        </Alert>
      )}

      {!isLoading && (schemaQuery.data?.length ?? 0) === 0 && (
        <Alert severity="warning">
          {translate('pages.system_config.no_config_warning')}
          <br />
          <strong>Debug information:</strong>
          <br />
          - Configuration schema count: {schemaQuery.data?.length ?? 0}
          <br />
          - Configuration values: {Object.keys(configs).length}
          <br />
          - API endpoint: /api/v1/system/config/schemas
          <br />
          Open the browser console for detailed logs.
        </Alert>
      )}

      {!isLoading && (schemaQuery.data?.length ?? 0) > 0 && (
        <Alert severity="success" sx={{ mb: 2 }}>
          ✓ {translate('pages.system_config.success_message', { schemaCount: schemaQuery.data?.length ?? 0, configCount: Object.keys(configs).length })}
        </Alert>
      )}

      {/* Reset confirmation dialog */}
      <Dialog
      open={resetDialogOpen}
      onClose={() => setResetDialogOpen(false)}
      aria-labelledby="reset-dialog-title"
      aria-describedby="reset-dialog-description"
    >
      <DialogTitle id="reset-dialog-title">
        {translate('pages.system_config.confirm_reset')}
      </DialogTitle>
      <DialogContent>
        <DialogContentText id="reset-dialog-description">
          {translate('pages.system_config.reset_warning')}
          <br />
          <br />
          <strong>Warning:</strong> This action will clear your custom settings for the following configuration values:
          <br />
          {schemaQuery.data?.map(schema => (
            <span key={schema.key}>
              • {schema.key.split('.')[1]} ({schema.description})
              <br />
            </span>
          ))}
          <br />
          {translate('pages.system_config.reset_notice')}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setResetDialogOpen(false)}>
          {translate('pages.system_config.cancel')}
        </Button>
        <Button onClick={handleResetConfigs} color="warning" variant="contained">
          {translate('pages.system_config.confirm')}
        </Button>
      </DialogActions>
    </Dialog>

      {/* System restore confirmation dialog */}
      <Dialog
        open={restoreDialogOpen}
        onClose={handleRestoreCancel}
        aria-labelledby="restore-dialog-title"
        aria-describedby="restore-dialog-description"
      >
        <DialogTitle id="restore-dialog-title">
          {translate('pages.system_config.restore.confirm_title', { _: 'Confirm system restore' })}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="restore-dialog-description">
            {translate('pages.system_config.restore.confirm_warning', {
              _: 'System restore will replace existing settings (nodes, NAS devices, packages, users, system configuration, and operators) with data from the backup. This also replaces the current admin account and password, so you may need to sign in with the backup credentials. Are you sure you want to continue?',
            })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleRestoreCancel}>
            {translate('pages.system_config.restore.cancel', { _: 'Cancel' })}
          </Button>
          <Button onClick={handleRestoreConfirm} color="warning" variant="contained" disabled={restoreLoading}>
            {translate('pages.system_config.restore.confirm', { _: 'Confirm restore' })}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
