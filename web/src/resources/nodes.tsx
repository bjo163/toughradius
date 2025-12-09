import {
  List,
  Datagrid,
  TextField,
  DateField,
  Edit,
  TextInput,
  Create,
  Show,
  required,
  minLength,
  maxLength,
  useRecordContext,
  Toolbar,
  SaveButton,
  DeleteButton,
  SimpleForm,
  ToolbarProps,
  TopToolbar,
  ListButton,
  CreateButton,
  ExportButton,
  useTranslate,
  useRefresh,
  useNotify,
  useListContext,
  SortButton,
  RaRecord,
  FunctionField
} from 'react-admin';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Stack,
  Chip,
  Avatar,
  IconButton,
  Tooltip,
  Skeleton,
  useTheme,
  useMediaQuery,
  TextField as MuiTextField,
  alpha
} from '@mui/material';
import { useMemo, useCallback, useState, useEffect } from 'react';
import {
  Hub as NodeIcon,
  Label as TagIcon,
  Schedule as TimeIcon,
  Note as NoteIcon,
  ContentCopy as CopyIcon,
  Refresh as RefreshIcon,
  ArrowBack as BackIcon,
  Print as PrintIcon,
  FilterList as FilterIcon,
  Search as SearchIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import {
  ServerPagination,
  ActiveFilters,
  FormSection,
  FieldGrid,
  FieldGridItem,
  formLayoutSx,
  DetailItem,
  DetailSectionCard,
  EmptyValue
} from '../components';

const LARGE_LIST_PER_PAGE = 50;

// ============ Type Definitions ============

interface NetworkNode extends RaRecord {
  name?: string;
  tags?: string;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

// ============ Utility Functions ============

const formatTimestamp = (value?: string | number): string => {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString();
};

// ============ List Loading Skeleton ============

const NodeListSkeleton = ({ rows = 10 }: { rows?: number }) => (
  <Box sx={{ width: '100%' }}>
    {/* Search area skeleton */}
    <Card
      elevation={0}
      sx={{
        mb: 2,
        borderRadius: 2,
        border: theme => `1px solid ${theme.palette.divider}`,
      }}
    >
      <CardContent sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Skeleton variant="rectangular" width={24} height={24} />
          <Skeleton variant="text" width={100} height={24} />
        </Box>
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
            },
          }}
        >
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={40} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      </CardContent>
    </Card>

    {/* Table skeleton */}
    <Card
      elevation={0}
      sx={{
        borderRadius: 2,
        border: theme => `1px solid ${theme.palette.divider}`,
        overflow: 'hidden',
      }}
    >
      {/* Table header */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 1,
          p: 2,
          bgcolor: theme =>
            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
          borderBottom: theme => `1px solid ${theme.palette.divider}`,
        }}
      >
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} variant="text" height={20} width="80%" />
        ))}
      </Box>

      {/* Table rows */}
      {[...Array(rows)].map((_, rowIndex) => (
        <Box
          key={rowIndex}
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 1,
            p: 2,
            borderBottom: theme => `1px solid ${theme.palette.divider}`,
          }}
        >
          {[...Array(5)].map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              variant="text"
              height={18}
              width={`${60 + Math.random() * 30}%`}
            />
          ))}
        </Box>
      ))}

      {/* Pagination skeleton */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 2,
          p: 2,
        }}
      >
        <Skeleton variant="text" width={100} />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Skeleton variant="circular" width={32} height={32} />
          <Skeleton variant="circular" width={32} height={32} />
        </Box>
      </Box>
    </Card>
  </Box>
);

// ============ Empty State Component ============

const NodeEmptyState = () => {
  const translate = useTranslate();
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 8,
        color: 'text.secondary',
      }}
    >
      <NodeIcon sx={{ fontSize: 64, opacity: 0.3, mb: 2 }} />
      <Typography variant="h6" sx={{ opacity: 0.6, mb: 1 }}>
        {translate('resources.network/nodes.empty.title', { _: 'No Nodes' })}
      </Typography>
      <Typography variant="body2" sx={{ opacity: 0.5 }}>
        {translate('resources.network/nodes.empty.description', { _: 'Click the "Create" button to add your first network node' })}
      </Typography>
    </Box>
  );
};

