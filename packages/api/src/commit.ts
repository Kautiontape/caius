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
 * scan (not a replay). Match by ^id when present, else by the (file,line)
 * surrogate, then compare the staged snapshot. Phase 2 reuses this, then writes.
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
