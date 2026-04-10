/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html'],
  theme: {
    extend: {
      colors: {
        void: '#080b12',
        surface: '#0e1320',
        panel: '#151d2e',
        border: '#283548',
        'border-dim': '#1e293b',
        teal: '#2dd4bf',
        'teal-dim': '#0d9488',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
