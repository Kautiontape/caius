import type { Grain } from './grains';

/** The subset of the engine's IndexedTask the GUI reads off the wire. */
export interface ApiTask {
  rowid: number;
  blockId: string | null;
  file: string;
  line: number;
  text: string;
  project: string | null;
  grain: Grain | null;
  bucket: 'past' | 'this' | 'next' | 'future' | null;
  estMinutes: number | null;
  importance: number;
  due: string | null;
  notes: string[];
  state: string;
  live: boolean;
}

export interface UiTask {
  id: string;            // (file,line) surrogate — temporary; becomes ^id at Phase-2 commit
  file: string;
  line: number;
  text: string;
  project: string | null;
  grain: Grain | null;
  bucket: ApiTask['bucket'];
  slot: 'today' | 'tomorrow' | null;
  estMinutes: number | null;
  importance: number;
  due: string | null;
  notes: string[];
  inProgress: boolean;
  done: boolean;
}

export const surrogateId = (file: string, line: number) => `${file}\n${line}`;

export function toUiTask(t: ApiTask): UiTask {
  const slot: UiTask['slot'] =
    t.grain === 'day' ? (t.bucket === 'this' ? 'today' : t.bucket === 'next' ? 'tomorrow' : null) : null;
  return {
    id: surrogateId(t.file, t.line),
    file: t.file,
    line: t.line,
    text: t.text,
    project: t.project,
    grain: t.grain,
    bucket: t.bucket,
    slot,
    estMinutes: t.estMinutes,
    importance: t.importance,
    due: t.due,
    notes: t.notes ?? [],
    inProgress: t.state === 'in_progress',
    done: t.state === 'done' || t.state === 'cancelled',
  };
}

const getJson = <T>(u: string): Promise<T> => fetch(u).then((r) => r.json() as Promise<T>);

export async function fetchTasksAtGrain(grain: Grain, bucket?: string): Promise<UiTask[]> {
  const bucketParam = bucket !== undefined ? `&bucket=${bucket}` : '';
  const tasks = await getJson<ApiTask[]>(`/api/tasks?grain=${grain}&live=true${bucketParam}`);
  return tasks.map(toUiTask);
}

export async function fetchOverdue(): Promise<UiTask[]> {
  const tasks = await getJson<ApiTask[]>(`/api/tasks?live=true`);
  return tasks.filter((t) => t.bucket === 'past').map(toUiTask);
}

export async function fetchReview(grain: Grain, period = 'this'): Promise<{ done: UiTask[]; open: UiTask[] }> {
  const r = await getJson<{ done: ApiTask[]; open: ApiTask[] }>(`/api/review/${grain}?period=${period}`);
  return { done: r.done.map(toUiTask), open: r.open.map(toUiTask) };
}

export interface FunnelData { byGrain: Record<string, number>; now: ApiTask[]; }
export const fetchFunnel = () => getJson<FunnelData>('/api/funnel');

export interface SummaryData {
  vault: string;
  capacityMinutes: number;
  report: { fileCount: number; taskCount: number; liveCount: number };
  obsidian: { vault: string; advancedUri: boolean };
}
export const fetchSummary = () => getJson<SummaryData>('/api/summary');

/** Client-side shutdown calc (pure; unit-tested). remainingMin = Σ estimates over
 * the active list; unestimated = how many have no estimate; earliest = now + remainingMin. */
export function shutdown(active: { estMinutes: number | null }[], now: Date) {
  const remainingMin = active.reduce((s, t) => s + (t.estMinutes ?? 0), 0);
  const unestimated = active.filter((t) => t.estMinutes == null).length;
  return { remainingMin, unestimated, earliest: new Date(now.getTime() + remainingMin * 60000) };
}

export interface FocusData { date: string; active: ApiTask[]; doneToday: number; }
export const fetchFocus = () => getJson<FocusData>('/api/focus');

export async function postTask(body: unknown): Promise<{ ok?: true; conflict?: string; task?: ApiTask; error?: string }> {
  let res: Response;
  try {
    res = await fetch('/api/task', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { error: 'network error' };
  }
  try {
    return await res.json();
  } catch {
    return { error: `server error (${res.status})` };
  }
}

/** Quick-add capture: append a brand-new task to the default capture note (or
 * `note`). Returns `{ ok }` on success, or `{ error }` on a network/parse/4xx
 * failure (the caller surfaces it inline). */
export async function postCapture(text: string, note?: string): Promise<{ ok?: true; error?: string }> {
  let res: Response;
  try {
    res = await fetch('/api/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, note }),
    });
  } catch {
    return { error: 'network error' };
  }
  try {
    return await res.json();
  } catch {
    return { error: `server error (${res.status})` };
  }
}
