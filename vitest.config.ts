import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Package `exports` point at built `dist/` for the runtime (so plain `node` can
// run the compiled CLI). Tests must run against `src/` without a build step, so
// alias the workspace packages back to their TypeScript sources here.
const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@caius/core': src('./packages/core/src/index.ts'),
      '@caius/resolve': src('./packages/resolve/src/index.ts'),
      '@caius/index': src('./packages/index/src/index.ts'),
    },
  },
});
