import type { UiTask } from './api';

export type SortKey = 'priority' | 'due' | 'estimate' | 'project' | 'title';

export interface SourceFilters {
  query: string;
  project: string | null;          // null = all projects
  estimate: 'all' | 'has' | 'none';
  minImportance: 0 | 1 | 2 | 3;
  due: 'all' | 'dated' | 'overdue';
}

export const EMPTY_FILTERS: SourceFilters = { query: '', project: null, estimate: 'all', minImportance: 0, due: 'all' };

/** Pure source-list filter. `today` is an ISO date (YYYY-MM-DD) for overdue compare. */
export function filterTasks(tasks: UiTask[], f: SourceFilters, today: string): UiTask[] {
  const q = f.query.trim().toLowerCase();
  return tasks.filter((t) => {
    if (q && !`${t.text} ${t.project ?? ''} ${t.file}`.toLowerCase().includes(q)) return false;
    if (f.project && t.project !== f.project) return false;
    if (f.estimate === 'has' && t.estMinutes == null) return false;
    if (f.estimate === 'none' && t.estMinutes != null) return false;
    if (t.importance < f.minImportance) return false;
    if (f.due === 'dated' && !t.due) return false;
    if (f.due === 'overdue' && !(t.due && t.due < today)) return false;
    return true;
  });
}

const byTitle = (a: UiTask, b: UiTask) => a.text.localeCompare(b.text);

/** Pure sort with a title tiebreak. Returns a new array. */
export function sortTasks(tasks: UiTask[], key: SortKey): UiTask[] {
  const cmp: Record<SortKey, (a: UiTask, b: UiTask) => number> = {
    priority: (a, b) => b.importance - a.importance || byTitle(a, b),
    due: (a, b) => (a.due ?? '9999-99-99').localeCompare(b.due ?? '9999-99-99') || byTitle(a, b),
    estimate: (a, b) => (a.estMinutes ?? Infinity) - (b.estMinutes ?? Infinity) || byTitle(a, b),
    project: (a, b) => (a.project ?? '~').localeCompare(b.project ?? '~') || byTitle(a, b),
    title: byTitle,
  };
  return [...tasks].sort(cmp[key]);
}
