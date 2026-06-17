import { describe, it, expect } from 'vitest';
import type { IndexedTask, ScanResult } from '@caius/index';
import { reconcileCommit, type CommitChange } from '../src/commit.js';

let rowid = 0;
function task(file: string, line: number, text: string): IndexedTask {
  return {
    rowid: ++rowid, blockId: null, file, line, state: 'open', live: true, text,
    importance: 0, estMinutes: null, due: null, done: null, project: null,
    horizon: 'week', grain: 'week', bucket: 'this', area: null, parentRowid: null,
    tokens: [], derivations: [],
  };
}
function fresh(tasks: IndexedTask[]): ScanResult {
  return { files: [], tasks, flags: [], report: {} as ScanResult['report'] };
}
function change(file: string, line: number, text: string): CommitChange {
  return {
    taskId: `${file}\n${line}`, fromGrain: 'week', toGrain: 'day', toBucket: 'this',
    kind: 'promote', snapshot: { file, line, text },
  };
}

describe('reconcileCommit', () => {
  it('applies a staged change when the live line still matches', () => {
    const r = fresh([task('a.md', 1, 'unchanged')]);
    const out = reconcileCommit(r, [change('a.md', 1, 'unchanged')]);
    expect(out.applied).toHaveLength(1);
    expect(out.conflicts).toHaveLength(0);
  });
  it('flags a conflict when the task is gone from its staged location', () => {
    const r = fresh([task('a.md', 5, 'moved away')]);
    const out = reconcileCommit(r, [change('a.md', 1, 'unchanged')]);
    expect(out.applied).toHaveLength(0);
    expect(out.conflicts[0]!.reason).toMatch(/no longer/i);
  });
  it('flags a conflict when the text changed under the session', () => {
    const r = fresh([task('a.md', 1, 'edited in obsidian')]);
    const out = reconcileCommit(r, [change('a.md', 1, 'original text')]);
    expect(out.applied).toHaveLength(0);
    expect(out.conflicts[0]!.reason).toMatch(/changed/i);
  });
  it('commits the clean subset and keeps only the conflict', () => {
    const r = fresh([task('a.md', 1, 'clean'), task('b.md', 2, 'now different')]);
    const out = reconcileCommit(r, [change('a.md', 1, 'clean'), change('b.md', 2, 'was this')]);
    expect(out.applied.map((c) => c.taskId)).toEqual(['a.md\n1']);
    expect(out.conflicts.map((c) => c.taskId)).toEqual(['b.md\n2']);
  });
});
