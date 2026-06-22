import { describe, it, expect } from 'vitest';
import { documentTitle, groupSource } from './grouping';
import type { UiTask } from './api';

const t = (over: Partial<UiTask>): UiTask => ({
  id: `${over.file}\n${over.line}`, file: 'x.md', line: 1, text: 't', project: null,
  grain: 'someday', bucket: null, slot: null, estMinutes: null, importance: 0,
  inProgress: false, done: false, ...over,
});

describe('documentTitle', () => {
  it('strips path and .md', () => {
    expect(documentTitle('20 - Area/Health.md')).toBe('Health');
    expect(documentTitle('02 - Periodic/Daily/2026/06/2026-06-20.md')).toBe('2026-06-20');
  });
});

describe('groupSource', () => {
  it('puts project groups first (alpha), then document groups (alpha)', () => {
    const tasks = [
      t({ file: 'a.md', line: 1, project: 'Zebra' }),
      t({ file: 'Health.md', line: 2, project: null }),
      t({ file: 'a.md', line: 3, project: 'Alpha' }),
      t({ file: 'Budget.md', line: 4, project: null }),
    ];
    const groups = groupSource(tasks);
    expect(groups.map((g) => [g.kind, g.title])).toEqual([
      ['project', 'Alpha'], ['project', 'Zebra'], ['document', 'Budget'], ['document', 'Health'],
    ]);
  });
});
