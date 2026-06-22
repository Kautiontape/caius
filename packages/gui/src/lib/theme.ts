// Light/dark theme state. The initial class is set pre-paint by an inline
// script in index.html; this module reads and flips it at runtime.
export type Theme = 'light' | 'dark';

const KEY = 'caius-theme';

export function getTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try { localStorage.setItem(KEY, theme); } catch { /* private mode / blocked storage */ }
}
