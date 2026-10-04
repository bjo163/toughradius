import { alpha, createTheme, PaletteMode, darken, getContrastRatio, lighten } from '@mui/material/styles';

// "Manga Enterprise": warm paper/ink surfaces, ink-line borders and hard offset shadows
// (the manga panel language), applied with enterprise discipline: compact density,
// one brand accent, semantic status colors reserved for operational state, no rotation.
const lightPalette = {
  primary: { main: '#5d7000', light: '#7d9400', dark: '#485600', contrastText: '#ffffff' },
  secondary: { main: '#b01355', light: '#d43a78', dark: '#8c0e43', contrastText: '#ffffff' },
  success: { main: '#13783f', light: '#24a862', dark: '#0d6538' },
  warning: { main: '#925500', light: '#c27a12', dark: '#744300' },
  error: { main: '#b42318', light: '#d9483d', dark: '#8f1b12' },
  info: { main: '#087e8b', light: '#10a6b5', dark: '#075d68' },
  background: { default: '#f3efe4', paper: '#fffdf6' },
  text: { primary: '#0d0d0d', secondary: '#4a4943', disabled: '#8a877d' },
  divider: 'rgba(13, 13, 13, 0.16)',
};

const darkPalette = {
  primary: { main: '#22c55e', light: '#4ade80', dark: '#16a34a', contrastText: '#0d0d0d' },
  secondary: { main: '#ff2e88', light: '#ff70ad', dark: '#d51a69', contrastText: '#ffffff' },
  success: { main: '#62d990', light: '#8ae8ad', dark: '#32b76b' },
  warning: { main: '#fbbf24', light: '#fcd34d', dark: '#f59e0b' },
  error: { main: '#f87171', light: '#fca5a5', dark: '#ef4444' },
  info: { main: '#55cbd5', light: '#84e0e7', dark: '#2daab5' },
  background: { default: '#0e0e10', paper: '#17171a' },
  text: { primary: '#f3efe4', secondary: '#b5b1a5', disabled: '#6f6c65' },
  divider: 'rgba(243, 239, 228, 0.12)',
};

/** Stable chart colors remain distinct from brand and operational status colors. */
export const dataSeriesColors = ['#4ade80', '#ff2e88', '#55cbd5', '#fbbf24', '#60a5fa', '#a78bfa'];
/** Higher-contrast series colors for paper surfaces in light mode. */
export const lightDataSeriesColors = ['#5d7000', '#b01355', '#087e8b', '#925500', '#2563a8', '#6841a5'];

/** Shared font stacks: Inter for UI, condensed display for panel titles, mono for IPs/IDs. */
export const fontStacks = {
  sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Arial', 'sans-serif'].join(','),
  display: ['"Arial Narrow"', '"Franklin Gothic Medium"', 'Impact', 'sans-serif'].join(','),
  mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'].join(','),
};

const accessibleAccent = (accent: string, mode: PaletteMode) => {
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) return mode === 'dark' ? darkPalette.primary.main : lightPalette.primary.main;
  const surface = mode === 'dark' ? darkPalette.background.paper : lightPalette.background.paper;
  let candidate = accent;
  for (let attempt = 0; attempt < 24 && getContrastRatio(candidate, surface) < 4.5; attempt += 1) {
    candidate = mode === 'dark' ? lighten(candidate, 0.08) : darken(candidate, 0.08);
  }
  return getContrastRatio(candidate, surface) >= 4.5 ? candidate : mode === 'dark' ? '#FFFFFF' : '#111111';
};

/**
 * Create a theme configuration.
 * @param mode Theme mode: 'light' | 'dark'
 */
