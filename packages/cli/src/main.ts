#!/usr/bin/env node
// Thin argv/console wrapper around ./cli.ts (all logic lives there, tested).

import { parseArgs, runScan } from './cli.js';

const parsed = parseArgs(process.argv.slice(2));
if ('error' in parsed) {
  console.error(parsed.error);
  process.exit(2);
}

const { output, exitCode } = runScan({ vault: parsed.vault, db: parsed.db });
console.log(output);
process.exit(exitCode);
