import { describe, it, expect } from 'vitest';
import type { IndexedTask, ScanResult } from '@caius/index';
import { funnel, filterTasks, dayPlan, explain, flagsSummary } from '../src/query.js';

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

const now = new Date(2026, 5, 17);

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

describe('dayPlan', () => {
  it("collects today's live tasks plus in_progress, grouped by project, with capacity", () => {
    const plan = dayPlan(result, now, 480);
    expect(plan.tasks.map((t) => t.text).sort()).toEqual(['t2', 't4']);
    expect(plan.estimatedMinutes).toBe(60); // t4=60, t2 unestimated
    expect(plan.capacityMinutes).toBe(480);
    expect(plan.unestimated.map((t) => t.text)).toEqual(['t2']);
    expect(plan.byProject.map((g) => g.project).sort()).toEqual(['A', 'B']);
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
