import type { ScanResult } from '@caius/index';

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

/** Phase-1 reconciliation (fleshed out + tested in Task 16). */
export function reconcileCommit(_fresh: ScanResult, _changes: CommitChange[]): CommitResult {
  return { applied: [], conflicts: [] };
}
