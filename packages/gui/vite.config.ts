import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxies /api → a running `caius serve` (default :7777).
// `vite build` emits packages/gui/dist, which the API server serves in prod.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:7777' } },
  build: { outDir: 'dist', emptyOutDir: true },
});