// ============ Search Header Card Component ============

const NodeSearchHeaderCard = () => {
  const translate = useTranslate();
  const { filterValues, setFilters, displayedFilters } = useListContext();
  const [localFilters, setLocalFilters] = useState<Record<string, string>>({});

  useEffect(() => {
    const newLocalFilters: Record<string, string> = {};
    if (filterValues) {
      Object.entries(filterValues).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          newLocalFilters[key] = String(value);
        }
      });
    }
    setLocalFilters(newLocalFilters);
  }, [filterValues]);

  const handleFilterChange = useCallback(
    (field: string, value: string) => {
      setLocalFilters(prev => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleSearch = useCallback(() => {
    const newFilters: Record<string, string> = {};
    Object.entries(localFilters).forEach(([key, value]) => {
      if (value.trim()) {
        newFilters[key] = value.trim();
      }
    });
    setFilters(newFilters, displayedFilters);
  }, [localFilters, setFilters, displayedFilters]);

  const handleClear = useCallback(() => {
    setLocalFilters({});
    setFilters({}, displayedFilters);
  }, [setFilters, displayedFilters]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSearch();
      }
    },
    [handleSearch],
  );

  const filterFields = [
    { key: 'name', label: translate('resources.network/nodes.fields.name', { _: 'Node Name' }) },
    { key: 'tags', label: translate('resources.network/nodes.fields.tags', { _: 'Tags' }) },
  ];

  return (
    <Card
      elevation={0}
      sx={{
        mb: 2,
        borderRadius: 2,
        border: theme => `1px solid ${theme.palette.divider}`,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          px: 2.5,
          py: 1.5,
          bgcolor: theme =>
            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          borderBottom: theme => `1px solid ${theme.palette.divider}`,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <FilterIcon sx={{ color: 'primary.main', fontSize: 20 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
          {translate('resources.network/nodes.filter.title', { _: 'Filter Criteria' })}
        </Typography>
      </Box>

      <CardContent sx={{ p: 2 }}>
        <Box
          sx={{
            display: 'grid',
            gap: 1.5,
            gridTemplateColumns: {
              xs: 'repeat(1, 1fr)',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
            },
            alignItems: 'end',
          }}
        >
          {filterFields.map(field => (
            <MuiTextField
              key={field.key}
              label={field.label}
              value={localFilters[field.key] || ''}
              onChange={e => handleFilterChange(field.key, e.target.value)}
              onKeyPress={handleKeyPress}
              size="small"
              fullWidth
              sx={{
                '& .MuiInputBase-root': {
                  borderRadius: 1.5,
                },
              }}
            />
          ))}

          {/* Action buttons */}
          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
            <Tooltip title={translate('ra.action.clear_filters', { _: 'Clear Filters' })}>
              <IconButton
                onClick={handleClear}
                size="small"
                sx={{
                  bgcolor: theme => alpha(theme.palette.grey[500], 0.1),
                  '&:hover': {
                    bgcolor: theme => alpha(theme.palette.grey[500], 0.2),
                  },
                }}
              >
                <ClearIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={translate('ra.action.search', { _: 'Search' })}>
              <IconButton
                onClick={handleSearch}
                color="primary"
                sx={{
                  bgcolor: theme => alpha(theme.palette.primary.main, 0.1),
                  '&:hover': {
                    bgcolor: theme => alpha(theme.palette.primary.main, 0.2),
                  },
                }}
              >
                <SearchIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

// ============ Enhanced Field Components ============

const NodeNameField = () => {
  const record = useRecordContext<NetworkNode>();
  if (!record) return null;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Avatar
        sx={{
          width: 32,
          height: 32,
          fontSize: '0.85rem',
          fontWeight: 600,
          bgcolor: 'primary.main',
        }}
      >
        {record.name?.charAt(0).toUpperCase() || 'N'}
      </Avatar>
      <Typography
        variant="body2"
        sx={{ fontWeight: 600, color: 'text.primary', lineHeight: 1.3 }}
      >
        {record.name || '-'}
      </Typography>
    </Box>
  );
};

const TagsField = () => {
  const record = useRecordContext<NetworkNode>();
  if (!record || !record.tags) {
    return <Typography variant="body2" color="text.secondary">-</Typography>;
  }

  const tags = record.tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag);
  
  if (tags.length === 0) {
    return <Typography variant="body2" color="text.secondary">-</Typography>;
  }

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {tags.map((tag: string, index: number) => (
        <Chip
          key={index}
          label={tag}
          size="small"
          variant="outlined"
          color="primary"
          sx={{ height: 22, fontSize: '0.75rem' }}
        />
      ))}
    </Box>
  );
};

// ============ Form Toolbar ============

const NodeFormToolbar = (props: ToolbarProps) => (
  <Toolbar {...props}>
    <SaveButton />
    <DeleteButton mutationMode="pessimistic" />
  </Toolbar>
);

// ============ List Actions Bar Component ============

const NodeListActions = () => {
  const translate = useTranslate();
  return (
    <TopToolbar>
      <SortButton
        fields={['created_at', 'name']}
        label={translate('ra.action.sort', { _: 'Sort' })}
      />
      <CreateButton />
      <ExportButton />
    </TopToolbar>
  );
};

// ============ Internal List Content Component ============

const NodeListContent = () => {
  const translate = useTranslate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { data, isLoading, total } = useListContext<NetworkNode>();

  const fieldLabels = useMemo(
    () => ({
      name: translate('resources.network/nodes.fields.name', { _: 'Node Name' }),
      tags: translate('resources.network/nodes.fields.tags', { _: 'Tags' }),
    }),
    [translate],
  );

  if (isLoading) {
    return <NodeListSkeleton />;
  }

  if (!data || data.length === 0) {
    return (
      <Box>
        <NodeSearchHeaderCard />
        <Card
          elevation={0}
          sx={{
            borderRadius: 2,
            border: theme => `1px solid ${theme.palette.divider}`,
          }}
        >
          <NodeEmptyState />
        </Card>
      </Box>
    );
  }

  return (
    <Box>
      {/* Search section */}
      <NodeSearchHeaderCard />

      {/* Active filter tags */}
      <ActiveFilters fieldLabels={fieldLabels} />

      {/* Table container */}
      <Card
        elevation={0}
        sx={{
          borderRadius: 2,
          border: theme => `1px solid ${theme.palette.divider}`,
          overflow: 'hidden',
        }}
      >
        {/* Table statistics */}
        <Box
          sx={{
            px: 2,
            py: 1,
            bgcolor: theme =>
              theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
            borderBottom: theme => `1px solid ${theme.palette.divider}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Total: <strong>{total?.toLocaleString() || 0}</strong> nodes
          </Typography>
        </Box>

        {/* Responsive table */}
        <Box
          sx={{
            overflowX: 'auto',
            '& .RaDatagrid-root': {
              minWidth: isMobile ? 600 : 'auto',
            },
            '& .RaDatagrid-thead': {
              position: 'sticky',
              top: 0,
              zIndex: 1,
              bgcolor: theme =>
                theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
              '& th': {
                fontWeight: 600,
                fontSize: '0.8rem',
                color: 'text.secondary',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                py: 1.5,
                borderBottom: theme => `2px solid ${theme.palette.divider}`,
              },
            },
            '& .RaDatagrid-tbody': {
              '& tr': {
                transition: 'background-color 0.15s ease',
                cursor: 'pointer',
                '&:hover': {
                  bgcolor: theme =>
                    theme.palette.mode === 'dark'
                      ? 'rgba(255,255,255,0.05)'
                      : 'rgba(25, 118, 210, 0.04)',
                },
                '&:nth-of-type(odd)': {
                  bgcolor: theme =>
                    theme.palette.mode === 'dark'
                      ? 'rgba(255,255,255,0.01)'
                      : 'rgba(0,0,0,0.01)',
                },
              },
              '& td': {
                py: 1.5,
                fontSize: '0.875rem',
                borderBottom: theme => `1px solid ${alpha(theme.palette.divider, 0.5)}`,
              },
            },
          }}
        >
          <Datagrid rowClick="show" bulkActionButtons={false}>
            <FunctionField
              source="name"
              label={translate('resources.network/nodes.fields.name', { _: 'Node Name' })}
              render={() => <NodeNameField />}
            />
            <FunctionField
              source="tags"
              label={translate('resources.network/nodes.fields.tags', { _: 'Tags' })}
              render={() => <TagsField />}
            />
            <TextField
              source="remark"
              label={translate('resources.network/nodes.fields.remark', { _: 'Remark' })}
            />
            <DateField
              source="created_at"
              label={translate('resources.network/nodes.fields.created_at', { _: 'Created At' })}
              showTime
            />
            <DateField
              source="updated_at"
              label={translate('resources.network/nodes.fields.updated_at', { _: 'Updated At' })}
              showTime
            />
          </Datagrid>
        </Box>
      </Card>
    </Box>
  );
};

// Network node list
export const NodeList = () => {
  return (
    <List
      actions={<NodeListActions />}
      sort={{ field: 'created_at', order: 'DESC' }}
      perPage={LARGE_LIST_PER_PAGE}
      pagination={<ServerPagination />}
      empty={false}
    >
      <NodeListContent />
    </List>
  );
};

// ============ Edit Page ============

export const NodeEdit = () => {
  const translate = useTranslate();
  
  return (
    <Edit>
      <SimpleForm toolbar={<NodeFormToolbar />} sx={formLayoutSx}>
        <FormSection
          title={translate('resources.network/nodes.sections.basic', { _: 'Basic Information' })}
          description={translate('resources.network/nodes.sections.basic_desc', { _: 'Basic configuration of the node' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <TextInput
                source="id"
                disabled
                label={translate('resources.network/nodes.fields.id', { _: 'Node ID' })}
                helperText={translate('resources.network/nodes.helpers.id', { _: 'Auto-generated unique identifier' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="name"
                label={translate('resources.network/nodes.fields.name', { _: 'Node Name' })}
                validate={[required(), minLength(1), maxLength(100)]}
                helperText={translate('resources.network/nodes.helpers.name', { _: 'Node name with 1-100 characters' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem span={{ xs: 1, sm: 2 }}>
              <TextInput
                source="tags"
                label={translate('resources.network/nodes.fields.tags', { _: 'Tags' })}
                validate={[maxLength(200)]}
                helperText={translate('resources.network/nodes.helpers.tags', { _: 'Multiple tags separated by commas' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.network/nodes.sections.remark', { _: 'Remark Information' })}
          description={translate('resources.network/nodes.sections.remark_desc', { _: 'Additional notes and remarks' })}
        >
          <FieldGrid columns={{ xs: 1 }}>
            <FieldGridItem>
              <TextInput
                source="remark"
                label={translate('resources.network/nodes.fields.remark', { _: 'Remark' })}
                validate={[maxLength(500)]}
                multiline
                minRows={3}
                fullWidth
                size="small"
                helperText={translate('resources.network/nodes.helpers.remark', { _: 'Optional remark, up to 500 characters' })}
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>
      </SimpleForm>
    </Edit>
  );
};

// ============ Create Page ============

export const NodeCreate = () => {
  const translate = useTranslate();
  
  return (
    <Create>
      <SimpleForm sx={formLayoutSx}>
        <FormSection
          title={translate('resources.network/nodes.sections.basic', { _: 'Basic Information' })}
          description={translate('resources.network/nodes.sections.basic_desc', { _: 'Basic configuration of the node' })}
        >
          <FieldGrid columns={{ xs: 1, sm: 2 }}>
            <FieldGridItem>
              <TextInput
                source="name"
                label={translate('resources.network/nodes.fields.name', { _: 'Node Name' })}
                validate={[required(), minLength(1), maxLength(100)]}
                helperText={translate('resources.network/nodes.helpers.name', { _: 'Node name with 1-100 characters' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
            <FieldGridItem>
              <TextInput
                source="tags"
                label={translate('resources.network/nodes.fields.tags', { _: 'Tags' })}
                validate={[maxLength(200)]}
                helperText={translate('resources.network/nodes.helpers.tags', { _: 'Multiple tags separated by commas' })}
                fullWidth
                size="small"
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>

        <FormSection
          title={translate('resources.network/nodes.sections.remark', { _: 'Remark Information' })}
          description={translate('resources.network/nodes.sections.remark_desc', { _: 'Additional notes and remarks' })}
        >
          <FieldGrid columns={{ xs: 1 }}>
            <FieldGridItem>
              <TextInput
                source="remark"
                label={translate('resources.network/nodes.fields.remark', { _: 'Remark' })}
                validate={[maxLength(500)]}
                multiline
                minRows={3}
                fullWidth
                size="small"
                helperText={translate('resources.network/nodes.helpers.remark', { _: 'Optional remark, up to 500 characters' })}
              />
            </FieldGridItem>
          </FieldGrid>
        </FormSection>
      </SimpleForm>
    </Create>
  );
};

// ============ Detail Page Header Card ============

const NodeHeaderCard = () => {
  const record = useRecordContext<NetworkNode>();
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefresh();

  const handleCopy = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    notify(`${label} copied to clipboard`, { type: 'info' });
  }, [notify]);

  const handleRefresh = useCallback(() => {
    refresh();
    notify('Data refreshed', { type: 'info' });
  }, [refresh, notify]);

  if (!record) return null;

  const tags = record.tags?.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag) || [];

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 4,
        background: theme =>
          theme.palette.mode === 'dark'
            ? `linear-gradient(135deg, ${alpha(theme.palette.primary.dark, 0.4)} 0%, ${alpha(theme.palette.info.dark, 0.3)} 100%)`
            : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.info.main, 0.08)} 100%)`,
        border: theme => `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Decorative background */}
      <Box
        sx={{
          position: 'absolute',
          top: -50,
          right: -50,
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: theme => alpha(theme.palette.primary.main, 0.1),
          pointerEvents: 'none',
        }}
      />

      <CardContent sx={{ p: 3, position: 'relative', zIndex: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
          {/* Left: Node information */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar
              sx={{
                width: 64,
                height: 64,
                bgcolor: 'primary.main',
                fontSize: '1.5rem',
                fontWeight: 700,
                boxShadow: theme => `0 4px 14px ${alpha(theme.palette.primary.main, 0.4)}`,
              }}
            >
              {record.name?.charAt(0).toUpperCase() || 'N'}
            </Avatar>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  {record.name || <EmptyValue message="Unknown Node" />}
                </Typography>
              </Box>
              {record.name && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    ID: {record.id}
                  </Typography>
                  <Tooltip title="Copy node name">
                    <IconButton
                      size="small"
                      onClick={() => handleCopy(record.name!, 'Node name')}
                      sx={{ p: 0.5 }}
                    >
                      <CopyIcon sx={{ fontSize: '0.75rem' }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
            </Box>
          </Box>

          {/* Right: Action buttons */}
          <Box className="no-print" sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Print details">
              <IconButton
                onClick={() => window.print()}
                sx={{
                  bgcolor: theme => alpha(theme.palette.info.main, 0.1),
                  '&:hover': {
                    bgcolor: theme => alpha(theme.palette.info.main, 0.2),
                  },
                }}
              >
                <PrintIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Refresh data">
              <IconButton
                onClick={handleRefresh}
                sx={{
                  bgcolor: theme => alpha(theme.palette.primary.main, 0.1),
                  '&:hover': {
                    bgcolor: theme => alpha(theme.palette.primary.main, 0.2),
                  },
                }}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <ListButton
              label=""
              icon={<BackIcon />}
              sx={{
                minWidth: 'auto',
                bgcolor: theme => alpha(theme.palette.grey[500], 0.1),
                '&:hover': {
                  bgcolor: theme => alpha(theme.palette.grey[500], 0.2),
                },
              }}
            />
          </Box>
        </Box>

        {/* Quick info */}
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: {
              xs: 'repeat(1, 1fr)',
              sm: 'repeat(2, 1fr)',
            },
          }}
        >
          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: theme => alpha(theme.palette.background.paper, 0.8),
              backdropFilter: 'blur(8px)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <TagIcon sx={{ fontSize: '1.1rem', color: 'info.main' }} />
              <Typography variant="caption" color="text.secondary">
                {translate('resources.network/nodes.fields.tags', { _: 'Tags' })}
              </Typography>
            </Box>
            {tags.length > 0 ? (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {tags.map((tag: string, index: number) => (
                  <Chip
                    key={index}
                    label={tag}
                    size="small"
                    variant="outlined"
                    color="primary"
                    sx={{ height: 22, fontSize: '0.75rem' }}
                  />
                ))}
              </Box>
            ) : (
              <Typography variant="body2" sx={{ fontWeight: 600 }}>-</Typography>
            )}
          </Box>

          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: theme => alpha(theme.palette.background.paper, 0.8),
              backdropFilter: 'blur(8px)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <TimeIcon sx={{ fontSize: '1.1rem', color: 'success.main' }} />
              <Typography variant="caption" color="text.secondary">
                {translate('resources.network/nodes.fields.created_at', { _: 'Created At' })}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {formatTimestamp(record.created_at)}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

// Print styles
const printStyles = `
  @media print {
    body * {
      visibility: hidden;
    }
    .printable-content, .printable-content * {
      visibility: visible;
    }
    .printable-content {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      padding: 20px !important;
    }
    .no-print {
      display: none !important;
    }
  }
`;

// ============ Node Detail Content ============

const NodeDetails = () => {
  const record = useRecordContext<NetworkNode>();
  const translate = useTranslate();
  
  if (!record) {
    return null;
  }

  return (
    <>
      <style>{printStyles}</style>
      <Box className="printable-content" sx={{ width: '100%', p: { xs: 2, sm: 3, md: 4 } }}>
        <Stack spacing={3}>
          {/* Header card */}
          <NodeHeaderCard />

          {/* Timing information */}
          <DetailSectionCard
            title={translate('resources.network/nodes.sections.timing', { _: 'Timing Information' })}
            description={translate('resources.network/nodes.sections.timing_desc', { _: 'Update time records' })}
            icon={<TimeIcon />}
            color="info"
          >
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: {
                  xs: 'repeat(1, 1fr)',
                },
              }}
            >
              <DetailItem
                label={translate('resources.network/nodes.fields.updated_at', { _: 'Updated At' })}
                value={formatTimestamp(record.updated_at)}
              />
            </Box>
          </DetailSectionCard>

          {/* Remark information */}
          <DetailSectionCard
            title={translate('resources.network/nodes.sections.remark', { _: 'Remark Information' })}
            description={translate('resources.network/nodes.sections.remark_desc', { _: 'Additional notes and remarks' })}
            icon={<NoteIcon />}
            color="primary"
          >
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: theme =>
                  theme.palette.mode === 'dark'
                    ? 'rgba(255, 255, 255, 0.02)'
                    : 'rgba(0, 0, 0, 0.02)',
                border: theme => `1px solid ${theme.palette.divider}`,
                minHeight: 80,
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: record.remark ? 'text.primary' : 'text.disabled',
                  fontStyle: record.remark ? 'normal' : 'italic',
                }}
              >
                {record.remark || translate('resources.network/nodes.empty.no_remark', { _: 'No remark information' })}
              </Typography>
            </Box>
          </DetailSectionCard>
        </Stack>
      </Box>
    </>
  );
};

// Network node details
export const NodeShow = () => {
  return (
    <Show>
      <NodeDetails />
    </Show>
  );
};
