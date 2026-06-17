// SQLite schema (§6). The derived index — Markdown on disk stays canonical.
export const SCHEMA = `
CREATE TABLE files (
  path TEXT PRIMARY KEY, mtime INTEGER, hash TEXT, scanned_at INTEGER
);
CREATE TABLE tasks (
  rowid INTEGER PRIMARY KEY,
  block_id TEXT,
  file TEXT, line INTEGER,
  state TEXT, live INTEGER,
  text TEXT, importance INTEGER,
  est_minutes INTEGER, due TEXT, done TEXT,
  project TEXT, horizon TEXT, area TEXT,
  parent_rowid INTEGER
);
CREATE TABLE derivations (
  task_rowid INTEGER, axis TEXT, value TEXT, rule TEXT, source TEXT
);
CREATE TABLE tokens (task_rowid INTEGER, kind TEXT, raw TEXT);
CREATE TABLE flags  (task_rowid INTEGER, kind TEXT, detail TEXT, severity TEXT);
CREATE INDEX tasks_block_id ON tasks(block_id);
CREATE INDEX tasks_horizon  ON tasks(horizon, live);
`;
