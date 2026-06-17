// Thin access point for Node's built-in SQLite driver.
//
// `node:sqlite` is newer than the bundled Vite's built-in module list, so a
// static `import … from 'node:sqlite'` gets mis-resolved to a bare `sqlite`
// package under vitest. Loading it through createRequire bypasses the bundler
// resolver entirely and uses Node's native loader. Isolated here so the rest of
// the package imports normal ESM.

import { createRequire } from 'node:module';

export interface SqliteStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

export type DatabaseSyncCtor = new (path: string) => SqliteDatabase;

const require = createRequire(import.meta.url);

// `node:sqlite` prints an unconditional "SQLite is an experimental feature"
// warning the first time it loads. Swallow just that one line (keeping every
// other warning) so the CLI's stderr stays clean.
const prevEmit = process.emitWarning.bind(process);
(process as { emitWarning: typeof process.emitWarning }).emitWarning = ((
  warning: string | Error,
  ...args: unknown[]
) => {
  if (String(warning).includes('SQLite is an experimental feature')) return;
  return (prevEmit as (...a: unknown[]) => void)(warning, ...args);
}) as typeof process.emitWarning;

export const DatabaseSync: DatabaseSyncCtor = (
  require('node:sqlite') as { DatabaseSync: DatabaseSyncCtor }
).DatabaseSync;

(process as { emitWarning: typeof process.emitWarning }).emitWarning = prevEmit;
