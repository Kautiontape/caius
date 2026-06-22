/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // Tokens resolve to CSS variables so the whole palette swaps with the
      // `.dark` class on <html> — see src/index.css for the light/dark values.
      colors: {
        ink: 'var(--ink)', dim: 'var(--dim)', bg: 'var(--bg)',
        panel: 'var(--panel)', panel2: 'var(--panel2)', line: 'var(--line)',
        accent: 'var(--accent)', warn: 'var(--warn)', over: 'var(--over)', good: 'var(--good)',
      },
    },
  },
  plugins: [],
};
