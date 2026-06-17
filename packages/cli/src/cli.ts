// `caius scan <vault> [--db <path>]` — orchestration, kept free of process I/O
// so it is directly testable. main.ts is the thin argv/console wrapper.

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanVault, writeIndex } from '@caius/index';
import { DEFAULT_CONFIG } from '@caius/resolve';
import { formatReport } from './report.js';

export interface ScanArgs {
  command: 'scan';
  vault: string;
  db: string;
}

export interface ServeArgs {
  command: 'serve';
  vault: string;
  port: number;
}

export interface ParseError {
  error: string;
}

const DEFAULT_DB = 'caius.db';
const DEFAULT_PORT = 7777;
const USAGE = 'usage: caius scan <vault> [--db <path>]  |  caius serve <vault> [--port <n>]';

export function parseArgs(argv: string[]): ScanArgs | ServeArgs | ParseError {
  const [command, ...rest] = argv;
  if (!command) return { error: USAGE };
  if (command !== 'scan' && command !== 'serve') {
    return { error: `unknown command "${command}" (expected: scan | serve)` };
  }

  let vault: string | undefined;
  let db = DEFAULT_DB;
  let port = DEFAULT_PORT;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === '--db' && command === 'scan') {
      const v = rest[++i];
      if (!v) return { error: '--db requires a path' };
      db = v;
    } else if (a === '--port' && command === 'serve') {
      const v = rest[++i];
      if (!v || Number.isNaN(Number(v))) return { error: '--port requires a number' };
      port = Number(v);
    } else if (!vault) {
      vault = a;
    } else {
      return { error: `unexpected argument "${a}"` };
    }
  }
  if (!vault) return { error: `${command} requires a vault path` };
  return command === 'scan' ? { command: 'scan', vault, db } : { command: 'serve', vault, port };
}

export function runScan(
  args: { vault: string; db: string },
  now: Date = new Date(),
): { output: string; exitCode: number } {
  const vault = resolve(args.vault);
  if (!existsSync(vault) || !statSync(vault).isDirectory()) {
    return { output: `Vault not found: ${args.vault}`, exitCode: 2 };
  }

  const started = Date.now();
  const result = scanVault(vault, DEFAULT_CONFIG, now);
  writeIndex(args.db, result, Math.floor(started / 1000));
  const elapsed = Date.now() - started;

  const lines = [
    formatReport(result.report, args.vault),
    `  Index:    ${args.db} (${elapsed} ms)`,
  ];
  return { output: lines.join('\n'), exitCode: 0 };
}
