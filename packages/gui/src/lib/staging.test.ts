import { describe, it, expect } from 'vitest';
import { stagingReducer, type PendingChange, type StagingBuffer } from './staging';

const change = (taskId: string, over: Partial<PendingChange> = {}): PendingChange => ({
  taskId,
  fromGrain: 'week',
  toGrain: 'day',
  toBucket: 'this',
  kind: 'promote',
  snapshot: { file: 'f.md', line: 1, text: 't' },
  ...over,
});

describe('stagingReducer', () => {
  it('stages a change keyed by taskId', () => {
    const s = stagingReducer({}, { type: 'stage', change: change('a') });
    expect(s.a!.kind).toBe('promote');
  });
  it('re-staging the same task overwrites', () => {
    let s: StagingBuffer = stagingReducer({}, { type: 'stage', change: change('a') });
    s = stagingReducer(s, { type: 'stage', change: change('a', { kind: 'drop' }) });
    expect(s.a!.kind).toBe('drop');
    expect(Object.keys(s)).toHaveLength(1);
  });
  it('unstages a task', () => {
    let s: StagingBuffer = stagingReducer({}, { type: 'stage', change: change('a') });
    s = stagingReducer(s, { type: 'unstage', taskId: 'a' });
    expect(s.a).toBeUndefined();
  });
  it('clears the buffer', () => {
    let s: StagingBuffer = stagingReducer({}, { type: 'stage', change: change('a') });
    s = stagingReducer(s, { type: 'clear' });
    expect(Object.keys(s)).toHaveLength(0);
  });
});
