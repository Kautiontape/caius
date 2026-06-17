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

export interface ParseError {
  error: string;
}

const DEFAULT_DB = 'caius.db';

export function parseArgs(argv: string[]): ScanArgs | ParseError {
  const [command, ...rest] = argv;
  if (!command) return { error: 'usage: caius scan <vault> [--db <path>]' };
  if (command !== 'scan') return { error: `unknown command "${command}" (expected: scan)` };

  let vault: string | undefined;
  let db = DEFAULT_DB;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === '--db') {
      const v = rest[++i];
      if (!v) return { error: '--db requires a path' };
      db = v;
    } else if (!vault) {
      vault = a;
    } else {
      return { error: `unexpected argument "${a}"` };
    }
  }
  if (!vault) return { error: 'scan requires a vault path' };
  return { command: 'scan', vault, db };
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
