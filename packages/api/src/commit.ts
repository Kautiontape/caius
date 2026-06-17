import type { ScanResult, IndexedTask } from '@caius/index';

export interface CommitChange {
  taskId: string;
  fromGrain: string;
  toGrain: string;
  toBucket?: 'this' | 'next';
  slot?: 'today' | 'tomorrow';
  kind: 'promote' | 'skip' | 'defer' | 'rollback' | 'drop';
  snapshot: { file: string; line: number; text: string };
}

export interface CommitResult {
  applied: CommitChange[];
  conflicts: { taskId: string; reason: string }[];
}

/**
 * Phase-1 commit reconciliation: a diff of the staged intents against a FRESH
 * scan (not a replay). Matches each change by its (file,line) surrogate +
 * snapshot text. (Phase 2 will prefer a minted ^id match, then fall back to the
 * surrogate.) Phase 1 returns the diff and writes nothing.
 */
export function reconcileCommit(fresh: ScanResult, changes: CommitChange[]): CommitResult {
  const applied: CommitChange[] = [];
  const conflicts: { taskId: string; reason: string }[] = [];

  const at = (file: string, line: number): IndexedTask | undefined =>
    fresh.tasks.find((t) => t.file === file && t.line === line);

  for (const c of changes) {
    const live = at(c.snapshot.file, c.snapshot.line);
    if (!live) {
      conflicts.push({ taskId: c.taskId, reason: `task no longer at ${c.snapshot.file}:${c.snapshot.line + 1} (moved or removed)` });
      continue;
    }
    if (live.text !== c.snapshot.text) {
      conflicts.push({ taskId: c.taskId, reason: `task text changed under the session at ${c.snapshot.file}:${c.snapshot.line + 1}` });
      continue;
    }
    applied.push(c);
  }
  return { applied, conflicts };
}
