import { describe, it, expect } from 'vitest';
import { summarizeBuffer } from './commitSummary';
import type { StagingBuffer, PendingChange } from './staging';

const change = (id: string, toGrain: PendingChange['toGrain'], text: string): PendingChange => ({
  taskId: id, fromGrain: 'someday', toGrain, kind: 'promote',
  snapshot: { file: 'f.md', line: 1, text },
});

describe('summarizeBuffer', () => {
  it('counts changes and groups them by destination tier', () => {
    const buf: StagingBuffer = {
      a: change('a', 'month', 'Hire designer'),
      b: change('b', 'month', 'Finish draft'),
      c: change('c', 'week', 'Send emails'),
    };
    const s = summarizeBuffer(buf);
    expect(s.total).toBe(3);
    expect(s.byTier).toEqual([{ tier: 'Planned', count: 2 }, { tier: 'Orbit', count: 1 }]);
    expect(s.rows[0]).toEqual({ title: 'Hire designer', toTier: 'Planned', kind: 'promote' });
  });

  it('is empty for an empty buffer', () => {
    expect(summarizeBuffer({})).toEqual({ total: 0, rows: [], byTier: [] });
  });
});
