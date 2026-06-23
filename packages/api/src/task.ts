// The single-task write endpoint's pure core (spec §B3). Validates an untrusted
// JSON body into an UpdateRequest, delegates the atomic on-disk write to
// @caius/write, and — on success — re-scans the vault so the caller can refresh
// its in-memory index and return the freshly-read task. A line that moved or
// changed underneath the request comes back as a 409 conflict with no write.

import { applyTaskUpdate, appendTask, type TaskPatch, type UpdateResult } from '@caius/write';
import { scanVault, type IndexedTask, type ScanResult } from '@caius/index';
import { defaultCaptureNote, type Config } from '@caius/resolve';

/** The result of handling a task update: an HTTP status, the JSON body, and —
 * only when a write landed — the fresh scan so the server can adopt it. */
export interface TaskUpdateOutcome {
  status: number;
  body: unknown;
  fresh?: ScanResult;
}

/** The subset of TaskPatch keys we accept off the wire (must stay in sync with
 * @caius/write's TaskPatch). */
const PATCH_KEYS = ['state', 'text', 'estMinutes', 'importance', 'due', 'project', 'description'] as const;

/**
 * Validate a raw request body, apply the update via @caius/write, and on success
 * re-scan and locate the updated task. Returns 400 on a malformed body, 409 on a
 * stale-line conflict (no write), or 200 with `{ ok, task }` and a `fresh` scan.
 */
export function handleTaskUpdate(root: string, config: Config, now: Date, raw: string): TaskUpdateOutcome {
  let body: { file?: unknown; line?: unknown; expectedText?: unknown; patch?: unknown };
  try {
    body = JSON.parse(raw || '{}');
  } catch {
    return { status: 400, body: { error: 'invalid JSON body' } };
  }

  if (
    typeof body.file !== 'string' ||
    typeof body.line !== 'number' ||
    typeof body.expectedText !== 'string' ||
    typeof body.patch !== 'object' ||
    body.patch === null
  ) {
    return { status: 400, body: { error: 'invalid task request' } };
  }

  const patch = pickPatch(body.patch as Record<string, unknown>);
  if (patch === null) return { status: 400, body: { error: 'invalid task patch' } };

  let result: UpdateResult;
  try {
    result = applyTaskUpdate(root, {
      file: body.file,
      line: body.line,
      expectedText: body.expectedText,
      patch,
    });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'EISDIR') return { status: 409, body: { conflict: 'file not found' } };
    throw err; // unexpected errors still surface as 500 in server.ts
  }

  if ('conflict' in result) {
    return { status: 409, body: { conflict: result.conflict } };
  }

  const fresh = scanVault(root, config, now);
  const task: IndexedTask | null =
    fresh.tasks.find((t) => t.file === body.file && t.line === body.line) ?? null;
  return { status: 200, body: { ok: true, task }, fresh };
}

/**
 * Quick-add capture (spec §B6): validate `{ text, note? }`, append a brand-new
 * open task line via @caius/write, then re-scan so the new task surfaces. The
 * target note defaults to today's daily note (created if missing) unless the
 * request or config pins an explicit `note`. Returns 400 on a malformed body,
 * 500 if the append throws, or 200 `{ ok }` with a `fresh` scan.
 */
export function handleCapture(root: string, config: Config, now: Date, raw: string): TaskUpdateOutcome {
  let body: { text?: unknown; note?: unknown };
  try {
    body = JSON.parse(raw || '{}');
  } catch {
    return { status: 400, body: { error: 'invalid JSON body' } };
  }

  if (typeof body.text !== 'string' || body.text.trim() === '') {
    return { status: 400, body: { error: 'capture text required' } };
  }
  if (body.note !== undefined && typeof body.note !== 'string') {
    return { status: 400, body: { error: 'invalid note' } };
  }

  const note = body.note ?? config.captureNote ?? defaultCaptureNote(now);
  try {
    appendTask(root, { note, text: body.text });
  } catch (err: unknown) {
    return { status: 500, body: { error: `capture failed: ${String((err as Error).message ?? err)}` } };
  }

  const fresh = scanVault(root, config, now);
  return { status: 200, body: { ok: true }, fresh };
}

const PATCH_STATES: ReadonlySet<string> = new Set(['open', 'in_progress', 'done', 'cancelled']);
const DUE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The runtime validation boundary between an untrusted JSON body and the disk
 * write. @caius/write's applyPatch trusts the TaskPatch TS types with no runtime
 * guards, so without this a present-but-wrong value (e.g. `estMinutes: "thirty"`,
 * `importance: 5`, `state: "kinda-done"`) would render garbage (`~NaNm`, `!!!!!`,
 * `[undefined]`) into the user's note. We copy only the known keys AND validate
 * the value of every key that is PRESENT (a missing key is fine — partial patch).
 * Returns the typed patch, or `null` if any present field fails its rule. */
function pickPatch(src: Record<string, unknown>): TaskPatch | null {
  const patch: Record<string, unknown> = {};
  for (const k of PATCH_KEYS) {
    const v = src[k];
    if (v === undefined) continue;
    switch (k) {
      case 'state':
        if (typeof v !== 'string' || !PATCH_STATES.has(v)) return null;
        break;
      case 'text':
        if (typeof v !== 'string') return null;
        break;
      case 'estMinutes':
        if (v !== null && !(typeof v === 'number' && Number.isInteger(v) && v >= 0)) return null;
        break;
      case 'importance':
        if (!(typeof v === 'number' && (v === 0 || v === 1 || v === 2 || v === 3))) return null;
        break;
      case 'due':
        if (v !== null && !(typeof v === 'string' && DUE_RE.test(v))) return null;
        break;
      case 'project':
        if (v !== null && !(typeof v === 'string' && v.trim().length > 0)) return null;
        break;
      case 'description':
        if (typeof v !== 'string') return null;
        break;
    }
    patch[k] = v;
  }
  return patch as TaskPatch;
}
