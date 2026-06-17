/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#e6edf3', dim: '#8b97a7', bg: '#0e1116',
        panel: '#161b22', panel2: '#1c2330', line: '#2a3340',
        accent: '#5aa9ff', warn: '#ffb454', over: '#ff6b6b', good: '#3fb950',
      },
    },
  },
  plugins: [],
};
