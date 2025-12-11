import { createTheme, PaletteMode } from '@mui/material/styles';

/**
 * Minimal theme — falls back to MUI defaults. This restores the default
 * react-admin / MUI appearance.
 */
export const createAppTheme = (mode: PaletteMode) =>
  createTheme({
    palette: {
      mode,
    },
  });

export const theme = createAppTheme('light');
export const darkTheme = createAppTheme('dark');
