import { useState } from 'react';
import { applyTheme, getTheme, type Theme } from '../lib/theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getTheme());
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const toggle = () => { applyTheme(next); setTheme(next); };
  return (
    <button
      data-testid="theme-toggle"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="grid h-8 w-8 place-items-center rounded-full text-base leading-none text-dim hover:bg-panel2 hover:text-ink"
    >
      {theme === 'dark' ? '☀' : '🌙'}
    </button>
  );
}
