module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Space Grotesk', 'sans-serif'],
        display: ['Pacifico', 'cursive'],
      },
      colors: {
        // Brand colors with actual values
        brand: {
          pink: '#ff61d8',
          purple: '#A020F0',
          violet: '#8A2BE2',
          black: '#000000',
          primary: '#ff61d8',
          secondary: '#A020F0',
          accent: '#8A2BE2',
        },
        
        // Legacy flat properties for backward compatibility
        'brand-black': '#000000',
        'brand-primary': '#ff61d8',
        'brand-secondary': '#A020F0',
        'brand-accent': '#8A2BE2',
      },
      animation: {
        'border-shift': 'border-shift 10s infinite linear',
        'highlight-shift': 'highlight-shift 8s infinite linear',
        'login-gradient': 'login-gradient 6s ease infinite',
        'code-shine': 'code-shine 3s infinite',
      },
      keyframes: {
        'border-shift': {
          '0%, 100%': { 'border-color': '#ff61d8' },
          '33%': { 'border-color': '#A020F0' },
          '66%': { 'border-color': '#8A2BE2' },
        },
        'highlight-shift': {
            '0%, 100%': { 'background-color': '#A020F0' },
            '33%': { 'background-color': '#8A2BE2' },
            '66%': { 'background-color': '#ff61d8' },
        },
        'login-gradient': {
            '0%, 100%': { 'background-position': '0% 50%' },
            '50%': { 'background-position': '100% 50%' },
        },
        'code-shine': {
            '0%': { left: '-100%' },
            '20%': { left: '200%' },
            '100%': { left: '200%' },
        }
      }
    },
  },
  plugins: [],
}; 