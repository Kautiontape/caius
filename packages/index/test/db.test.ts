import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from '../src/sqlite.js';
import { scanVault } from '../src/scan.js';
import { writeIndex } from '../src/db.js';
import { DEFAULT_CONFIG } from '@caius/resolve';

let root: string;
let dbPath: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'caius-db-'));
  const file = (rel: string, body: string) => {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, body);
  };
  file('10 - Project/Caius/tasks.md', ['- [ ] Build ~1h30m ! ^a', '- [x] Done done:2026-06-01', ''].join('\n'));
  file('02 - Periodic/Daily/2026/06/2026-06-17.md', '- [ ] Today task\n');
  const result = scanVault(root, DEFAULT_CONFIG, new Date(2026, 5, 17));
  dbPath = join(root, 'caius.db');
  writeIndex(dbPath, result, 1_750_000_000);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('writeIndex → SQLite', () => {
  it('persists files, tasks, tokens, derivations queryable on reopen', () => {
    const db = new DatabaseSync(dbPath);
    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    expect(count('SELECT COUNT(*) n FROM files')).toBe(2);
    expect(count('SELECT COUNT(*) n FROM tasks')).toBe(3);
    expect(count("SELECT COUNT(*) n FROM tokens WHERE kind='estimate'")).toBe(1);
    expect(count('SELECT COUNT(*) n FROM derivations')).toBe(9); // 3 axes × 3 tasks

    const today = db
      .prepare("SELECT horizon, project, est_minutes, importance FROM tasks WHERE text='Build'")
      .get() as { horizon: string; project: string; est_minutes: number; importance: number };
    expect(today.project).toBe('Caius');
    expect(today.horizon).toBe('someday');
    expect(today.est_minutes).toBe(90);
    expect(today.importance).toBe(1);
    db.close();
  });

  it('a re-scan into the same path replaces rather than appends', () => {
    const result = scanVault(root, DEFAULT_CONFIG, new Date(2026, 5, 17));
    writeIndex(dbPath, result, 1_750_000_001);
    const db = new DatabaseSync(dbPath);
    const n = (db.prepare('SELECT COUNT(*) n FROM tasks').get() as { n: number }).n;
    expect(n).toBe(3);
    db.close();
  });
});
