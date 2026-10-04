import { createContext, useContext } from 'react';

export type ProductBranding = {
  product_name: string;
  short_name: string;
  tagline: string;
  accent_color: string;
  logo_url?: string;
  hero_headline?: string;
  hero_subtitle?: string;
  ticker_text?: string;
  contact_phone?: string;
  contact_whatsapp?: string;
  contact_email?: string;
  contact_address?: string;
  coverage_areas?: string;
  sla_uptime?: string;
  sla_latency?: string;
  updated_at?: string;
};

export type BrandingContextValue = {
  branding: ProductBranding;
  updateBranding: (next: ProductBranding) => void;
};

export const defaultProductBranding: ProductBranding = {
  product_name: 'MWX-ISP',
  short_name: 'MWX',
  tagline: 'ISP Management + RADIUS + Billing',
  accent_color: '#16A34A',
  hero_headline: 'Internet Simetris, Stabil & Bergaransi SLA 99.98%',
  hero_subtitle: 'Solusi jaringan backbone terpercaya untuk perumahan, perkantoran, instansi dan hotspot publik. Didukung multi-homed BGP routing, redundansi GPON optical ring, dan pemantauan NOC aktif 24 jam nonstop.',
  ticker_text: '[ NOC LIVE STATUS ] Semua gateway BGP & GPON OLT beroperasi optimal | Bantuan 24/7 Hotline & WhatsApp Ready | Peering: OpenIXP, CDIX, Cloudflare, Google Edge',
  contact_phone: '+62 21 5550 1234',
  contact_whatsapp: '6281234567890',
  contact_email: 'noc@mwx-isp.net',
  contact_address: 'Cyber Building 1, Lt. 5, Jl. Kuningan Barat No. 8, Jakarta Selatan',
  coverage_areas: 'Jakarta, Tangerang, Bekasi, Depok, Bogor, Bandung, Surabaya',
  sla_uptime: '99.98%',
  sla_latency: '< 5 ms',
};

export const BrandingContext = createContext<BrandingContextValue>({
  branding: defaultProductBranding,
  updateBranding: () => undefined,
});

export const useBranding = () => useContext(BrandingContext);
