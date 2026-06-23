import { describe, it, expect } from 'vitest';
import { documentTitle, groupSource, stripZettelPrefix, displayPath } from './grouping';
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

  it('keeps same-basename files in separate document groups (no basename collision)', () => {
    const tasks = [
      t({ file: '20 - Area/Health.md', line: 1, project: null }),
      t({ file: '10 - Project/Health.md', line: 2, project: null }),
    ];
    const groups = groupSource(tasks);
    const docGroups = groups.filter((g) => g.kind === 'document');
    expect(docGroups).toHaveLength(2);
    expect(docGroups[0].tasks).toHaveLength(1);
    expect(docGroups[1].tasks).toHaveLength(1);
  });
});

describe('stripZettelPrefix / displayPath', () => {
  it('strips a 12–14 digit timestamp id prefix', () => {
    expect(stripZettelPrefix('20240816123018 - Questions for AWS Team')).toBe('Questions for AWS Team');
  });

  it('leaves names without a timestamp prefix untouched', () => {
    expect(stripZettelPrefix('Project Priorities')).toBe('Project Priorities');
  });

  it('documentTitle drops folder, extension, and timestamp prefix', () => {
    expect(documentTitle('10 - Project/Foo/20240816123018 - Questions for AWS Team.md'))
      .toBe('Questions for AWS Team');
  });

  it('displayPath keeps the folder but cleans the basename', () => {
    expect(displayPath('10 - Project/Foo/20240816123018 - Questions for AWS Team.md'))
      .toBe('10 - Project/Foo/Questions for AWS Team');
  });
});
