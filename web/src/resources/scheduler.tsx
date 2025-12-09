import {
    List,
    Datagrid,
    TextField,
    DateField,
    Edit,
    Create,
    SimpleForm,
    TextInput,
    NumberInput,
    SelectInput,
    required,
    EditButton,
    DeleteButton,
    TopToolbar,
    CreateButton,
    ExportButton,
    useTranslate,
    Labeled,
    FunctionField,
    RaRecord,
} from 'react-admin';
import { Box, Chip, Typography, Button } from '@mui/material';
import ScheduleIcon from '@mui/icons-material/Schedule';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import { useNotify, useRefresh } from 'react-admin';
import { apiRequest } from '../utils/apiClient';

// List actions
const ListActions = () => (
    <TopToolbar>
        <CreateButton />
        <ExportButton />
    </TopToolbar>
);

// Scheduler List
export const SchedulerList = () => {
    const translate = useTranslate();

    const renderStatus = (record: RaRecord) => {
        const isEnabled = record.status === 'enabled';
        return (
            <Chip
                icon={isEnabled ? <PlayArrowIcon /> : <PauseIcon />}
                label={isEnabled ? translate('scheduler.status.enabled', { _: 'Enabled' }) : translate('scheduler.status.disabled', { _: 'Disabled' })}
                color={isEnabled ? 'success' : 'default'}
                size="small"
            />
        );
    };

    const renderTaskType = (record: RaRecord) => {
        const taskTypeLabels: Record<string, string> = {
            'latency_check': translate('scheduler.taskType.latencyCheck', { _: 'NAS Latency Check' }),
            'session_cleanup': translate('scheduler.taskType.sessionCleanup', { _: 'Session Cleanup' }),
            'accounting_sync': translate('scheduler.taskType.accountingSync', { _: 'Accounting Sync' }),
            'backup': translate('scheduler.taskType.backup', { _: 'Database Backup' }),
            'snmp_model': translate('scheduler.taskType.snmpModel', { _: 'SNMP Model Probe' }),
            'fetch_services': translate('scheduler.taskType.fetchServices', { _: 'Fetch Services' }),
        };

        return (
            <Chip
                icon={<ScheduleIcon />}
                label={taskTypeLabels[record.task_type] || record.task_type}
                variant="outlined"
                size="small"
            />
        );
    };

    const renderInterval = (record: RaRecord) => {
        const seconds = record.interval || 0;
        let display = '';
        if (seconds >= 3600) {
            display = `${Math.floor(seconds / 3600)} ${translate('scheduler.interval.hours', { _: 'hour(s)' })}`;
        } else if (seconds >= 60) {
            display = `${Math.floor(seconds / 60)} ${translate('scheduler.interval.minutes', { _: 'minute(s)' })}`;
        } else {
            display = `${seconds} ${translate('scheduler.interval.seconds', { _: 'second(s)' })}`;
        }

        return <Typography variant="body2">{display}</Typography>;
    };

    // Run now button component
    const RunNowButton = ({ record }: { record?: RaRecord }) => {
        const notify = useNotify();
        const refresh = useRefresh();
        if (!record) return null;

        const handleRun = async () => {
            try {
                await apiRequest(`/network/schedulers/${record.id}/run`, { method: 'POST' });
                notify('Scheduler started', { type: 'info' });
                refresh();
            } catch (err) {
                const message = (err as Error)?.message || 'Run failed';
                notify(message, { type: 'warning' });
            }
        };

        return (
            <Button size="small" variant="outlined" onClick={handleRun}>
                Run now
            </Button>
        );
    };

    return (
        <List
            actions={<ListActions />}
            sort={{ field: 'id', order: 'ASC' }}
            perPage={25}
        >
            <Datagrid bulkActionButtons={false}>
                <TextField source="id" label="ID" />
                <TextField source="name" label={translate('scheduler.fields.name', { _: 'Name' })} />
                <FunctionField 
                    label={translate('scheduler.fields.taskType', { _: 'Task Type' })} 
                    render={renderTaskType} 
                />
                <FunctionField 
                    label={translate('scheduler.fields.interval', { _: 'Interval' })} 
                    render={renderInterval} 
                />
                <FunctionField 
                    label={translate('scheduler.fields.status', { _: 'Status' })} 
                    render={renderStatus} 
                />
                <DateField source="last_run_at" label={translate('scheduler.fields.lastRun', { _: 'Last Run' })} showTime />
                <DateField source="next_run_at" label={translate('scheduler.fields.nextRun', { _: 'Next Run' })} showTime />
                <FunctionField
                    label=""
                    render={(record: RaRecord) => <RunNowButton record={record} />}
                />
                <EditButton />
                <DeleteButton />
            </Datagrid>
        </List>
    );
};

// Task type choices
const taskTypeChoices = [
    { id: 'latency_check', name: 'NAS Latency Check' },
    { id: 'session_cleanup', name: 'Session Cleanup' },
    { id: 'accounting_sync', name: 'Accounting Sync' },
    { id: 'backup', name: 'Database Backup' },
    { id: 'snmp_model', name: 'SNMP Model Probe' },
    { id: 'fetch_services', name: 'Fetch Services' },
];

