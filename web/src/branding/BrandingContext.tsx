import { createContext, useContext } from 'react';

export type ProductBranding = {
  product_name: string;
  short_name: string;
  tagline: string;
  accent_color: string;
  logo_url?: string;
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
  accent_color: '#E6FF00',
};

export const BrandingContext = createContext<BrandingContextValue>({
  branding: defaultProductBranding,
  updateBranding: () => undefined,
});

export const useBranding = () => useContext(BrandingContext);
