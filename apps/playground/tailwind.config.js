/** @type {import('tailwindcss').Config} */
const { colors, gradients, shadows, fonts } = require('./theme');

module.exports = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      fontFamily: {
        sans: fonts.body.split(',').map(f => f.trim().replace(/"/g, '')),
        display: fonts.display.split(',').map(f => f.trim().replace(/"/g, '')),
        mono: [fonts.mono],
      },
      colors: {
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        sidebar: {
          DEFAULT: 'var(--sidebar)',
          foreground: 'var(--sidebar-foreground)',
          primary: 'var(--sidebar-primary)',
          'primary-foreground': 'var(--sidebar-primary-foreground)',
          accent: 'var(--sidebar-accent)',
          'accent-foreground': 'var(--sidebar-accent-foreground)',
          border: 'var(--sidebar-border)',
          ring: 'var(--sidebar-ring)',
        },
        // Theme-specific colors from theme.js
        lime: {
          DEFAULT: colors.lime.main,
          light: colors.lime.light,
          dim: colors.lime.dim,
          glow: colors.lime.glow,
        },
        sage: {
          DEFAULT: colors.sage.main,
          dim: colors.sage.dim,
        },
        honey: {
          DEFAULT: colors.honey.main,
          dim: colors.honey.dim,
        },
        lavender: {
          DEFAULT: colors.lavender.main,
          light: colors.lavender.light,
          dim: colors.lavender.dim,
        },
        deep: colors.bg.deep,
        'card-glass': colors.bg.cardGlass,
        'card-glass-hover': colors.bg.cardGlassHover,
      },
      borderColor: {
        lime: colors.lime.border,
        sage: colors.sage.border,
        honey: colors.honey.border,
        lavender: colors.lavender.border,
        glass: colors.border.light,
        'glass-medium': colors.border.medium,
        'glass-strong': colors.border.strong,
        'glass-hover': colors.border.hover,
      },
      boxShadow: {
        card: shadows.card,
        'card-hover': shadows.cardHover,
        'card-large': shadows.cardLarge,
        'glow-lime': shadows.glowLime,
        'glow-white': shadows.glowWhite,
        button: shadows.button,
      },
      backgroundImage: {
        'gradient-card': gradients.bgCard,
        'gradient-page': gradients.bgPage,
        'gradient-accent': gradients.cardAccent,
        'gradient-text': gradients.textAccent,
        'gradient-overlay': gradients.bgOverlay,
        'glow-lime': gradients.glowLime,
        'glow-white': gradients.glowWhite,
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [],
};