// Status choices
const statusChoices = [
    { id: 'enabled', name: 'Enabled' },
    { id: 'disabled', name: 'Disabled' },
];

// Scheduler Edit
export const SchedulerEdit = () => {
    const translate = useTranslate();

    return (
        <Edit>
            <SimpleForm>
                <Box display="flex" flexDirection="column" gap={2} width="100%" maxWidth={600}>
                    <Typography variant="h6" gutterBottom>
                        {translate('scheduler.section.basic', { _: 'Basic Information' })}
                    </Typography>

                    <TextInput
                        source="name"
                        label={translate('scheduler.fields.name', { _: 'Name' })}
                        validate={required()}
                        fullWidth
                    />

                    <SelectInput
                        source="task_type"
                        label={translate('scheduler.fields.taskType', { _: 'Task Type' })}
                        choices={taskTypeChoices}
                        validate={required()}
                        fullWidth
                    />

                    <TextInput
                        source="remark"
                        label={translate('scheduler.fields.remark', { _: 'Remark' })}
                        multiline
                        rows={3}
                        fullWidth
                    />

                    <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                        {translate('scheduler.section.schedule', { _: 'Schedule Configuration' })}
                    </Typography>

                    <NumberInput
                        source="interval"
                        label={translate('scheduler.fields.interval', { _: 'Interval (seconds)' })}
                        helperText={translate('scheduler.help.interval', { _: 'Interval in seconds. e.g., 300 for 5 minutes.' })}
                        min={10}
                        fullWidth
                    />

                    <SelectInput
                        source="status"
                        label={translate('scheduler.fields.status', { _: 'Status' })}
                        choices={statusChoices}
                        validate={required()}
                        fullWidth
                    />

                    <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                        {translate('scheduler.section.config', { _: 'Additional Configuration' })}
                    </Typography>

                    <TextInput
                        source="config"
                        label={translate('scheduler.fields.config', { _: 'Configuration (JSON)' })}
                        helperText={translate('scheduler.help.config', { _: 'Optional JSON configuration for the task.' })}
                        multiline
                        rows={4}
                        fullWidth
                    />

                    <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                        {translate('scheduler.section.runtime', { _: 'Runtime Information' })}
                    </Typography>

                    <Labeled label={translate('scheduler.fields.lastRun', { _: 'Last Run' })}>
                        <DateField source="last_run_at" showTime />
                    </Labeled>

                    <Labeled label={translate('scheduler.fields.nextRun', { _: 'Next Run' })}>
                        <DateField source="next_run_at" showTime />
                    </Labeled>
                </Box>
            </SimpleForm>
        </Edit>
    );
};

// Scheduler Create
export const SchedulerCreate = () => {
    const translate = useTranslate();

    return (
        <Create>
            <SimpleForm defaultValues={{ status: 'enabled', interval: 300 }}>
                <Box display="flex" flexDirection="column" gap={2} width="100%" maxWidth={600}>
                    <Typography variant="h6" gutterBottom>
                        {translate('scheduler.section.basic', { _: 'Basic Information' })}
                    </Typography>

                    <TextInput
                        source="name"
                        label={translate('scheduler.fields.name', { _: 'Name' })}
                        validate={required()}
                        fullWidth
                    />

                    <SelectInput
                        source="task_type"
                        label={translate('scheduler.fields.taskType', { _: 'Task Type' })}
                        choices={taskTypeChoices}
                        validate={required()}
                        fullWidth
                    />

                    <TextInput
                        source="remark"
                        label={translate('scheduler.fields.remark', { _: 'Remark' })}
                        multiline
                        rows={3}
                        fullWidth
                    />

                    <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                        {translate('scheduler.section.schedule', { _: 'Schedule Configuration' })}
                    </Typography>

                    <NumberInput
                        source="interval"
                        label={translate('scheduler.fields.interval', { _: 'Interval (seconds)' })}
                        helperText={translate('scheduler.help.interval', { _: 'Interval in seconds. e.g., 300 for 5 minutes.' })}
                        min={10}
                        fullWidth
                    />

                    <SelectInput
                        source="status"
                        label={translate('scheduler.fields.status', { _: 'Status' })}
                        choices={statusChoices}
                        validate={required()}
                        fullWidth
                    />

                    <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                        {translate('scheduler.section.config', { _: 'Additional Configuration' })}
                    </Typography>

                    <TextInput
                        source="config"
                        label={translate('scheduler.fields.config', { _: 'Configuration (JSON)' })}
                        helperText={translate('scheduler.help.config', { _: 'Optional JSON configuration for the task.' })}
                        multiline
                        rows={4}
                        fullWidth
                    />
                </Box>
            </SimpleForm>
        </Create>
    );
};

export default {
    list: SchedulerList,
    edit: SchedulerEdit,
    create: SchedulerCreate,
    icon: ScheduleIcon,
};
