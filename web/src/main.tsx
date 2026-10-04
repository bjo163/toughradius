import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import App from './App'
import { queryClient } from './providers/queryClient'
import { defaultProductBranding } from './branding/BrandingContext'
import type { ProductBranding } from './branding/BrandingContext'

const loadBranding = async (): Promise<ProductBranding> => {
  try {
    const response = await fetch('/api/v1/public/branding', { headers: { Accept: 'application/json' } });
    if (!response.ok) return defaultProductBranding;
    const payload = await response.json() as { data?: Partial<ProductBranding> };
    return { ...defaultProductBranding, ...(payload.data ?? {}) };
  } catch {
    return defaultProductBranding;
  }
};

void loadBranding().then((branding) => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App initialBranding={branding} />
        {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
      </QueryClientProvider>
    </React.StrictMode>,
  );
});
