module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Space Grotesk', 'sans-serif'],
        display: ['Pacifico', 'cursive'],
      },
      colors: {
        brand: {
          pink: '#ff61d8',
          purple: '#A020F0',
          violet: '#8A2BE2',
          black: '#000000',
          primary: '#ff61d8',
          secondary: '#A020F0',
          accent: '#8A2BE2',
        },
        'brand-black': '#000000',
        'brand-primary': '#ff61d8',
        'brand-secondary': '#A020F0',
        'brand-accent': '#8A2BE2',
      },
    },
  },
  plugins: [],
};
