import { describe, it, expect } from 'vitest';
import type { IndexedTask, ScanResult } from '@caius/index';
import { funnel, filterTasks, reviewSplit, explain, flagsSummary } from '../src/query.js';

let rowid = 0;
function mk(p: Partial<IndexedTask>): IndexedTask {
  return {
    rowid: ++rowid,
    blockId: null,
    file: 'f.md',
    line: 0,
    state: 'open',
    live: true,
    text: 'task',
    importance: 0,
    estMinutes: null,
    due: null,
    done: null,
    project: null,
    horizon: 'someday',
    grain: 'someday',
    bucket: null,
    area: null,
    parentRowid: null,
    tokens: [],
    derivations: [],
    ...p,
  };
}

const t1 = mk({ state: 'open', live: true, horizon: 'overdue', project: 'A', estMinutes: 30, text: 't1' });
const t2 = mk({ state: 'in_progress', live: true, horizon: 'someday', project: 'A', text: 't2' });
const t3 = mk({ state: 'done', live: false, horizon: 'overdue', project: null, text: 't3' });
const t4 = mk({ state: 'open', live: true, horizon: 'today', project: 'B', estMinutes: 60, text: 't4' });
const t5 = mk({ state: 'open', live: true, horizon: 'someday', project: null, text: 't5' });

const result: ScanResult = {
  files: [],
  tasks: [t1, t2, t3, t4, t5],
  flags: [
    { taskRowid: t1.rowid, kind: 'invariant_violation', detail: 'x', severity: 'info' },
    { taskRowid: t4.rowid, kind: 'dangling_ref', detail: 'y', severity: 'warn' },
  ],
  report: {} as ScanResult['report'],
};

describe('funnel', () => {
  it('counts LIVE tasks per horizon, terminal tasks excluded', () => {
    const f = funnel(result);
    const lane = (h: string) => f.lanes.find((l) => l.horizon === h)!;
    expect(lane('overdue').count).toBe(1); // t1 (t3 done excluded)
    expect(lane('today').count).toBe(1); // t4
    expect(lane('someday').count).toBe(2); // t2, t5
  });
  it('orders lanes overdue → someday', () => {
    const order = funnel(result).lanes.map((l) => l.horizon);
    expect(order.indexOf('overdue')).toBeLessThan(order.indexOf('today'));
    expect(order.indexOf('today')).toBeLessThan(order.indexOf('someday'));
  });
  it('surfaces a cross-cutting now lane of in_progress tasks', () => {
    expect(funnel(result).now.map((t) => t.text)).toEqual(['t2']);
  });
});

describe('filterTasks', () => {
  it('filters by live', () => {
    expect(filterTasks(result, { live: true }).map((t) => t.text).sort()).toEqual(['t1', 't2', 't4', 't5']);
  });
  it('filters by horizon', () => {
    expect(filterTasks(result, { horizon: 'today' }).map((t) => t.text)).toEqual(['t4']);
  });
  it('filters by project and state', () => {
    expect(filterTasks(result, { project: 'A' }).map((t) => t.text).sort()).toEqual(['t1', 't2']);
    expect(filterTasks(result, { state: 'in_progress' }).map((t) => t.text)).toEqual(['t2']);
  });
});

describe('explain', () => {
  it('returns the task and its derivations by rowid', () => {
    const t = mk({ text: 'explained', derivations: [{ axis: 'horizon', value: 'today', rule: 'r', source: 's' }] });
    const r: ScanResult = { ...result, tasks: [t] };
    const e = explain(r, { rowid: t.rowid });
    expect(e?.task.text).toBe('explained');
    expect(e?.derivations[0]!.axis).toBe('horizon');
  });
  it('returns null for an unknown id', () => {
    expect(explain(result, { rowid: 99999 })).toBeNull();
  });
});

describe('flagsSummary', () => {
  it('groups flags by kind with counts', () => {
    const s = flagsSummary(result);
    expect(s.find((g) => g.kind === 'invariant_violation')!.count).toBe(1);
    expect(s.find((g) => g.kind === 'dangling_ref')!.count).toBe(1);
  });
});

describe('filterTasks — grain', () => {
  it('filters by grain', () => {
    const a = mk({ text: 'g1', grain: 'week' });
    const b = mk({ text: 'g2', grain: 'day' });
    const r: ScanResult = { ...result, tasks: [a, b] };
    expect(filterTasks(r, { grain: 'week' }).map((t) => t.text)).toEqual(['g1']);
  });
});

describe('funnel — byGrain', () => {
  it('counts live tasks per grain', () => {
    const a = mk({ text: 'g1', grain: 'week', live: true });
    const b = mk({ text: 'g2', grain: 'day', live: true });
    const c = mk({ text: 'g3', grain: 'day', live: false, state: 'done' });
    const r: ScanResult = { ...result, tasks: [a, b, c] };
    expect(funnel(r).byGrain).toEqual({ week: 1, day: 1 });
  });
});

describe('reviewSplit', () => {
  it('splits a grain into done and open', () => {
    const a = mk({ text: 'd1', grain: 'day', live: false, state: 'done' });
    const b = mk({ text: 'o1', grain: 'day', live: true, state: 'open' });
    const c = mk({ text: 'other', grain: 'week', live: true });
    const r: ScanResult = { ...result, tasks: [a, b, c] };
    const split = reviewSplit(r, 'day');
    expect(split.done.map((t) => t.text)).toEqual(['d1']);
    expect(split.open.map((t) => t.text)).toEqual(['o1']);
  });
});