export const createAppTheme = (mode: PaletteMode, accentColor?: string) => {
  const isDark = mode === 'dark';
  const basePalette = isDark ? darkPalette : lightPalette;
  const brand = accentColor ? accessibleAccent(accentColor, mode) : basePalette.primary.main;
  const palette = accentColor ? {
    ...basePalette,
    primary: {
      ...basePalette.primary,
      main: brand,
      light: lighten(brand, 0.18),
      dark: darken(brand, 0.16),
      contrastText: getContrastRatio(brand, '#000000') >= getContrastRatio(brand, '#FFFFFF') ? '#000000' : '#FFFFFF',
    },
  } : basePalette;

  const ink = palette.text.primary;
  const inkLine = alpha(ink, isDark ? 0.28 : 0.7); // panel outline
  const inkShadow = (n: number) => `${n}px ${n}px 0 ${alpha(ink, isDark ? 0.38 : 0.85)}`;
  const headerBg = isDark ? '#1f1f23' : '#e9e4d6';
  const hoverBg = alpha(palette.primary.main, isDark ? 0.08 : 0.07);
  const halftone = (o: number, s = 6) => ({
    backgroundImage: `radial-gradient(${alpha(ink, o)} 0.7px, transparent 0.9px)`,
    backgroundSize: `${s}px ${s}px`,
  });

  return createTheme({
    palette: { mode, ...palette, action: { hover: hoverBg, selected: alpha(palette.primary.main, 0.14) } },
    shape: { borderRadius: 3 },
    typography: {
      fontFamily: fontStacks.sans,
      fontSize: 13,
      h1: { fontFamily: fontStacks.display, fontWeight: 900, fontSize: '1.875rem', lineHeight: 1.15, letterSpacing: '0.03em', textTransform: 'uppercase' },
      h2: { fontFamily: fontStacks.display, fontWeight: 900, fontSize: '1.625rem', lineHeight: 1.2, letterSpacing: '0.03em', textTransform: 'uppercase' },
      h3: { fontFamily: fontStacks.display, fontWeight: 900, fontSize: '1.5rem', lineHeight: 1.2, letterSpacing: '0.03em', textTransform: 'uppercase' },
      h4: { fontFamily: fontStacks.display, fontWeight: 900, fontSize: '1.375rem', lineHeight: 1.2, letterSpacing: '0.035em', textTransform: 'uppercase' },
      h5: { fontWeight: 700, fontSize: '1.0625rem', lineHeight: 1.35 },
      h6: { fontWeight: 700, fontSize: '0.9375rem', lineHeight: 1.4 },
      subtitle1: { fontWeight: 600, fontSize: '0.875rem' },
      subtitle2: { fontWeight: 600, fontSize: '0.8125rem' },
      body1: { fontSize: '0.875rem' },
      body2: { fontSize: '0.8125rem' },
      caption: { fontSize: '0.75rem' },
      overline: { fontFamily: fontStacks.mono, fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.14em', lineHeight: 1.6 },
      button: { fontWeight: 700, textTransform: 'none', fontSize: '0.8125rem' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: palette.background.default,
            color: ink,
            fontFeatureSettings: '"tnum"',
            WebkitFontSmoothing: 'antialiased',
            ...halftone(isDark ? 0.04 : 0.055, 8),
            backgroundAttachment: 'fixed',
          },
          '#root': { backgroundColor: 'transparent' },
          'code, kbd, .mono': { fontFamily: fontStacks.mono },
          '*::-webkit-scrollbar': { width: '8px', height: '8px' },
          '*::-webkit-scrollbar-track': { background: 'transparent' },
          '*::-webkit-scrollbar-thumb': { background: isDark ? '#3a3a40' : '#a8a497', borderRadius: '2px', '&:hover': { background: palette.primary.main } },
          '::selection': { backgroundColor: palette.primary.main, color: palette.primary.contrastText },
          ':focus-visible': { outline: '2px solid ' + palette.primary.main, outlineOffset: 2 },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': { animationDuration: '0.01ms !important', transitionDuration: '0.01ms !important' },
          },
          '.RaMenuItemLink-icon': { color: palette.text.secondary + ' !important' },
          '.RaMenuItemLink-active .RaMenuItemLink-icon': { color: palette.primary.contrastText + ' !important' },
        },
      },
      // Panels: ink outline + hard shadow, static (no hover lift) for a calm, dense console.
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: 'none', border: '1px solid ' + inkLine, borderRadius: 3 },
          elevation0: { boxShadow: inkShadow(2) },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { border: '1px solid ' + inkLine, borderRadius: 3, boxShadow: inkShadow(2) } },
      },
      MuiCardContent: { styleOverrides: { root: { padding: 14, '&:last-child': { paddingBottom: 14 } } } },
      MuiCardHeader: {
        styleOverrides: {
          root: { padding: '8px 14px', borderBottom: '1px solid ' + inkLine, backgroundColor: headerBg, ...halftone(isDark ? 0.05 : 0.07, 5) },
          title: { fontFamily: fontStacks.display, fontWeight: 900, fontSize: '0.875rem', letterSpacing: '0.06em', textTransform: 'uppercase' },
          subheader: { fontSize: '0.72rem' },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true, size: 'small' },
        styleOverrides: {
          root: { borderRadius: 3, paddingInline: 12, minHeight: 30, transition: 'transform .1s ease, box-shadow .1s ease' },
          contained: {
            border: '1px solid ' + ink,
            boxShadow: inkShadow(2),
            '&:hover': { boxShadow: inkShadow(3), transform: 'translate(-1px,-1px)' },
            '&:active': { boxShadow: 'none', transform: 'translate(2px,2px)' },
          },
          outlined: { borderColor: inkLine, color: ink, '&:hover': { borderColor: ink, backgroundColor: hoverBg } },
        },
      },
      MuiIconButton: { defaultProps: { size: 'small' }, styleOverrides: { root: { borderRadius: 3 } } },
      MuiTextField: { defaultProps: { size: 'small' } },
      MuiFormControl: { defaultProps: { size: 'small' } },
      MuiSelect: { defaultProps: { size: 'small' } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 3,
            backgroundColor: palette.background.paper,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: inkLine },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: ink },
          },
          input: { fontSize: '0.8125rem' },
        },
      },
      MuiInputLabel: { styleOverrides: { root: { fontSize: '0.8125rem' } } },
      MuiAppBar: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { backgroundColor: palette.background.paper, color: ink, borderBottom: '2px solid ' + ink, boxShadow: 'none' } },
      },
      MuiDrawer: { styleOverrides: { paper: { backgroundColor: palette.background.paper, borderRight: '2px solid ' + ink } } },
      MuiTableCell: {
        styleOverrides: {
          root: { borderBottom: '1px solid ' + palette.divider, padding: '5px 12px', fontSize: '0.8125rem', lineHeight: 1.45 },
          head: {
            fontFamily: fontStacks.mono,
            fontWeight: 600,
            backgroundColor: headerBg,
            color: palette.text.secondary,
            padding: '7px 12px',
            fontSize: '0.65rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            whiteSpace: 'nowrap',
            borderBottom: '2px solid ' + inkLine,
          },
        },
      },
      MuiTableRow: { styleOverrides: { root: { '&.MuiTableRow-hover:hover': { backgroundColor: hoverBg } } } },
      MuiChip: {
        defaultProps: { size: 'small' },
        styleOverrides: {
          root: { borderRadius: 2, fontWeight: 700, fontSize: '0.68rem', height: 21, letterSpacing: '0.02em' },
          outlined: { borderWidth: 1.5 },
          label: { paddingInline: 7 },
        },
      },
      MuiTabs: { styleOverrides: { root: { minHeight: 38, borderBottom: '2px solid ' + inkLine }, indicator: { height: 3 } } },
      MuiTab: { styleOverrides: { root: { minHeight: 38, textTransform: 'uppercase', fontFamily: fontStacks.display, fontWeight: 900, letterSpacing: '0.06em', fontSize: '0.8rem', paddingInline: 14 } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 3, border: '2px solid ' + ink, boxShadow: inkShadow(5) } } },
      MuiDialogTitle: {
        styleOverrides: {
          root: { fontFamily: fontStacks.display, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '1rem', padding: '12px 18px', borderBottom: '2px solid ' + ink, backgroundColor: headerBg, ...halftone(isDark ? 0.05 : 0.07, 5) },
        },
      },
      MuiDialogContent: { styleOverrides: { root: { paddingTop: '16px !important' } } },
      MuiDialogActions: { styleOverrides: { root: { padding: '10px 18px', borderTop: '1px solid ' + inkLine } } },
      MuiAlert: { styleOverrides: { root: { borderRadius: 3, fontSize: '0.8125rem', border: '1px solid currentColor' } } },
      MuiLinearProgress: { styleOverrides: { root: { borderRadius: 0, height: 6, border: '1px solid ' + inkLine } } },
      MuiTooltip: { styleOverrides: { tooltip: { fontSize: '0.72rem', borderRadius: 2, backgroundColor: ink, color: palette.background.paper } } },
      RaMenuItemLink: {
        styleOverrides: {
          root: {
            borderRadius: 2,
            marginInline: 8,
            marginBlock: 1,
            paddingBlock: 5,
            paddingInline: 10,
            color: palette.text.secondary + ' !important',
            border: '1px solid transparent',
            '& .RaMenuItemLink-label': { fontWeight: 500, fontSize: '0.8125rem' },
            '& .RaMenuItemLink-icon': { fontSize: '1.125rem', minWidth: 32 },
            '&:hover': { backgroundColor: hoverBg, color: ink + ' !important' },
            '&.RaMenuItemLink-active': {
              backgroundColor: palette.primary.main,
              color: palette.primary.contrastText + ' !important',
              border: '1px solid ' + ink,
              boxShadow: inkShadow(2),
              fontWeight: 700,
            },
          },
        },
      },
      RaLayout: { styleOverrides: { root: { backgroundColor: 'transparent' } } },
      RaDatagrid: {
        styleOverrides: {
          root: {
            backgroundColor: palette.background.paper,
            '& .RaDatagrid-headerCell': {
              fontFamily: fontStacks.mono,
              fontWeight: 600,
              backgroundColor: headerBg,
              padding: '7px 12px',
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: palette.text.secondary,
              borderBottom: '2px solid ' + inkLine,
              whiteSpace: 'nowrap',
            },
            '& .RaDatagrid-rowCell': { padding: '5px 12px', fontSize: '0.8125rem', lineHeight: 1.45, verticalAlign: 'middle' },
            '& .RaDatagrid-row:hover': { backgroundColor: hoverBg },
            '& .RaDatagrid-clickableRow': { cursor: 'pointer' },
            '& .RaDatagrid-checkbox, & .RaDatagrid-headerCheckbox': { padding: '4px 8px 4px 12px', width: 40 },
          },
        },
      },
    },
  });
};

// Dark mode is the product default; light mode remains available via the app bar.
export const darkTheme = createAppTheme('dark');
export const lightTheme = createAppTheme('light');
