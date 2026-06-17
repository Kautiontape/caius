// SQLite persistence via Node's built-in driver (node:sqlite). A full scan
// rebuilds the index from scratch inside one transaction; the Markdown source
// and ^ids are never touched (the DB is purely derived, §6).

import { DatabaseSync } from './sqlite.js';
import { rmSync } from 'node:fs';
import { SCHEMA } from './schema.js';
import type { ScanResult } from './scan.js';

/** Write a ScanResult to `dbPath`, replacing any existing index there. */
export function writeIndex(dbPath: string, result: ScanResult, scannedAt: number): void {
  if (dbPath !== ':memory:') rmSync(dbPath, { force: true }); // clean full-scan rebuild
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(SCHEMA);
    db.exec('BEGIN');

    const insFile = db.prepare('INSERT INTO files (path, mtime, hash, scanned_at) VALUES (?, ?, ?, ?)');
    for (const f of result.files) insFile.run(f.path, f.mtime, f.hash, scannedAt);

    const insTask = db.prepare(`INSERT INTO tasks
      (rowid, block_id, file, line, state, live, text, importance, est_minutes, due, done, project, horizon, area, parent_rowid)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insTok = db.prepare('INSERT INTO tokens (task_rowid, kind, raw) VALUES (?, ?, ?)');
    const insDer = db.prepare('INSERT INTO derivations (task_rowid, axis, value, rule, source) VALUES (?, ?, ?, ?, ?)');
    for (const t of result.tasks) {
      insTask.run(
        t.rowid, t.blockId, t.file, t.line, t.state, t.live ? 1 : 0, t.text,
        t.importance, t.estMinutes, t.due, t.done, t.project, t.horizon, t.area, t.parentRowid,
      );
      for (const tok of t.tokens) insTok.run(t.rowid, tok.kind, tok.raw);
      for (const d of t.derivations) insDer.run(t.rowid, d.axis, d.value, d.rule, d.source);
    }

    const insFlag = db.prepare('INSERT INTO flags (task_rowid, kind, detail, severity) VALUES (?, ?, ?, ?)');
    for (const f of result.flags) insFlag.run(f.taskRowid, f.kind, f.detail, f.severity);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.close();
  }
}
