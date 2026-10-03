import { alpha, createTheme, PaletteMode } from '@mui/material/styles';

// Shared manga-ink palette: warm paper/ink, lime highlight, and a restrained pink accent.
// Operational statuses stay semantically distinct from brand accents.
const lightPalette = {
  primary: {
    main: '#5d7000',
    light: '#e6ff00',
    dark: '#485600',
    contrastText: '#ffffff',
  },
  secondary: {
    main: '#b01355',
    light: '#ff70ad',
    dark: '#8c0e43',
    contrastText: '#ffffff',
  },
  success: {
    main: '#13783f',
    light: '#24a862',
    dark: '#0d6538',
  },
  warning: {
    main: '#925500',
    light: '#fbbf24',
    dark: '#744300',
  },
  error: {
    main: '#b42318',
    light: '#f87171',
    dark: '#dc2626',
  },
  info: {
    main: '#087e8b',
    light: '#10a6b5',
    dark: '#075d68',
  },
  background: {
    default: '#f3efe4',
    paper: '#fffdf6',
  },
  text: {
    primary: '#0d0d0d',
    secondary: '#3a3a36',
    disabled: '#8a877d',
  },
  divider: 'rgba(13, 13, 13, 0.24)',
};

// Dark mode inverts ink and paper while keeping the accent identity unchanged.
const darkPalette = {
  primary: {
    main: '#e6ff00',
    light: '#efff5a',
    dark: '#c4db00',
    contrastText: '#0d0d0d',
  },
  secondary: {
    main: '#ff2e88',
    light: '#ff70ad',
    dark: '#d51a69',
    contrastText: '#ffffff',
  },
  success: {
    main: '#62d990',
    light: '#8ae8ad',
    dark: '#32b76b',
  },
  warning: {
    main: '#fbbf24',
    light: '#fcd34d',
    dark: '#f59e0b',
  },
  error: {
    main: '#f87171',
    light: '#fca5a5',
    dark: '#ef4444',
  },
  info: {
    main: '#55cbd5',
    light: '#84e0e7',
    dark: '#2daab5',
  },
  background: {
    default: '#0e0e10',
    paper: '#17171a',
  },
  text: {
    primary: '#f3efe4',
    secondary: '#c9c5b8',
    disabled: '#7d7a72',
  },
  divider: 'rgba(243, 239, 228, 0.2)',
};

/** Stable chart colors remain distinct from brand and operational status colors. */
export const dataSeriesColors = ['#e6ff00', '#ff2e88', '#55cbd5', '#fbbf24', '#60a5fa', '#a78bfa'];
/** Higher-contrast series colors for paper surfaces in light mode. */
export const lightDataSeriesColors = ['#5d7000', '#b01355', '#087e8b', '#925500', '#2563a8', '#6841a5'];

/**
 * Create a theme configuration.
 * @param mode Theme mode: 'light' | 'dark'
 */
