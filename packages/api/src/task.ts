// The single-task write endpoint's pure core (spec §B3). Validates an untrusted
// JSON body into an UpdateRequest, delegates the atomic on-disk write to
// @caius/write, and — on success — re-scans the vault so the caller can refresh
// its in-memory index and return the freshly-read task. A line that moved or
// changed underneath the request comes back as a 409 conflict with no write.

import { applyTaskUpdate, type TaskPatch } from '@caius/write';
import { scanVault, type IndexedTask, type ScanResult } from '@caius/index';
import type { Config } from '@caius/resolve';

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
  const result = applyTaskUpdate(root, {
    file: body.file,
    line: body.line,
    expectedText: body.expectedText,
    patch,
  });

  if ('conflict' in result) {
    return { status: 409, body: { conflict: result.conflict } };
  }

  const fresh = scanVault(root, config, now);
  const task: IndexedTask | null =
    fresh.tasks.find((t) => t.file === body.file && t.line === body.line) ?? null;
  return { status: 200, body: { ok: true, task }, fresh };
}

/** Copy only the known TaskPatch keys off an untrusted object. @caius/write's
 * applyPatch already discriminates on field type, so we just forward whatever is
 * present and let it (and re-scan) be the source of truth. */
function pickPatch(src: Record<string, unknown>): TaskPatch {
  const patch: Record<string, unknown> = {};
  for (const k of PATCH_KEYS) {
    if (src[k] !== undefined) patch[k] = src[k];
  }
  return patch as TaskPatch;
}
