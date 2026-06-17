#!/usr/bin/env node
// Thin argv/console wrapper around ./cli.ts (all logic lives there, tested).

import { resolve } from 'node:path';
import { serveCaius } from '@caius/api';
import { parseArgs, runScan } from './cli.js';

const parsed = parseArgs(process.argv.slice(2));
if ('error' in parsed) {
  console.error(parsed.error);
  process.exit(2);
}

if (parsed.command === 'scan') {
  const { output, exitCode } = runScan({ vault: parsed.vault, db: parsed.db });
  console.log(output);
  process.exit(exitCode);
} else {
  const server = await serveCaius({ root: resolve(parsed.vault), port: parsed.port });
  console.log(`Caius serving ${parsed.vault}`);
  console.log(`  → ${server.url}  (watching for changes; Ctrl-C to stop)`);
  const shutdown = () => {
    void server.close().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
