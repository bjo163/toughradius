import { useEffect, useState } from 'react';
import { useNotify, useRecordContext } from 'react-admin';
import { Box, Typography, Paper, Button, TextField, MenuItem, Table, TableHead, TableRow, TableCell, TableBody, Chip, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress } from '@mui/material';
import WhatsAppDeviceQR from '../components/WhatsAppDeviceQR';
import { apiRequest, ApiError } from '../utils/apiClient';

interface NodeItem { id: number; name: string }
interface DeviceItem { id: number; node_id: number; phone: string; name: string; jid?: string; status?: string }

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <Box sx={{ textAlign: 'center', p: 4 }}>
      <Typography variant="h6">No devices</Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>Create a WhatsApp device to begin pairing.</Typography>
      <Button variant="contained" onClick={onRefresh}>Refresh</Button>
    </Box>
  );
}

function DeviceRow({ device, onShow }: { device: DeviceItem; onShow: (id: number) => void }) {
  return (
    <TableRow hover>
      <TableCell>{device.id}</TableCell>
      <TableCell>{device.node_id}</TableCell>
      <TableCell>{device.phone}</TableCell>
      <TableCell>{device.name}</TableCell>
      <TableCell style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>{device.jid || '—'}</TableCell>
      <TableCell>
        <Chip label={device.status || 'unknown'} size="small" color={device.status === 'connected' ? 'success' : 'warning'} />
      </TableCell>
      <TableCell><Button size="small" onClick={() => onShow(device.id)}>Show</Button></TableCell>
    </TableRow>
  );
}

export const WhatsAppList = () => {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const notify = useNotify();

  const refresh = async () => {
    setLoading(true);
    try {
      const nd = (await apiRequest('/network/nodes')) as NodeItem[];
      setNodes(nd || []);
      const raw = await apiRequest('/whatsapp/app/devices');
      let dv: DeviceItem[] = [];
      if (raw && typeof raw === 'object') {
        const obj = raw as Record<string, unknown>;
        const maybe = obj['devices'];
        if (Array.isArray(maybe)) dv = maybe as DeviceItem[];
      } else if (Array.isArray(raw)) dv = raw as DeviceItem[];
      setDevices(dv || []);
    } catch (e) {
      setDevices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const onCreate = () => refresh();
  const onShow = (id: number) => setSelected(id);

  return (
    <Box sx={{ p: 3 }}>
      <Paper sx={{ p: 2, maxWidth: 1100 }} elevation={2}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h6">WhatsApp Devices</Typography>
            <Typography variant="body2">Create and manage WhatsApp connections. After creation a QR will be emitted for pairing.</Typography>
          </Box>
        </Box>

        <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: '1fr 360px', gap: 2 }}>
          <Box>
            {/* Create form (simple) */}
            <CreateForm nodes={nodes} onCreated={onCreate} />

            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle1">Configured devices</Typography>
              {devices.length === 0 && !loading ? (
                <EmptyState onRefresh={refresh} />
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>ID</TableCell>
                      <TableCell>Node</TableCell>
                      <TableCell>Phone</TableCell>
                      <TableCell>Name</TableCell>
                      <TableCell>JID</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {devices.map((d) => <DeviceRow key={d.id} device={d} onShow={onShow} />)}
                  </TableBody>
                </Table>
              )}
            </Box>
          </Box>

          <Box>
            <Typography variant="subtitle1">QR / Actions</Typography>
            <Paper sx={{ p: 1, mt: 1 }}>
              {selected ? <WhatsAppDeviceQR deviceId={selected} /> : <Box sx={{ p: 2 }}>Select a device to view QR and pairing actions.</Box>}
              {selected ? (
                <ActionButtons selected={selected} onDone={refresh} notify={notify} />
              ) : null}
            </Paper>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

function CreateForm({ nodes, onCreated }: { nodes: NodeItem[]; onCreated: () => void }) {
  const [nodeId, setNodeId] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const notify = useNotify();

  const submit = async () => {
    try {
      await apiRequest('/whatsapp/devices', { method: 'POST', body: JSON.stringify({ node_id: nodeId, phone, name }) });
      notify('Device created', { type: 'info' });
      setNodeId(''); setPhone(''); setName('');
      onCreated();
    } catch (e: unknown) {
      let msg = 'create failed';
      if (e instanceof ApiError) {
        const body = e.body as Record<string, unknown> | null;
        if (body && typeof body === 'object') {
          if (typeof body.message === 'string') msg = body.message;
          else if (typeof body.error === 'string') msg = body.error;
        } else {
          msg = e.message;
        }
      } else if (e instanceof Error) {
        msg = e.message;
      }
      notify(msg, { type: 'warning' });
    }
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1">Create Device</Typography>
      <Box sx={{ display: 'grid', gap: 1, mt: 1 }}>
        <TextField select label="Node" value={nodeId} onChange={(e) => setNodeId(String(e.target.value))} size="small">
          <MenuItem value="">-- select node --</MenuItem>
          {nodes.map((n) => <MenuItem key={n.id} value={String(n.id)}>{n.name}</MenuItem>)}
        </TextField>
        <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} size="small" />
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} size="small" />
        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
          <Button variant="contained" onClick={submit} disabled={!nodeId || !phone || !name}>Create</Button>
        </Box>
      </Box>
    </Paper>
  );
}

