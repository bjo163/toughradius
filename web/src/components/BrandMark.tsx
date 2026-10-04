import { Box } from '@mui/material';
import { useBranding } from '../branding/BrandingContext';
import type { ProductBranding } from '../branding/BrandingContext';

type BrandMarkProps = {
  branding?: ProductBranding;
  size?: number;
  logoUrl?: string;
};

export const BrandMark = ({ branding: suppliedBranding, size = 34, logoUrl }: BrandMarkProps) => {
  const { branding: contextBranding } = useBranding();
  const branding = suppliedBranding ?? contextBranding;
  const imageURL = logoUrl ?? branding.logo_url;

  return (
    <Box
      aria-label={branding.product_name}
      sx={{
        width: size,
        height: size,
        flex: '0 0 auto',
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'text.primary',
        borderRadius: 0.5,
        color: 'primary.contrastText',
        bgcolor: imageURL ? 'background.paper' : 'primary.main',
        fontSize: size * (branding.short_name.length > 4 ? 0.26 : 0.42),
        fontWeight: 950,
        letterSpacing: '-0.08em',
        lineHeight: 1,
        boxShadow: (theme) => `2px 2px 0 ${theme.palette.text.primary}`,
      }}
    >
      {imageURL ? <Box component="img" src={imageURL} alt="" sx={{ width: '100%', height: '100%', objectFit: 'contain', p: 0.25 }} /> : branding.short_name}
    </Box>
  );
};
