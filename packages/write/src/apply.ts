// Caius's first real disk writes (spec §B1, I/O half). A single task update is a
// read → reconcile → render → atomic-write cycle against one line of one note:
//
//   1. read the file and split it on '\n' (a trailing newline round-trips as a
//      final empty element that join restores);
//   2. re-parse the target line and compare its text to the caller's
//      `expectedText` — if it has changed underneath us (or is no longer a task
//      line), abort with a conflict and write nothing;
//   3. apply the typed patch onto the parsed task, marking mutated/inserted
//      tokens `changed` so renderTaskLine regenerates them (unchanged tokens
//      round-trip byte-identically via their captured `raw`);
//   4. optionally replace the task's contiguous indented note block;
//   5. write a temp file in the SAME directory, then renameSync over the target
//      (atomic on a single filesystem — never a partially written note).

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { parseTaskLine, renderTaskLine, type State, type TaskLine, type Token } from '@caius/core';

/** A typed, partial mutation of a single task. Omitted fields are left as-is;
 * `null` clears the corresponding token, a value sets/creates it. */
export interface TaskPatch {
  state?: State;
  text?: string;
  estMinutes?: number | null;
  importance?: 0 | 1 | 2 | 3;
  due?: string | null;
  project?: string | null;
  description?: string;
}

/** A request to update one task line in one note (path relative to the vault root). */
export interface UpdateRequest {
  file: string;
  line: number;
  expectedText: string;
  patch: TaskPatch;
}

/** Either the write succeeded, or it was refused because the line moved/changed. */
export type UpdateResult = { ok: true } | { conflict: string };

const LIVE_STATES: ReadonlySet<State> = new Set<State>(['open', 'in_progress']);

/**
 * Apply a single task update to a note on disk (optimistic-concurrency,
 * atomic). Returns `{ ok: true }` on success, or `{ conflict }` (with no write)
 * when the target line no longer parses as the task the caller expected.
 */
export function applyTaskUpdate(root: string, req: UpdateRequest): UpdateResult {
  const abs = join(root, req.file);
  const content = readFileSync(abs, 'utf8');
  const lines = content.split('\n');

  const current = lines[req.line];
  const parsed = current === undefined ? null : parseTaskLine(current);
  if (!parsed || parsed.text !== req.expectedText) {
    return { conflict: 'line changed under you' };
  }

  const next = applyPatch(parsed, req.patch);
  lines[req.line] = renderTaskLine(next);

  if (req.patch.description !== undefined) {
    replaceNoteBlock(lines, req.line, next.indentText, req.patch.description);
  }

  atomicWrite(abs, lines.join('\n'));
  return { ok: true };
}

/**
 * Apply a typed patch onto a parsed task, returning a new TaskLine (the input is
 * never mutated). Any token this touches is cloned and marked `changed` so the
 * renderer regenerates it from its typed field rather than echoing stale `raw`.
 * `description` is intentionally ignored here — it is not a token and is handled
 * by replaceNoteBlock against the raw lines.
 */
export function applyPatch(parsed: TaskLine, patch: TaskPatch): TaskLine {
  const next: TaskLine = { ...parsed, tokens: [...parsed.tokens] };

  if (patch.state !== undefined) {
    next.state = patch.state;
    next.live = LIVE_STATES.has(patch.state);
  }

  if (patch.text !== undefined) {
    next.text = patch.text;
  }

  if (patch.estMinutes !== undefined) {
    if (patch.estMinutes === null) {
      removeToken(next, 'estimate');
    } else {
      upsertToken(next, 'estimate', (tok) => {
        tok.minutes = patch.estMinutes as number;
      }, () => ({ kind: 'estimate', minutes: patch.estMinutes as number, raw: '', changed: true }));
    }
  }

  if (patch.importance !== undefined) {
    if (patch.importance === 0) {
      removeToken(next, 'importance');
    } else {
      const tier = patch.importance as 1 | 2 | 3;
      upsertToken(next, 'importance', (tok) => {
        tok.tier = tier;
      }, () => ({ kind: 'importance', tier, raw: '', changed: true }));
    }
  }

  if (patch.due !== undefined) {
    if (patch.due === null) {
      removeToken(next, 'due');
    } else {
      const date = patch.due;
      upsertToken(next, 'due', (tok) => {
        tok.date = date;
      }, () => ({ kind: 'due', date, raw: '', changed: true }));
    }
  }

  if (patch.project !== undefined) {
    if (patch.project === null) {
      removeToken(next, 'project');
    } else {
      const project = patch.project;
      upsertToken(next, 'project', (tok) => {
        tok.project = project;
      }, () => ({ kind: 'project', project, raw: '', changed: true }));
    }
  }

  return next;
}

/** Remove every token of `kind` from the task's token list. */
function removeToken(t: TaskLine, kind: Token['kind']): void {
  t.tokens = t.tokens.filter((tok) => tok.kind !== kind);
}

/**
 * Update the first existing token of `kind` in place (cloned + marked
 * `changed`), or append a freshly-created one. `mutate` is typed against the
 * concrete token so callers set the right field; `create` builds a new token
 * (already `changed: true`) when none exists. Re-parse re-derives everything, so
 * appending a new token rather than positioning it is fine.
 */
function upsertToken<K extends Token['kind']>(
  t: TaskLine,
  kind: K,
  mutate: (tok: Extract<Token, { kind: K }>) => void,
  create: () => Extract<Token, { kind: K }>,
): void {
  const idx = t.tokens.findIndex((tok) => tok.kind === kind);
  if (idx >= 0) {
    const clone = { ...(t.tokens[idx] as Extract<Token, { kind: K }>), changed: true };
    mutate(clone);
    t.tokens[idx] = clone;
  } else {
    t.tokens.push(create());
  }
}

/**
 * Replace the task's contiguous indented note block with `description`.
 *
 * The note block is the run of lines immediately after `taskLineIdx` that
 * "belong" to the task: each is non-empty, indented strictly more than the task,
 * and is itself NOT a task line. The run stops at the first empty line, a dedent
 * to ≤ the task's indent, a child/sibling task line, or EOF — so a nested
 * `- [ ] child` ends (and is preserved past) the block. The matched lines are
 * spliced out and the new description is inserted, each line re-indented to the
 * task's indent + two spaces. An empty `description` simply removes the block.
 */
export function replaceNoteBlock(
  lines: string[],
  taskLineIdx: number,
  indentText: string,
  description: string,
): void {
  const taskIndent = indentText.length;

  let end = taskLineIdx + 1;
  while (end < lines.length) {
    const line = lines[end]!;
    if (line.trim() === '') break; // empty line ends the block
    const leading = line.length - line.trimStart().length;
    if (leading <= taskIndent) break; // dedent to/under the task ends the block
    if (parseTaskLine(line) !== null) break; // a nested task line ends the block
    end++;
  }

  const replacement =
    description === '' ? [] : description.split('\n').map((l) => `${indentText}  ${l}`);
  lines.splice(taskLineIdx + 1, end - (taskLineIdx + 1), ...replacement);
}

/**
 * Write `content` to `abs` atomically: write a temp file in the SAME directory
 * (so the rename stays on one filesystem), then renameSync over the target. A
 * reader of `abs` only ever sees the old file or the fully-written new one.
 */
function atomicWrite(abs: string, content: string): void {
  const tmp = join(dirname(abs), `.${basename(abs)}.${process.pid}.tmp`);
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, abs);
}
