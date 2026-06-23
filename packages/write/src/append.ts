// Quick-add capture's write primitive (spec §B6). Unlike applyTaskUpdate — which
// reconciles and rewrites one existing line — this only ever APPENDS a brand-new
// open task line to a note, creating the note (and its parent dirs) if missing.
// The task text is written verbatim after `- [ ] `; inline grammar tokens
// (~30m, !!, *2026-07-01, :[[Project]]) are preserved as-is and parsed on the
// next vault scan — no client- or server-side grammar parsing happens here.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

/** Append a new open task line to a note, creating the note (and parent dirs) if
 * missing. The task text is written verbatim after `- [ ] `; inline grammar tokens
 * (~30m, !!, *2026-07-01, :[[Project]]) are preserved and parsed on the next scan. */
export function appendTask(root: string, req: { note: string; text: string }): { ok: true } {
  const abs = join(root, req.note);
  mkdirSync(dirname(abs), { recursive: true });
  const prev = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
  const sep = prev === '' || prev.endsWith('\n') ? '' : '\n';
  writeFileSync(abs, `${prev}${sep}- [ ] ${req.text.trim()}\n`);
  return { ok: true };
}
