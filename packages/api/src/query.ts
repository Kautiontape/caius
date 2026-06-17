// Read-only query layer over an in-memory ScanResult (§9). Pure functions —
// the HTTP server is a thin shell around these.

import type { IndexedTask, Flag, ScanResult } from '@caius/index';
import type { State } from '@caius/core';

const FUNNEL_ORDER = ['overdue', 'today', 'week', 'orbit', 'planning_ahead', 'someday'];

export interface FunnelLane {
  horizon: string;
  count: number;
  tasks: IndexedTask[];
}
export interface Funnel {
  lanes: FunnelLane[];
  now: IndexedTask[];
  byGrain: Record<string, number>;
}

/** Live tasks grouped by horizon (funnel order) + a cross-cutting `now` lane. */
export function funnel(result: ScanResult): Funnel {
  const live = result.tasks.filter((t) => t.live);
  const byHorizon = new Map<string, IndexedTask[]>();
  for (const t of live) {
    const h = t.horizon ?? 'someday';
    (byHorizon.get(h) ?? byHorizon.set(h, []).get(h)!).push(t);
  }
  const known = FUNNEL_ORDER.filter((h) => byHorizon.has(h));
  const extra = [...byHorizon.keys()].filter((h) => !FUNNEL_ORDER.includes(h)).sort();
  const lanes = [...known, ...extra].map((horizon) => {
    const tasks = byHorizon.get(horizon)!;
    return { horizon, count: tasks.length, tasks };
  });
  const now = result.tasks.filter((t) => t.state === 'in_progress');
  const byGrain: Record<string, number> = {};
  for (const t of live) {
    if (!t.grain) continue;
    byGrain[t.grain] = (byGrain[t.grain] ?? 0) + 1;
  }
  return { lanes, now, byGrain };
}

export interface TaskFilter {
  horizon?: string;
  grain?: string;
  project?: string;
  live?: boolean;
  state?: State;
}

export function filterTasks(result: ScanResult, f: TaskFilter): IndexedTask[] {
  return result.tasks.filter((t) => {
    if (f.horizon !== undefined && t.horizon !== f.horizon) return false;
    if (f.grain !== undefined && t.grain !== f.grain) return false;
    if (f.project !== undefined && t.project !== f.project) return false;
    if (f.live !== undefined && t.live !== f.live) return false;
    if (f.state !== undefined && t.state !== f.state) return false;
    return true;
  });
}

export interface DayPlanGroup {
  project: string | null;
  tasks: IndexedTask[];
}
export interface DayPlan {
  date: string;
  tasks: IndexedTask[];
  byProject: DayPlanGroup[];
  estimatedMinutes: number;
  capacityMinutes: number;
  unestimated: IndexedTask[];
}

function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Today's live tasks (horizon `today` + anything in_progress + due today). */
export function dayPlan(result: ScanResult, now: Date, capacityMinutes: number): DayPlan {
  const date = isoDate(now);
  const tasks = result.tasks.filter(
    (t) => t.live && (t.horizon === 'today' || t.state === 'in_progress' || t.due === date),
  );
  const groups = new Map<string | null, IndexedTask[]>();
  for (const t of tasks) (groups.get(t.project) ?? groups.set(t.project, []).get(t.project)!).push(t);
  const byProject = [...groups.entries()].map(([project, ts]) => ({ project, tasks: ts }));
  const estimatedMinutes = tasks.reduce((sum, t) => sum + (t.estMinutes ?? 0), 0);
  const unestimated = tasks.filter((t) => t.estMinutes === null);
  return { date, tasks, byProject, estimatedMinutes, capacityMinutes, unestimated };
}

export interface ReviewSplit {
  grain: string;
  done: IndexedTask[];
  open: IndexedTask[];
}

/** Tasks at a grain, split into completed (done/cancelled) and still-open. */
export function reviewSplit(result: ScanResult, grain: string): ReviewSplit {
  const at = result.tasks.filter((t) => t.grain === grain);
  return {
    grain,
    done: at.filter((t) => !t.live),
    open: at.filter((t) => t.live),
  };
}

export interface Explanation {
  task: IndexedTask;
  derivations: IndexedTask['derivations'];
}

/** Provenance for a task, found by rowid or blockId. */
export function explain(result: ScanResult, by: { rowid?: number; blockId?: string }): Explanation | null {
  const task = result.tasks.find(
    (t) => (by.rowid !== undefined && t.rowid === by.rowid) || (by.blockId !== undefined && t.blockId === by.blockId),
  );
  return task ? { task, derivations: task.derivations } : null;
}

export interface FlagGroup {
  kind: string;
  severity: Flag['severity'];
  count: number;
}

export function flagsSummary(result: ScanResult): FlagGroup[] {
  const groups = new Map<string, FlagGroup>();
  for (const f of result.flags) {
    const key = `${f.kind}\n${f.severity}`;
    const g = groups.get(key) ?? { kind: f.kind, severity: f.severity, count: 0 };
    g.count += 1;
    groups.set(key, g);
  }
  return [...groups.values()];
}
