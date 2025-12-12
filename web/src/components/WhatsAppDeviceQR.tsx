import React, { useEffect, useState } from 'react';
import * as QRCode from 'qrcode';
import { apiRequest } from '../utils/apiClient';

export default function WhatsAppDeviceQR({ deviceId }: { deviceId: number | null }): React.ReactElement {
  const [code, setCode] = useState<string | null>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchQR(): Promise<void> {
      if (!deviceId) {
        setCode(null);
        return;
      }
      try {
        const data = await apiRequest(`/whatsapp/devices/${deviceId}/qr`);
        if (!cancelled) {
          if (data && typeof data === 'object') {
            const obj = data as Record<string, unknown>;
            if (typeof obj['code'] === 'string') {
              setCode(obj['code'] as string);
            } else {
              setCode(null);
            }
          } else {
            setCode(null);
          }
        }
      } catch (e) {
        // likely unauthorized or service error — clear QR
        if (!cancelled) setCode(null);
      }
    }
    fetchQR();
    const id = setInterval(fetchQR, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [deviceId]);

  useEffect(() => {
    if (!code) {
      setImgSrc(null);
      return;
    }
    QRCode.toDataURL(code)
      .then((url: string) => setImgSrc(url))
      .catch(() => setImgSrc(null));
  }, [code]);

  return (
    <div>
      {imgSrc ? (
        <img src={imgSrc} alt="WhatsApp QR" style={{ maxWidth: 300 }} />
      ) : (
        <div>No QR code available for this device. Click Connect to generate one.</div>
      )}
      <div style={{ marginTop: 8 }}>
        <button
          onClick={async () => {
            try {
              await apiRequest(`/whatsapp/app/devices/${deviceId}/connect`, { method: 'POST' });
              // fetch QR once immediately after triggering connect
              const data = await apiRequest(`/whatsapp/devices/${deviceId}/qr`);
              if (data && typeof data === 'object') {
                const obj = data as Record<string, unknown>;
                if (typeof obj['code'] === 'string') setCode(obj['code'] as string);
              }
            } catch (e) {
              // ignore or optionally surface error
            }
          }}
        >
          Connect
        </button>
      </div>
    </div>
  );
}
