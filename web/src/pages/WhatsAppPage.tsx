import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, Alert } from '@mui/material';
// import WhatsAppQR from '../components/WhatsAppQR';
import WhatsAppDeviceQR from '../components/WhatsAppDeviceQR';
import { apiRequest } from '../utils/apiClient';

function SendForm({ devices }: { devices: DeviceItem[] }) {
  const [fromJid, setFromJid] = useState('');
  const [toJid, setToJid] = useState('');
  const [text, setText] = useState('');
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!fromJid) {
      // default to first connected device's jid
      const first = devices.find((d) => d.jid && d.status === 'connected');
      if (first) setFromJid(first.jid || '');
    }
    // intentionally only run when devices list changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices]);

  const send = async () => {
    try {
  const body: Record<string, unknown> = { jid: toJid, text };
  if (fromJid) body.from_jid = fromJid;
  await apiRequest('/whatsapp/send', { method: 'POST', body: JSON.stringify(body) });
      setResult('Message sent');
    } catch (e: unknown) {
      let msg = 'send failed';
      if (e instanceof Error) msg = e.message;
      else msg = String(e);
      setResult(msg);
    }
  };

  return (
    <Box sx={{ marginTop: 2 }}>
      <div>
        <label>From device</label>
        <select value={fromJid} onChange={(e) => setFromJid(e.target.value)}>
          <option value="">-- select device --</option>
          {devices
            .filter((d) => d.jid)
            .map((d) => (
              <option key={d.id} value={d.jid}>
                {d.name || d.phone} ({d.jid})
              </option>
            ))}
        </select>
      </div>
      <div style={{ marginTop: 8 }}>
        <label>To JID (e.g. 62812xxxxx@s.whatsapp.net)</label>
        <input style={{ width: '100%' }} value={toJid} onChange={(e) => setToJid(e.target.value)} />
      </div>
      <div style={{ marginTop: 8 }}>
        <label>Message</label>
        <textarea style={{ width: '100%' }} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div style={{ marginTop: 8 }}>
        <button onClick={send} disabled={!toJid || !text}>
          Send
        </button>
      </div>
      {result && <div style={{ marginTop: 8 }}>{result}</div>}
    </Box>
  );
}
interface NodeItem { id: number; name: string }
interface DeviceItem { id: number; node_id: number; phone: string; name: string; jid?: string; status?: string }

function CreateForm({ onCreated, nodes, authRequired }: { onCreated: () => void; nodes: NodeItem[]; authRequired: boolean }) {
  const [nodeId, setNodeId] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);

  const create = async () => {
    try {
      setTouched(true);
      await apiRequest('/whatsapp/devices', { method: 'POST', body: JSON.stringify({ node_id: nodeId, phone, name }) });
      onCreated();
    } catch (e) {
      // apiRequest throws ApiError on non-2xx; surface a friendly message
      let msg = 'create failed';
      if (e instanceof Error) msg = e.message;
      console.error('create device error', msg, e);
    }
  };
  const canCreate = nodeId !== '' && phone.trim() !== '' && name.trim() !== '';

  return (
    <Box sx={{ marginTop: 2 }}>
      <div>
        <label>Node</label>
        <select value={nodeId} onChange={(e) => setNodeId(e.target.value)} disabled={authRequired}>
          <option value="">-- select node --</option>
          {nodes.map((n: NodeItem) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </div>
      <div style={{ marginTop: 8 }}>
        <label>Phone</label>
        <input style={{ width: '100%' }} value={phone} onChange={(e) => setPhone(e.target.value)} disabled={authRequired} />
      </div>
      <div style={{ marginTop: 8 }}>
        <label>Name</label>
        <input style={{ width: '100%' }} value={name} onChange={(e) => setName(e.target.value)} disabled={authRequired} />
      </div>
      <div style={{ marginTop: 8 }}>
        <button onClick={create} disabled={!canCreate || authRequired}>
          Create Device
        </button>
        {!canCreate && touched && (
          <div style={{ color: '#d32f2f', marginTop: 8 }}>Please fill node, phone and name to create a device.</div>
        )}
      </div>
    </Box>
  );
}

export default function WhatsAppPage(): React.ReactElement {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  const refresh = async () => {
    try {
      const nd = (await apiRequest('/network/nodes')) as NodeItem[];
      setNodes(nd || []);
      const raw = await apiRequest('/whatsapp/app/devices');
      // apiRequest returns extracted data. The admin API returns { devices: [...] }
      // so accept either an object with `devices` or the array directly.
      let dv: DeviceItem[] = [];
      if (raw && typeof raw === 'object') {
        const obj = raw as Record<string, unknown>;
        const maybe = obj['devices'];
        if (Array.isArray(maybe)) {
          dv = maybe as DeviceItem[];
        }
      } else if (Array.isArray(raw)) {
        dv = raw as DeviceItem[];
      }
      setDevices(dv || []);
      setAuthRequired(false);
    } catch (e) {
      setNodes([]);
      setDevices([]);
      setAuthRequired(true);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <Box sx={{ padding: 3 }}>
      <Paper sx={{ padding: 2, maxWidth: 900 }}>
        <Typography variant="h6" gutterBottom>
          WhatsApp Devices
        </Typography>
        <Typography variant="body2" gutterBottom>
          Create and manage WhatsApp connections. Create a device (choose node, phone and name). After creation, a QR will be emitted for pairing.
        </Typography>
        <Box sx={{ marginTop: 2, display: 'flex', gap: 2 }}>
          <Box sx={{ flex: 1 }}>
            <CreateForm onCreated={refresh} nodes={nodes} authRequired={authRequired} />
            <Box sx={{ marginTop: 2 }}>
              <Typography variant="body2">
                Pairing notes: after creating a device, a QR code will be emitted for that device — open WhatsApp → Settings → Linked devices (or Multi-device Beta) and scan the QR to pair.
              </Typography>
            </Box>
            {authRequired && (
              <Alert severity="warning" sx={{ marginTop: 2 }}>
                Please log in to manage nodes and devices.
              </Alert>
            )}
            <div style={{ marginTop: 16 }}>
              <h4>Configured devices</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Node</th>
                    <th>Phone</th>
                    <th>Name</th>
                    <th>JID</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d: DeviceItem) => (
                    <tr key={d.id} style={{ borderTop: '1px solid #eee' }}>
                      <td>{d.id}</td>
                      <td>{d.node_id}</td>
                      <td>{d.phone}</td>
                      <td>{d.name}</td>
                      <td>{d.jid}</td>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            borderRadius: 12,
                            fontSize: 12,
                            background: d.status === 'connected' ? '#e8f5e9' : d.status === 'created' ? '#fff8e1' : '#eceff1',
                            color: d.status === 'connected' ? '#2e7d32' : '#f57f17',
                          }}
                        >
                          {d.status || 'unknown'}
                        </span>
                      </td>
                      <td>
                        <button onClick={() => setSelected(d.id)}>Show QR</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Box>
          <Box sx={{ width: 360 }}>
            <Typography variant="subtitle1">QR / Actions</Typography>
            {selected ? <WhatsAppDeviceQR deviceId={selected} /> : <div>Select a device to view QR</div>}
            <div style={{ marginTop: 16 }}>
              <Typography variant="subtitle1">Send message</Typography>
              <SendForm devices={devices} />
            </div>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