export const WhatsAppShow = ({ record }: { record?: DeviceItem }) => {
  // Minimal show page that displays details and QR
  const rec = useRecordContext<DeviceItem>() || record;
  if (!rec) return <Box sx={{ p: 2 }}>No device</Box>;
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6">{rec.name}</Typography>
      <Typography variant="body2">Phone: {rec.phone}</Typography>
      <Typography variant="body2">JID: {rec.jid || '—'}</Typography>
      <Box sx={{ mt: 2 }}>
        <WhatsAppDeviceQR deviceId={rec.id} />
      </Box>
    </Box>
  );
};

export default WhatsAppList;

function ActionButtons({ selected, onDone, notify }: { selected: number; onDone: () => void; notify: (msg: string, opts?: Record<string, unknown> | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<'provision' | 'persist' | 'disconnect' | 'remove' | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteStore, setDeleteStore] = useState(false);
  const [ackDelete, setAckDelete] = useState(false);

  const start = (a: 'provision' | 'persist' | 'disconnect' | 'remove') => {
    setAction(a);
    setOpen(true);
  };

  const doAction = async () => {
    if (!action) return;
    setBusy(true);
    try {
      if (action === 'provision') {
        await apiRequest(`/whatsapp/app/devices/${selected}/provision`, { method: 'POST' });
        notify('Provision started', { type: 'info' });
      } else if (action === 'persist') {
        await apiRequest(`/whatsapp/app/devices/${selected}/persist`, { method: 'POST' });
        notify('Persist attempted', { type: 'info' });
      } else if (action === 'disconnect') {
        await apiRequest(`/whatsapp/app/devices/${selected}/disconnect`, { method: 'POST' });
        notify('Disconnect requested', { type: 'info' });
      } else if (action === 'remove') {
        const url = deleteStore ? `/whatsapp/app/devices/${selected}/remove?delete_store=1` : `/whatsapp/app/devices/${selected}/remove`;
        await apiRequest(url, { method: 'POST' });
        notify('Remove requested', { type: 'info' });
      }
      setOpen(false);
      setAction(null);
      await onDone();
    } catch (e: unknown) {
      // Attempt to surface structured API error information from the server
      let msg = 'Action failed';
      if (e instanceof ApiError) {
        const body = e.body as Record<string, unknown> | null;
        if (body && typeof body === 'object') {
          if (typeof body.message === 'string' && body.message !== '') {
            msg = body.message;
            if (body.details) {
              msg += `: ${JSON.stringify(body.details)}`;
            }
          } else if (typeof body.error === 'string') {
            msg = body.error;
          } else {
            msg = e.message;
          }
        } else {
          msg = e.message;
        }
      } else if (e instanceof Error) {
        msg = e.message;
      }
      notify(msg, { type: 'warning' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
  <Button size="small" onClick={() => start('provision')}>Provision</Button>
  <Button size="small" onClick={() => start('persist')}>Persist</Button>
  <Button size="small" onClick={() => start('disconnect')}>Disconnect</Button>
  <Button size="small" onClick={() => start('remove')}>Remove</Button>
      <Button size="small" onClick={() => onDone()}>Refresh</Button>

      <Dialog open={open} onClose={() => !busy && setOpen(false)}>
        <DialogTitle>{action === 'provision' ? 'Confirm Provision' : action === 'persist' ? 'Confirm Persist' : action === 'disconnect' ? 'Confirm Disconnect' : 'Confirm Remove'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gap: 1 }}>
            <Typography>{action === 'provision' ? 'Provisioning will create a whatsmeow store device and start pairing. Proceed?' : action === 'persist' ? 'Persist will attempt to persist an in-memory connected client into the sqlstore. Proceed?' : action === 'disconnect' ? 'Disconnect will terminate the in-memory connection for this device (does not delete app record). Proceed?' : 'Remove will delete the application-level device record.'}</Typography>
            {action === 'remove' ? (
              <>
                <Box>
                  <label>
                    <input type="checkbox" checked={deleteStore} onChange={(e) => { setDeleteStore(e.target.checked); if (!e.target.checked) setAckDelete(false); }} />
                    <span style={{ marginLeft: 8 }}>Also delete persisted whatsmeow store device (destructive)</span>
                  </label>
                </Box>
                {deleteStore ? (
                  <Box>
                    <label>
                      <input type="checkbox" checked={ackDelete} onChange={(e) => setAckDelete(e.target.checked)} />
                      <span style={{ marginLeft: 8 }}>I understand this will permanently delete persisted device data and cannot be undone.</span>
                    </label>
                  </Box>
                ) : null}
              </>
            ) : null}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={doAction} disabled={busy || (action === 'remove' && deleteStore && !ackDelete)} variant="contained">
            {busy ? <CircularProgress size={16} /> : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
