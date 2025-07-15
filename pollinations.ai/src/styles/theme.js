import { createTheme } from '@mui/material/styles';
import { Colors, Fonts } from '../config/global';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: Colors.lime,
      light: `${Colors.lime}80`,
      dark: `${Colors.lime}cc`,
      contrastText: Colors.offblack,
    },
    secondary: {
      main: Colors.offwhite,
      contrastText: Colors.offblack,
    },
    background: {
      default: Colors.offblack,
      paper: '#121212',
    },
    text: {
      primary: Colors.offwhite,
      secondary: `${Colors.offwhite}dd`,
      disabled: `${Colors.offwhite}77`,
    },
    error: {
      main: Colors.special,
    },
    divider: `${Colors.lime}30`,
    tonalOffset: 0.2,
  },
  typography: {
    fontFamily: Fonts.parameter,
    fontSize: 14,
    h1: {
      fontFamily: Fonts.title,
      fontSize: 'clamp(2.5rem, 5vw, 4rem)',
      fontWeight: 800,
      letterSpacing: '-0.03em',
      lineHeight: 1.2,
    },
    h2: {
      fontFamily: Fonts.title,
      fontSize: 'clamp(2rem, 4vw, 3rem)',
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h3: {
      fontFamily: Fonts.headline,
      fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
      fontWeight: 600,
    },
    h4: {
      fontFamily: Fonts.headline,
      fontSize: 'clamp(1.5rem, 2.5vw, 2rem)',
      fontWeight: 500,
    },
    h5: {
      fontFamily: Fonts.headline,
      fontSize: '1.25rem',
      fontWeight: 500,
    },
    h6: {
      fontFamily: Fonts.headline,
      fontWeight: 500,
    },
    subtitle1: {
      fontFamily: Fonts.parameter,
      fontSize: '1.1rem',
      color: `${Colors.offwhite}dd`,
    },
    body1: {
      lineHeight: 1.7,
    },
    button: {
      fontFamily: Fonts.parameter,
      fontWeight: 600,
      textTransform: 'none',
      letterSpacing: '0.02em',
    },
  },
  shape: {
    borderRadius: 12,
  },
  transitions: {
    duration: {
      enteringScreen: 300,
      leavingScreen: 250,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: `${Colors.lime} ${Colors.offblack}`,
          '&::-webkit-scrollbar': {
            width: 10,
            background: Colors.offblack,
          },
          '&::-webkit-scrollbar-thumb': {
            background: Colors.lime,
            borderRadius: 6,
            border: `2px solid ${Colors.offblack}`,
          },
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableRipple: true,
      },
      styleOverrides: {
        root: {
          padding: '10px 24px',
          transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          boxShadow: 'none',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: `0 4px 20px ${Colors.lime}33`,
          },
          '&:active': {
            transform: 'translateY(0)',
          },
        },
        contained: {
          background: `linear-gradient(135deg, ${Colors.lime}, ${Colors.lime}dd)`,
          '&:hover': {
            background: `linear-gradient(135deg, ${Colors.lime}dd, ${Colors.lime})`,
            boxShadow: `0 6px 24px ${Colors.lime}4d`,
          },
        },
        outlined: {
          borderWidth: 2,
          '&:hover': {
            borderWidth: 2,
            backgroundColor: `${Colors.lime}15`,
          },
        },
        text: {
          color: Colors.lime,
          '&:hover': {
            backgroundColor: `${Colors.lime}10`,
            transform: 'none',
          },
        },
        sizeLarge: {
          padding: '12px 32px',
          fontSize: '1rem',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiInputBase-input': {
            transition: 'all 0.3s ease',
          },
          '& .MuiInputLabel-root': {
            color: `${Colors.offwhite}aa`,
            transform: 'translate(14px, 18px)',
            '&.Mui-focused, &.MuiInputLabel-shrink': {
              transform: 'translate(14px, -9px) scale(0.85)',
              color: Colors.lime,
            },
          },
          '& .MuiOutlinedInput-root': {
            borderRadius: 12,
            '& input': {
              padding: '16px 14px',
            },
            '& fieldset': {
              borderColor: `${Colors.lime}40`,
              borderWidth: 2,
            },
            '&:hover fieldset': {
              borderColor: `${Colors.lime}80`,
            },
            '&.Mui-focused fieldset': {
              borderColor: Colors.lime,
              boxShadow: `0 0 0 3px ${Colors.lime}30`,
            },
          },
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          '& .MuiSlider-thumb': {
            transition: 'all 0.2s ease',
            '&:hover, &.Mui-focusVisible': {
              boxShadow: `0 0 0 8px ${Colors.lime}20`,
            },
            '&.Mui-active': {
              boxShadow: `0 0 0 12px ${Colors.lime}30`,
              transform: 'scale(1.2)',
            },
          },
        },
        thumb: {
          width: 16,
          height: 16,
          backgroundColor: Colors.lime,
          border: `2px solid ${Colors.offblack}`,
        },
        track: {
          height: 6,
          border: 'none',
        },
        rail: {
          height: 6,
          opacity: 0.3,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          height: 8,
          borderRadius: 4,
          backgroundColor: `${Colors.lime}20`,
        },
        bar: {
          borderRadius: 4,
          transition: 'transform 0.4s cubic-bezier(0.65, 0, 0.35, 1)',
          background: `linear-gradient(90deg, ${Colors.lime}, ${Colors.lime}dd)`,
        },
      },
    },
    MuiCircularProgress: {
      styleOverrides: {
        root: {
          color: Colors.lime,
          transition: 'transform 0.3s ease',
        },
        circle: {
          strokeLinecap: 'round',
          transition: 'stroke-dashoffset 0.5s ease 0s',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          background: `linear-gradient(145deg, #1a1a1a, #151515)`,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          overflow: 'visible',
          transition: 'transform 0.3s ease, box-shadow 0.3s ease',
          '&:hover': {
            transform: 'translateY(-5px)',
            boxShadow: `0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px ${Colors.lime}30`,
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: `linear-gradient(to right, ${Colors.offblack}dd, #0a0a0a)`,
          backdropFilter: 'blur(10px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: Colors.offblack2,
          border: `1px solid ${Colors.lime}30`,
          borderRadius: 8,
          fontSize: '0.85rem',
          padding: '8px 16px',
          backdropFilter: 'blur(4px)',
        },
        arrow: {
          color: Colors.offblack2,
          '&:before': {
            border: `1px solid ${Colors.lime}30`,
          },
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: `${Colors.lime}15`,
          margin: '24px 0',
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          background: `linear-gradient(135deg, #1a1a1a, #151515)`,
          border: `1px solid ${Colors.lime}20`,
          borderRadius: 12,
          marginTop: 8,
          boxShadow: '0 10px 50px rgba(0,0,0,0.4)',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '&:hover': {
            backgroundColor: `${Colors.lime}15`,
          },
          '&.Mui-selected': {
            backgroundColor: `${Colors.lime}20`,
            '&:hover': {
              backgroundColor: `${Colors.lime}25`,
            },
          },
        },
      },
    },
  },
});
