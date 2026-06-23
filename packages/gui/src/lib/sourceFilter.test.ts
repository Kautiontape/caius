import { describe, it, expect } from 'vitest';
import { filterTasks, sortTasks, EMPTY_FILTERS, type SourceFilters } from './sourceFilter';
import type { UiTask } from './api';

const task = (over: Partial<UiTask>): UiTask => ({
  id: `${over.file ?? 'f.md'}\n${over.line ?? 1}`, file: 'f.md', line: 1, text: 't', project: null,
  grain: 'someday', bucket: null, slot: null, estMinutes: null, importance: 0, due: null,
  notes: [], inProgress: false, done: false, ...over,
});
const f = (over: Partial<SourceFilters> = {}): SourceFilters => ({ ...EMPTY_FILTERS, ...over });

describe('filterTasks', () => {
  const tasks = [
    task({ text: 'Email Sam about venue', project: 'Planning', estMinutes: 30, importance: 2, due: '2026-06-01' }),
    task({ text: 'Buy milk', project: null, estMinutes: null, importance: 0, due: null }),
    task({ text: 'Review deck', project: 'ZeroedIn', estMinutes: 60, importance: 1, due: '2026-12-31' }),
  ];
  it('matches query against text, project, and file (case-insensitive)', () => {
    expect(filterTasks(tasks, f({ query: 'venue' }), '2026-06-23').map(t => t.text)).toEqual(['Email Sam about venue']);
    expect(filterTasks(tasks, f({ query: 'zeroedin' }), '2026-06-23').map(t => t.text)).toEqual(['Review deck']);
  });
  it('filters by project', () => {
    expect(filterTasks(tasks, f({ project: 'Planning' }), '2026-06-23').length).toBe(1);
  });
  it('filters by estimate presence', () => {
    expect(filterTasks(tasks, f({ estimate: 'none' }), '2026-06-23').map(t => t.text)).toEqual(['Buy milk']);
    expect(filterTasks(tasks, f({ estimate: 'has' }), '2026-06-23').length).toBe(2);
  });
  it('filters by minimum importance', () => {
    expect(filterTasks(tasks, f({ minImportance: 2 }), '2026-06-23').map(t => t.text)).toEqual(['Email Sam about venue']);
  });
  it('filters dated and overdue relative to today', () => {
    expect(filterTasks(tasks, f({ due: 'dated' }), '2026-06-23').length).toBe(2);
    expect(filterTasks(tasks, f({ due: 'overdue' }), '2026-06-23').map(t => t.text)).toEqual(['Email Sam about venue']);
  });
});

describe('sortTasks', () => {
  const tasks = [
    task({ text: 'B', importance: 1, estMinutes: 60, due: '2026-02-01', project: 'Z' }),
    task({ text: 'A', importance: 3, estMinutes: null, due: null, project: 'A' }),
    task({ text: 'C', importance: 1, estMinutes: 15, due: '2026-01-01', project: null }),
  ];
  it('sorts by priority desc with title tiebreak', () => {
    expect(sortTasks(tasks, 'priority').map(t => t.text)).toEqual(['A', 'B', 'C']);
  });
  it('sorts by due with nulls last', () => {
    expect(sortTasks(tasks, 'due').map(t => t.text)).toEqual(['C', 'B', 'A']);
  });
  it('sorts by estimate with nulls last', () => {
    expect(sortTasks(tasks, 'estimate').map(t => t.text)).toEqual(['C', 'B', 'A']);
  });
});