export const createAppTheme = (mode: PaletteMode) => {
  const isDark = mode === 'dark';
  const palette = isDark ? darkPalette : lightPalette;

  return createTheme({
    palette: {
      mode,
      ...palette,
    },
    shape: {
      borderRadius: 4,
    },
    typography: {
      fontFamily: [
        '-apple-system',
        'BlinkMacSystemFont',
        '"Segoe UI"',
        'Roboto',
        '"Helvetica Neue"',
        'Arial',
        '"Microsoft YaHei"',
        'sans-serif',
      ].join(','),
      h1: {
        fontFamily: '"Arial Narrow", "Franklin Gothic Medium", Impact, sans-serif',
        fontWeight: 900,
        fontSize: '2.5rem',
        lineHeight: 1.2,
        letterSpacing: '0.035em',
        textTransform: 'uppercase',
      },
      h2: {
        fontFamily: '"Arial Narrow", "Franklin Gothic Medium", Impact, sans-serif',
        fontWeight: 850,
        fontSize: '2rem',
        lineHeight: 1.3,
        letterSpacing: '0.025em',
        textTransform: 'uppercase',
      },
      h3: { 
        fontWeight: 600, 
        fontSize: '1.75rem',
        lineHeight: 1.3,
      },
      h4: { 
        fontWeight: 600, 
        fontSize: '1.5rem',
        lineHeight: 1.4,
      },
      h5: { 
        fontWeight: 600, 
        fontSize: '1.25rem',
        lineHeight: 1.4,
      },
      h6: { 
        fontWeight: 600, 
        fontSize: '1.125rem',
        lineHeight: 1.5,
      },
      button: {
        fontWeight: 600,
        textTransform: 'none',
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: palette.background.default,
            color: palette.text.primary,
            transition: 'background-color 0.16s ease, color 0.16s ease',
            backgroundImage: 'radial-gradient(' + alpha(palette.text.primary, isDark ? 0.055 : 0.07) + ' 0.65px, transparent 0.8px)',
            backgroundSize: '8px 8px',
            backgroundAttachment: 'fixed',
          },
          '#root': {
            backgroundColor: palette.background.default,
          },
          '.RaLayout-content': {
            backgroundImage: 'radial-gradient(' + alpha(palette.text.primary, isDark ? 0.035 : 0.045) + ' 0.65px, transparent 0.8px)',
            backgroundSize: '7px 7px',
          },
          '*::-webkit-scrollbar': {
            width: '8px',
            height: '8px',
          },
          '*::-webkit-scrollbar-track': {
            background: palette.background.paper,
          },
          '*::-webkit-scrollbar-thumb': {
            background: isDark ? '#56565b' : '#8a877d',
            borderRadius: '2px',
            '&:hover': {
              background: palette.primary.main,
            },
          },
          '::selection': {
            backgroundColor: palette.primary.main,
            color: palette.primary.contrastText,
          },
          ':focus-visible': {
            outline: '2px solid ' + palette.primary.main,
            outlineOffset: 2,
          },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              animationDuration: '0.01ms !important',
              transitionDuration: '0.01ms !important',
            },
          },
          // Menu icon colors follow the active theme.
          '.RaMenuItemLink-icon': {
            color: alpha(palette.text.primary, 0.82) + ' !important',
          },
          '.RaMenuItemLink-root:hover .RaMenuItemLink-icon': {
            color: palette.text.primary + ' !important',
          },
          '.RaMenuItemLink-active .RaMenuItemLink-icon': {
            color: palette.primary.contrastText + ' !important',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            border: '1px solid ' + alpha(palette.text.primary, isDark ? 0.2 : 0.55),
            boxShadow: 'none',
            backgroundImage: 'none',
            transition: 'border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease',
          },
          elevation1: {
            boxShadow: '2px 2px 0 ' + alpha(palette.text.primary, isDark ? 0.34 : 0.75),
          },
        },
      },
      MuiCard: {
        defaultProps: {
          elevation: 0,
        },
        styleOverrides: {
          root: {
            borderRadius: 4,
            border: '1px solid ' + alpha(palette.text.primary, isDark ? 0.2 : 0.55),
            boxShadow: '2px 2px 0 ' + alpha(palette.text.primary, isDark ? 0.34 : 0.75),
            transition: 'transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease',
            '&:hover': {
              transform: 'translate(-1px, -1px)',
              boxShadow: '3px 3px 0 ' + alpha(palette.text.primary, isDark ? 0.48 : 0.9),
            },
          },
        },
      },
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            borderRadius: 3,
            textTransform: 'none',
            fontWeight: 600,
            paddingInline: 14,
            paddingBlock: 7,
            transition: 'transform 0.12s ease, box-shadow 0.12s ease, background-color 0.12s ease',
          },
          contained: {
            border: '1px solid ' + palette.text.primary,
            boxShadow: '2px 2px 0 ' + palette.text.primary,
            '&:hover': {
              transform: 'translate(-1px, -1px)',
              boxShadow: '3px 3px 0 ' + palette.text.primary,
            },
            '&:active': {
              transform: 'translate(2px, 2px)',
              boxShadow: 'none',
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 3,
            transition: 'all 0.2s ease',
            '&:hover': {
              backgroundColor: alpha(palette.primary.main, 0.08),
            },
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 3,
              transition: 'all 0.2s ease',
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: palette.primary.main,
              },
            },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: palette.background.paper,
            color: palette.text.primary,
            borderBottom: '2px solid ' + palette.text.primary,
            boxShadow: '0 2px 0 ' + alpha(palette.text.primary, 0.7),
            transition: 'background-color 0.16s ease, color 0.16s ease',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: palette.background.paper,
            color: palette.text.primary,
            borderRight: '2px solid ' + palette.text.primary,
            transition: 'background-color 0.16s ease, color 0.16s ease',
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottom: `1px solid ${palette.divider}`,
            padding: '6px 12px',
            fontSize: '0.8125rem',
            lineHeight: 1.4,
          },
          head: {
            fontWeight: 600,
            backgroundColor: isDark ? '#202024' : '#e7e2d4',
            color: palette.text.primary,
            padding: '8px 12px',
            fontSize: '0.75rem',
            textTransform: 'none',
            letterSpacing: '0.01em',
            whiteSpace: 'nowrap',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 3,
            fontWeight: 500,
          },
        },
      },
      RaMenuItemLink: {
        styleOverrides: {
          root: {
            borderRadius: 2,
            marginInline: 7,
            marginBlock: 2,
            paddingBlock: 6,
            paddingInline: 10,
            color: alpha(palette.text.primary, 0.82) + ' !important',
            transition: 'transform 0.14s ease, background-color 0.14s ease, color 0.14s ease',
            '& .RaMenuItemLink-label': {
              fontWeight: 500,
              fontSize: '0.80rem',
              color: alpha(palette.text.primary, 0.82) + ' !important',
            },
            '& .RaMenuItemLink-icon': {
              color: alpha(palette.text.primary, 0.82) + ' !important',
              fontSize: '1.25rem',
            },
            '&:hover': {
              backgroundColor: alpha(palette.primary.main, 0.18),
              color: palette.text.primary + ' !important',
              transform: 'translate(-1px, -1px)',
              '& .RaMenuItemLink-label': {
                color: palette.text.primary + ' !important',
              },
              '& .RaMenuItemLink-icon': {
                color: palette.primary.main + ' !important',
              },
            },
            '&.RaMenuItemLink-active': {
              backgroundColor: palette.primary.main,
              boxShadow: '2px 2px 0 ' + palette.text.primary,
              color: palette.primary.contrastText + ' !important',
              transform: 'rotate(-0.6deg)',
              fontWeight: 600,
              '& .RaMenuItemLink-label': {
                color: palette.primary.contrastText + ' !important',
              },
              '& .RaMenuItemLink-icon': {
                color: palette.primary.contrastText + ' !important',
              },
            },
          },
          icon: {
            color: alpha(palette.text.primary, 0.82) + ' !important',
            transition: 'color 0.14s ease, transform 0.14s ease',
          },
        },
      },
      RaLayout: {
        styleOverrides: {
          root: {
            backgroundColor: palette.background.default,
            transition: 'background-color 0.3s ease',
          },
        },
      },
      RaDatagrid: {
        styleOverrides: {
          root: {
            backgroundColor: palette.background.paper,
            // 统一表格边距
            '& .MuiTableContainer-root': {
              padding: '0 4px',
            },
            '& .MuiTable-root': {
              borderCollapse: 'separate',
              borderSpacing: 0,
            },
            '& .RaDatagrid-headerCell': {
              fontWeight: 600,
              backgroundColor: isDark ? '#202024' : '#e7e2d4',
              padding: '7px 12px',
              fontSize: '0.75rem',
              color: palette.text.primary,
              borderBottom: '2px solid ' + alpha(palette.text.primary, isDark ? 0.44 : 0.8),
              whiteSpace: 'nowrap',
              '&:first-of-type': {
                paddingLeft: 24,
              },
              '&:last-of-type': {
                paddingRight: 24,
              },
            },
            '& .RaDatagrid-rowCell': {
              padding: '5px 12px',
              fontSize: '0.8125rem',
              lineHeight: 1.4,
              verticalAlign: 'middle',
              '&:first-of-type': {
                paddingLeft: 24,
              },
              '&:last-of-type': {
                paddingRight: 24,
              },
            },
            '& .RaDatagrid-row': {
              transition: 'background-color 0.15s ease',
              '&:hover': {
                backgroundColor: isDark
                  ? alpha(palette.primary.main, 0.055)
                  : alpha(palette.primary.main, 0.04),
              },
            },
            '& .RaDatagrid-clickableRow': {
              cursor: 'pointer',
            },
            // 复选框列统一宽度
            '& .RaDatagrid-checkbox': {
              padding: '8px 8px 8px 16px',
              width: 48,
            },
            '& .RaDatagrid-headerCheckbox': {
              padding: '10px 8px 10px 16px',
              width: 48,
            },
          },
        },
      },
    },
  });
};

// Dark mode is the product default; light mode remains available via the app bar.
export const darkTheme = createAppTheme('dark');
export const lightTheme = createAppTheme('light');
