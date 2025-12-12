import React, { useEffect, useState } from 'react';
import * as QRCode from 'qrcode';
import { apiRequest } from '../utils/apiClient';

export default function WhatsAppQR(): React.ReactElement {
  const [code, setCode] = useState<string | null>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  async function fetchQR(): Promise<void> {
    try {
      const data = await apiRequest<Record<string, unknown>>('/whatsapp/qr');
      const maybe = data as { code?: unknown } | null | undefined;
      const codeVal = maybe && typeof maybe.code === 'string' ? maybe.code : null;
      setCode(codeVal);
    } catch (e) {
      setCode(null);
    }
  }

  useEffect(() => {
    fetchQR();
    const id = setInterval(fetchQR, 3000);
    return () => clearInterval(id);
  }, []);

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
        <div>No QR code available. Click Connect to generate one.</div>
      )}
      <div style={{ marginTop: 8 }}>
        <button onClick={async () => { await apiRequest('/whatsapp/connect', { method: 'POST' }); await fetchQR(); }}>
          Connect
        </button>
      </div>
    </div>
  );
}
