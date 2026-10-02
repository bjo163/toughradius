import { alpha, createTheme, PaletteMode } from '@mui/material/styles';

// Light theme palette
const lightPalette = {
  primary: {
    main: '#16a34a',
    light: '#4ade80',
    dark: '#15803d',
    contrastText: '#ffffff',
  },
  secondary: {
    main: '#0f766e',
    light: '#2dd4bf',
    dark: '#115e59',
    contrastText: '#ffffff',
  },
  success: {
    main: '#16a34a',
    light: '#4ade80',
    dark: '#15803d',
  },
  warning: {
    main: '#f59e0b',
    light: '#fbbf24',
    dark: '#d97706',
  },
  error: {
    main: '#ef4444',
    light: '#f87171',
    dark: '#dc2626',
  },
  info: {
    main: '#0d9488',
    light: '#2dd4bf',
    dark: '#0f766e',
  },
  background: {
    default: '#f8fafc',
    paper: '#ffffff',
  },
  text: {
    primary: '#0f172a',
    secondary: '#64748b',
    disabled: '#94a3b8',
  },
  divider: 'rgba(100, 116, 139, 0.12)',
};

// 深色主题配色
const darkPalette = {
  primary: {
    main: '#4ade80',
    light: '#86efac',
    dark: '#22c55e',
    contrastText: '#ffffff',
  },
  secondary: {
    main: '#2dd4bf',
    light: '#5eead4',
    dark: '#14b8a6',
    contrastText: '#ffffff',
  },
  success: {
    main: '#4ade80',
    light: '#86efac',
    dark: '#22c55e',
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
    main: '#2dd4bf',
    light: '#5eead4',
    dark: '#14b8a6',
  },
  background: {
    default: '#07130d',
    paper: '#0e1f15',
  },
  text: {
    primary: '#f1f5f9',
    secondary: '#cbd5e1',
    disabled: '#64748b',
  },
  divider: 'rgba(134, 239, 172, 0.13)',
};

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
    borderRadius: 5,
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
        fontWeight: 700, 
        fontSize: '2.5rem',
        lineHeight: 1.2,
      },
      h2: { 
        fontWeight: 700, 
        fontSize: '2rem',
        lineHeight: 1.3,
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
            transition: 'background-color 0.3s ease, color 0.3s ease',
            backgroundImage: isDark
              ? 'radial-gradient(ellipse at 8% 0%, rgba(34,197,94,0.075), transparent 32%), radial-gradient(ellipse at 92% 55%, rgba(20,184,166,0.045), transparent 30%)'
              : 'radial-gradient(ellipse at 8% 0%, rgba(34,197,94,0.055), transparent 34%)',
            backgroundAttachment: 'fixed',
          },
          '#root': {
            backgroundColor: palette.background.default,
          },
          '.RaLayout-content': {
            backgroundImage: isDark
              ? 'linear-gradient(rgba(134,239,172,0.022) 1px, transparent 1px), linear-gradient(90deg, rgba(134,239,172,0.022) 1px, transparent 1px)'
              : 'linear-gradient(rgba(22,163,74,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(22,163,74,0.025) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            backgroundPosition: '-1px -1px',
          },
          '*::-webkit-scrollbar': {
            width: '8px',
            height: '8px',
          },
          '*::-webkit-scrollbar-track': {
            background: isDark ? '#0e1f15' : '#f1f5f9',
          },
          '*::-webkit-scrollbar-thumb': {
            background: isDark ? '#285238' : '#cbd5e1',
            borderRadius: '4px',
            '&:hover': {
              background: isDark ? '#3f7a53' : '#94a3b8',
            },
          },
          // 强制菜单图标始终使用浅色
          '.RaMenuItemLink-icon': {
            color: 'rgba(255, 255, 255, 0.85) !important',
          },
          '.RaMenuItemLink-root:hover .RaMenuItemLink-icon': {
            color: '#ffffff !important',
          },
          '.RaMenuItemLink-active .RaMenuItemLink-icon': {
            color: '#ffffff !important',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            border: `1px solid ${isDark ? 'rgba(134, 239, 172, 0.1)' : 'rgba(100, 116, 139, 0.12)'}`,
            boxShadow: isDark 
              ? '0 1px 3px 0 rgba(0, 0, 0, 0.3)' 
              : '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
            backgroundImage: isDark
              ? 'linear-gradient(135deg, rgba(255,255,255,0.018), transparent 62%)'
              : 'linear-gradient(135deg, rgba(255,255,255,0.8), transparent 62%)',
            transition: 'all 0.3s ease',
          },
          elevation1: {
            boxShadow: isDark
              ? '0 2px 4px 0 rgba(0, 0, 0, 0.4)'
              : '0 2px 4px 0 rgba(0, 0, 0, 0.06)',
          },
        },
      },
      MuiCard: {
        defaultProps: {
          elevation: 0,
        },
        styleOverrides: {
          root: {
            borderRadius: 9,
            border: `1px solid ${isDark ? 'rgba(134, 239, 172, 0.14)' : 'rgba(100, 116, 139, 0.12)'}`,
            boxShadow: isDark
              ? '0 1px 3px 0 rgba(0, 0, 0, 0.3)'
              : '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
            transition: 'all 0.3s ease',
            '&:hover': {
              boxShadow: isDark
                ? '0 8px 26px rgba(0,0,0,0.28), 0 0 0 1px rgba(74,222,128,0.07)'
                : '0 8px 26px rgba(15,23,42,0.08)',
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
            borderRadius: 6,
            textTransform: 'none',
            fontWeight: 600,
            paddingInline: 14,
            paddingBlock: 7,
            transition: 'all 0.2s ease',
          },
          contained: {
            boxShadow: 'none',
            '&:hover': {
              boxShadow: isDark
                ? '0 4px 8px 0 rgba(0, 0, 0, 0.3)'
                : '0 4px 8px 0 rgba(0, 0, 0, 0.1)',
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
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
              borderRadius: 6,
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
            backgroundColor: isDark ? '#0e1f15' : '#ffffff',
            color: isDark ? '#f1f5f9' : '#1f2937',
            borderBottom: isDark 
              ? '1px solid rgba(74, 222, 128, 0.18)'
              : '1px solid rgba(22, 163, 74, 0.18)',
            boxShadow: isDark 
              ? 'none' 
              : '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
            transition: 'all 0.3s ease',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: isDark ? '#0e2417' : '#14532d',
            borderRight: 'none',
            transition: 'all 0.3s ease',
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
            backgroundColor: isDark ? '#10251a' : '#f8fafc',
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
            borderRadius: 6,
            fontWeight: 500,
          },
        },
      },
      RaMenuItemLink: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            marginInline: 7,
            marginBlock: 2,
            paddingBlock: 6,
            paddingInline: 10,
            // 菜单项始终使用浅色文字
            color: 'rgba(255, 255, 255, 0.9) !important',
            transition: 'all 0.2s ease',
            '& .RaMenuItemLink-label': {
              fontWeight: 500,
              fontSize: '0.80rem',
              color: 'rgba(255, 255, 255, 0.9) !important',
            },
            '& .RaMenuItemLink-icon': {
              color: 'rgba(255, 255, 255, 0.85) !important',
              fontSize: '1.25rem',
            },
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.12)',
              color: '#ffffff !important',
              '& .RaMenuItemLink-label': {
                color: '#ffffff !important',
              },
              '& .RaMenuItemLink-icon': {
                color: '#ffffff !important',
                transform: 'scale(1.05)',
              },
            },
            '&.RaMenuItemLink-active': {
              backgroundColor: 'rgba(34, 197, 94, 0.19)',
              boxShadow: 'inset 2px 0 #4ade80, 0 0 18px rgba(34,197,94,0.08)',
              color: '#ffffff !important',
              fontWeight: 600,
              '& .RaMenuItemLink-label': {
                color: '#ffffff !important',
              },
              '& .RaMenuItemLink-icon': {
                color: '#ffffff !important',
              },
            },
          },
          icon: {
            // 菜单图标始终使用浅色，添加 !important 确保优先级
            color: 'rgba(255, 255, 255, 0.85) !important',
            transition: 'all 0.2s ease',
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
              backgroundColor: isDark ? '#10251a' : '#f8fafc',
              padding: '7px 12px',
              fontSize: '0.75rem',
              color: palette.text.primary,
              borderBottom: `1px solid ${isDark ? 'rgba(74, 222, 128, 0.3)' : 'rgba(100, 116, 139, 0.15)'}`,
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

// Default theme and optional light mode.
export const theme = createAppTheme('dark');
export const darkTheme = createAppTheme('dark');
export const lightTheme = createAppTheme('light');
