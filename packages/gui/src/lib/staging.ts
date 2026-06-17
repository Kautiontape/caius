import type { Grain } from './grains';

export type ChangeKind = 'promote' | 'skip' | 'defer' | 'rollback' | 'drop';

export interface PendingChange {
  taskId: string;                 // (file,line) surrogate — temporary; ^id at Phase-2 commit
  fromGrain: Grain;
  toGrain: Grain;                 // 'drop' keeps fromGrain
  toBucket?: 'this' | 'next';
  slot?: 'today' | 'tomorrow';    // only when toGrain === 'day'
  kind: ChangeKind;
  snapshot: { file: string; line: number; text: string }; // for commit reconciliation
}
export type StagingBuffer = Record<string, PendingChange>;

export type StagingAction =
  | { type: 'stage'; change: PendingChange }
  | { type: 'unstage'; taskId: string }
  | { type: 'clear' };

export function stagingReducer(buf: StagingBuffer, a: StagingAction): StagingBuffer {
  switch (a.type) {
    case 'stage':
      return { ...buf, [a.change.taskId]: a.change };
    case 'unstage': {
      const n = { ...buf };
      delete n[a.taskId];
      return n;
    }
    case 'clear':
      return {};
  }
}

export interface CommitResult {
  applied: PendingChange[];
  conflicts: { taskId: string; reason: string }[];
}

/** POST the buffer to the Phase-1 commit endpoint (re-scan + reconcile; no write). */
export async function commit(buf: StagingBuffer): Promise<CommitResult> {
  const res = await fetch('/api/commit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ changes: Object.values(buf) }),
  });
  return (await res.json()) as CommitResult;
}
