# Caius Planning Redesign + Focus & Write-back — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Caius's six-ritual planning GUI with one drag-and-drop Plan board (grain dropdown + Plan/Review toggle, grouped source, three horizon buckets), then add the Focus "doing" mode, an edit modal, and quick-add capture — powered by Caius's first real vault write-back.

**Architecture:** Phase A is GUI-only and reuses the existing `/api/tasks`, `/api/commit`, `/api/review`, `/api/funnel` endpoints and the existing `staging.ts` buffer + log-only commit. Phase B adds a pure `renderTaskLine` inverse-parser in `core`, a new `packages/write` I/O primitive (read → reconcile → render → atomic write/append), two new API routes (`POST /api/task`, `POST /api/capture`) and `GET /api/focus`, and the Focus/edit/capture UI.

**Tech Stack:** TypeScript (pnpm workspaces), React 18 + Vite + Tailwind (GUI), `node:sqlite`, vitest. New dep: `@dnd-kit/core` + `@dnd-kit/sortable` (drag-and-drop).

**Spec:** `docs/superpowers/specs/2026-06-22-caius-planning-redesign-design.md` — read it before starting; each task cites the section it implements.

---

## Conventions for every task

- **Build before manual checks:** `corepack pnpm build` (root `tsc -b` + Vite GUI build). The
  `caius serve` process loads from `dist` once at startup and does NOT hot-reload its own JS —
  **restart the server after rebuilding** engine/api code.
- **Run all tests:** `corepack pnpm exec vitest run`. Run one file:
  `corepack pnpm exec vitest run <path>`.
- **Serve for manual/visual checks:** `node packages/cli/dist/main.js serve .testvault --port 7777`
  (background), then drive with the Playwright MCP and screenshot — the repo has **no automated
  browser-test harness**, so drag-and-drop and live-write interactions are verified manually
  this way. All *pure logic* is covered by vitest (TDD below).
- **Commit style:** `topic: message` (e.g. `gui: …`, `core: …`, `api: …`, `write: …`). No
  `Co-Authored-By` lines.
- **Branching:** work on a branch off `main` (e.g. `planning-redesign`); the spec lives on
  `focus-writeback` but the build descends from `main`.

---

## File Structure

**Phase A (GUI-only)**
- `packages/gui/src/lib/grains.ts` — add `BUCKETS: Grain[] = ['month','week','day']` + `BUCKET_LABEL`. (modify)
- `packages/gui/src/lib/grouping.ts` — `documentTitle()`, `groupSource()` pure helpers. (new)
- `packages/gui/src/lib/grouping.test.ts` — unit tests. (new)
- `packages/gui/src/components/PlanHeader.tsx` — grain dropdown + Plan/Review toggle + Focus switch + theme toggle. (new; replaces `RitualHeader.tsx`)
- `packages/gui/src/components/SourceGroup.tsx` — one collapsible group (localStorage-persisted). (new)
- `packages/gui/src/components/HorizonBucket.tsx` — one bucket (emphasis, drop zone, capacity meter). (new)
- `packages/gui/src/components/PlanBoard.tsx` — Source + 3 buckets + DnD context + Commit. (new; replaces `PlanView.tsx` + `DayPlanView.tsx`)
- `packages/gui/src/components/TaskCard.tsx` — add file chip + drag handle + edit affordance. (modify)
- `packages/gui/src/components/ReviewView.tsx` — file chips on non-project rows. (modify)
- `packages/gui/src/App.tsx` — `mode` state; compose PlanHeader + PlanBoard/ReviewView/FocusView. (modify)
- DELETE: `PendingTray.tsx`, `SkipMenu.tsx`, `PlanView.tsx`, `DayPlanView.tsx`, `RitualHeader.tsx`, `RitualSummary.tsx` (RitualSummary only if unused after rework — verify).

**Phase B (write-back + Focus + capture)**
- `packages/core/src/types.ts` — `marker`, `indentText`, `notes` on the line/parsed types. (modify)
- `packages/core/src/parse-line.ts` — populate `marker` + `indentText`. (modify)
- `packages/core/src/render-line.ts` — `renderTaskLine()` + `glyph()`. (new)
- `packages/core/src/index.ts` — export `renderTaskLine`. (modify)
- `packages/core/test/render-line.test.ts` + `render-line.corpus.test.ts` — golden + round-trip. (new)
- `packages/write/` — new package: `src/apply.ts` (`applyTaskUpdate`), `src/append.ts` (`appendTask`), `src/index.ts`, `package.json`, `tsconfig.json`, `test/*`. (new)
- `packages/index/src/scan.ts` — `IndexedTask.notes: string[]`. (modify)
- `packages/resolve/src/config.ts` — `captureNote` config. (modify)
- `packages/api/src/task.ts` — request validation + `applyTaskUpdate`/`appendTask` wiring. (new)
- `packages/api/src/server.ts` — `POST /api/task`, `POST /api/capture`, `GET /api/focus`. (modify)
- `packages/api/src/query.ts` — `reviewSplit` done-only; `focus()`. (modify)
- `packages/api/test/*` — endpoint integration tests. (new)
- `packages/gui/src/lib/api.ts` — `postTask()`, `postCapture()`, `fetchFocus()`, `shutdown()`. (modify)
- `packages/gui/src/lib/shutdown.test.ts` — `shutdown()` unit test. (new)
- `packages/gui/src/components/FocusView.tsx`, `ShutdownBar.tsx`, `EditModal.tsx`, `QuickAdd.tsx`. (new)

---

# PHASE A — Planning surface redesign (GUI-only)

## Task A1: Grain/bucket constants + nav scaffold (PlanHeader, mode state)

Implements spec §A1. Replaces the 6-ritual header with a grain dropdown + Plan/Review toggle + (inert) Focus switch.

**Files:**
- Modify: `packages/gui/src/lib/grains.ts`
- Create: `packages/gui/src/components/PlanHeader.tsx`
- Modify: `packages/gui/src/App.tsx`
- Delete (end of task): `packages/gui/src/components/RitualHeader.tsx`

- [ ] **Step 1: Add bucket constants to `grains.ts`**

Append to `packages/gui/src/lib/grains.ts`:

```ts
/** The three horizon buckets, coarsest→finest (someday is the source, not a bucket). */
export const BUCKETS: Grain[] = ['month', 'week', 'day'];
/** Bucket display labels (month renamed "Planned" per the redesign). */
export const BUCKET_LABEL: Record<'month' | 'week' | 'day', string> = {
  month: 'Planned', week: 'Orbit', day: 'Today',
};
```

- [ ] **Step 2: Create `PlanHeader.tsx`**

```tsx
import { type Altitude, type Posture } from '../lib/grains';
import { ThemeToggle } from './ThemeToggle';

interface Props {
  altitude: Altitude;
  posture: Posture;
  mode: 'plan' | 'focus';
  onGrain: (a: Altitude) => void;
  onPosture: (p: Posture) => void;
  onMode: (m: 'plan' | 'focus') => void;
}

const GRAINS: { value: Altitude; label: string }[] = [
  { value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }, { value: 'day', label: 'Day' },
];

export function PlanHeader({ altitude, posture, mode, onGrain, onPosture, onMode }: Props) {
  return (
    <header className="flex items-center gap-4 border-b border-line px-5 py-4">
      <select
        data-testid="grain-select"
        value={altitude}
        onChange={(e) => onGrain(e.target.value as Altitude)}
        disabled={mode === 'focus'}
        className="rounded-md bg-panel2 px-2 py-1 text-xl font-medium text-ink disabled:opacity-40"
      >
        {GRAINS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
      </select>

      <div className="flex rounded-full bg-panel2 p-0.5 text-sm" data-testid="posture-toggle">
        {(['plan', 'review'] as Posture[]).map((ps) => (
          <button
            key={ps}
            data-testid={`posture-${ps}`}
            onClick={() => { onMode('plan'); onPosture(ps); }}
            className={`rounded-full px-3 py-1 capitalize ${
              mode === 'plan' && posture === ps ? 'bg-accent text-bg' : 'text-dim'
            }`}
          >
            {ps}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button
          data-testid="mode-focus"
          onClick={() => onMode('focus')}
          className={`rounded-full px-3 py-1 text-sm ${mode === 'focus' ? 'bg-good text-bg' : 'text-dim'}`}
        >
          Focus
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Rewire `App.tsx` to use PlanHeader + a `mode` + a PlanBoard placeholder**

In `packages/gui/src/App.tsx`: add `const [mode, setMode] = useState<'plan' | 'focus'>('plan');`, set the default grain to day (already `'day'`), replace `<RitualHeader .../>` with:

```tsx
<PlanHeader
  altitude={altitude}
  posture={posture}
  mode={mode}
  onGrain={setAltitude}
  onPosture={setPosture}
  onMode={setMode}
/>
```

Replace the import of `RitualHeader` with `import { PlanHeader } from './components/PlanHeader';`. Temporarily keep the existing `<main>` body so the app still renders (PlanBoard arrives in A2–A4).

- [ ] **Step 4: Update tests that referenced the old header**

Search: `grep -rn "ritual-title\|RitualHeader\|ritual-menu\|menu-" packages/gui packages/api`. Update or remove assertions tied to the removed 6-item dropdown (`ritual-title`, `ritual-menu`, `menu-<alt>-<posture>`). Keep `posture-toggle`/`posture-plan`/`posture-review` (still present). Add nothing new yet.

- [ ] **Step 5: Build, run tests, manual check**

Run: `corepack pnpm build` then `corepack pnpm exec vitest run`. Expected: PASS.
Serve + screenshot via Playwright MCP: header shows a Month/Week/Day `<select>`, a Plan|Review pill, a Focus button, theme toggle. Both themes still render.

- [ ] **Step 6: Delete `RitualHeader.tsx` and commit**

```bash
git rm packages/gui/src/components/RitualHeader.tsx
git add -A
git commit -m "gui: Replace ritual header with grain dropdown + Plan/Review/Focus nav"
```

---

## Task A2: Source grouping helper + SourceGroup + file chip on TaskCard

Implements spec §A2. Group the Someday backlog by project / document title (collapsible), and label non-project tasks with their file.

**Files:**
- Create: `packages/gui/src/lib/grouping.ts`, `packages/gui/src/lib/grouping.test.ts`
- Create: `packages/gui/src/components/SourceGroup.tsx`
- Modify: `packages/gui/src/components/TaskCard.tsx`

- [ ] **Step 1: Write the failing test `grouping.test.ts`**

```ts
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
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module './grouping'`).

Run: `corepack pnpm exec vitest run packages/gui/src/lib/grouping.test.ts`

- [ ] **Step 3: Implement `grouping.ts`**

```ts
import type { UiTask } from './api';

export type SourceGroup = {
  kind: 'project' | 'document';
  key: string;   // stable id for collapse persistence
  title: string;
  tasks: UiTask[];
};

export function documentTitle(file: string): string {
  const base = file.split('/').pop() ?? file;
  return base.replace(/\.md$/i, '');
}

export function groupSource(tasks: UiTask[]): SourceGroup[] {
  const projects = new Map<string, UiTask[]>();
  const docs = new Map<string, { file: string; tasks: UiTask[] }>();
  for (const t of tasks) {
    if (t.project) {
      (projects.get(t.project) ?? projects.set(t.project, []).get(t.project)!).push(t);
    } else {
      const title = documentTitle(t.file);
      (docs.get(title) ?? docs.set(title, { file: t.file, tasks: [] }).get(title)!).tasks.push(t);
    }
  }
  const byKey = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title);
  const projectGroups: SourceGroup[] = [...projects.entries()]
    .map(([title, tasks]) => ({ kind: 'project' as const, key: `project:${title}`, title, tasks }))
    .sort(byKey);
  const docGroups: SourceGroup[] = [...docs.entries()]
    .map(([title, { file, tasks }]) => ({ kind: 'document' as const, key: `doc:${file}`, title, tasks }))
    .sort(byKey);
  return [...projectGroups, ...docGroups];
}
```

- [ ] **Step 4: Run the test — expect PASS.**

- [ ] **Step 5: Add a file chip to `TaskCard.tsx`**

Add an optional `showFile` prop and render the vault-relative path for non-project tasks. Change the `Props` interface and the meta row:

```tsx
interface Props {
  task: UiTask;
  staged?: boolean;
  showFile?: boolean;   // show the source file chip (for non-project tasks in flat lists)
  actions?: ReactNode;
}
```

In the meta row (the `mt-1.5 flex flex-wrap` div), after the importance span add:

```tsx
{showFile && !task.project && (
  <span className="rounded border border-line bg-panel px-1.5 text-[11px] text-dim" data-testid="file-chip">
    {task.file}
  </span>
)}
```

- [ ] **Step 6: Create `SourceGroup.tsx`** (collapsible; persists per `group.key` in localStorage)

```tsx
import { useState, type ReactNode } from 'react';
import type { SourceGroup as Group } from '../lib/grouping';

const KEY = (k: string) => `caius-collapsed:${k}`;

export function SourceGroup({ group, renderTask }: { group: Group; renderTask: (t: Group['tasks'][number]) => ReactNode }) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY(group.key)) === '1'; } catch { return false; }
  });
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(KEY(group.key), next ? '1' : '0'); } catch { /* ignore */ }
  };
  const icon = group.kind === 'project' ? '📁' : '📄';
  return (
    <div data-testid="source-group">
      <button
        onClick={toggle}
        data-testid={`group-toggle-${group.key}`}
        className="mb-1.5 flex w-full items-center gap-1 text-xs uppercase tracking-wide text-dim"
      >
        <span>{collapsed ? '▸' : '▾'}</span><span>{icon}</span><span>{group.title}</span>
        <span className="ml-1 normal-case">({group.tasks.length})</span>
      </button>
      {!collapsed && <div className="mb-3 flex flex-col gap-1.5">{group.tasks.map(renderTask)}</div>}
    </div>
  );
}
```

- [ ] **Step 7: Run tests + commit**

Run: `corepack pnpm exec vitest run`. Expected: PASS.

```bash
git add -A
git commit -m "gui: Add source grouping (project/document) + collapsible groups + file chip"
```

---

## Task A3: HorizonBucket + PlanBoard (buckets, emphasis, capacity, Commit) — no DnD yet

Implements spec §A3. Renders the Source (grouped) and the three buckets with emphasis; interim click-to-stage keeps it usable until A4 adds drag.

**Files:**
- Create: `packages/gui/src/components/HorizonBucket.tsx`, `packages/gui/src/components/PlanBoard.tsx`
- Modify: `packages/gui/src/App.tsx`
- Delete (end of task): `packages/gui/src/components/PendingTray.tsx`

- [ ] **Step 1: Create `HorizonBucket.tsx`**

```tsx
import type { ReactNode } from 'react';
import { BUCKET_LABEL } from '../lib/grains';

interface Props {
  grain: 'month' | 'week' | 'day';
  emphasized: boolean;
  count: number;
  capacity?: { estMinutes: number; capacityMinutes: number }; // Today only
  dropActive?: boolean;       // true while a drag is in progress (A4)
  children: ReactNode;        // staged/member cards
}

export function HorizonBucket({ grain, emphasized, count, capacity, dropActive, children }: Props) {
  const over = capacity ? capacity.estMinutes > capacity.capacityMinutes : false;
  return (
    <div
      data-testid={`bucket-${grain}`}
      data-emphasized={emphasized ? 'true' : 'false'}
      className={`rounded-lg border bg-panel p-3 transition-all ${
        emphasized ? 'border-2 border-accent shadow-sm' : 'border border-line opacity-80'
      } ${dropActive ? 'ring-2 ring-accent/50' : ''}`}
    >
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-dim">
        <span>{BUCKET_LABEL[grain]}</span>
        {capacity
          ? <span data-testid="cap-today" className={over ? 'text-over' : ''}>{capacity.estMinutes}/{capacity.capacityMinutes}m</span>
          : <span>{count}</span>}
      </div>
      <div className="mt-2 flex flex-col gap-1.5">{children}</div>
      {dropActive && <div className="mt-2 rounded border border-dashed border-accent bg-accent/10 p-2 text-center text-xs text-accent">drop here</div>}
    </div>
  );
}
```

- [ ] **Step 2: Create `PlanBoard.tsx`** (Source grouped + 3 buckets + Commit; interim click-stage)

```tsx
import { useEffect, useState } from 'react';
import { BUCKETS, type Altitude } from '../lib/grains';
import { fetchTasksAtGrain, type UiTask } from '../lib/api';
import { groupSource } from '../lib/grouping';
import type { PendingChange, StagingBuffer } from '../lib/staging';
import { commit, type CommitResult } from '../lib/staging';
import { SourceGroup } from './SourceGroup';
import { HorizonBucket } from './HorizonBucket';
import { TaskCard } from './TaskCard';

interface Props {
  altitude: Altitude;                 // emphasized bucket = this grain
  capacityMinutes: number;
  buffer: StagingBuffer;
  onStage: (c: PendingChange) => void;
  onUnstage: (taskId: string) => void;
  onCommit: () => void;
  conflicts: CommitResult['conflicts'];
}

export function PlanBoard({ altitude, capacityMinutes, buffer, onStage, onUnstage, onCommit, conflicts }: Props) {
  const [source, setSource] = useState<UiTask[]>([]);
  const [members, setMembers] = useState<Record<string, UiTask[]>>({ month: [], week: [], day: [] });

  useEffect(() => { void fetchTasksAtGrain('someday').then(setSource); }, []);
  useEffect(() => {
    for (const g of BUCKETS) void fetchTasksAtGrain(g, 'this').then((ts) => setMembers((m) => ({ ...m, [g]: ts })));
  }, []);

  const stageInto = (t: UiTask, grain: 'month' | 'week' | 'day') => onStage({
    taskId: t.id, fromGrain: t.grain ?? 'someday', toGrain: grain,
    toBucket: 'this', slot: grain === 'day' ? 'today' : undefined,
    kind: 'promote', snapshot: { file: t.file, line: t.line, text: t.text },
  });

  const stagedFor = (grain: string) => Object.values(buffer).filter((c) => c.toGrain === grain);
  const unstaged = source.filter((t) => !buffer[t.id]);
  const estFor = (tasks: UiTask[]) => tasks.reduce((s, t) => s + (t.estMinutes ?? 0), 0);

  return (
    <section data-testid="plan-board" className="grid grid-cols-[1.4fr_1fr] gap-5 p-5">
      <div className="rounded-lg border border-line bg-panel p-3 shadow-sm" data-testid="source">
        <div className="mb-2 text-xs uppercase tracking-wide text-dim">Source · Someday backlog</div>
        {unstaged.length === 0 && <div className="italic text-dim" data-testid="source-empty">Someday is empty.</div>}
        {groupSource(unstaged).map((group) => (
          <SourceGroup
            key={group.key}
            group={group}
            renderTask={(t) => (
              <TaskCard
                key={t.id}
                task={t}
                showFile
                actions={
                  <div className="flex gap-1">
                    {BUCKETS.map((g) => (
                      <button key={g} onClick={() => stageInto(t, g)} data-testid={`stage-${g}`}
                        className="rounded bg-panel2 px-1.5 py-0.5 text-[11px] text-accent">{g[0].toUpperCase()}</button>
                    ))}
                  </div>
                }
              />
            )}
          />
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {BUCKETS.map((g) => {
          const staged = stagedFor(g);
          const member = members[g] ?? [];
          const cards = [
            ...member.map((t) => <TaskCard key={`m-${t.id}`} task={t} showFile />),
            ...staged.map((c) => {
              const t = source.find((s) => s.id === c.taskId);
              return t ? <TaskCard key={`s-${t.id}`} task={t} staged showFile
                actions={<button onClick={() => onUnstage(t.id)} className="text-dim hover:text-over text-sm">×</button>} /> : null;
            }),
          ];
          return (
            <HorizonBucket
              key={g}
              grain={g}
              emphasized={g === altitude}
              count={member.length + staged.length}
              capacity={g === 'day' ? { estMinutes: estFor([...member, ...staged.map((c) => source.find((s) => s.id === c.taskId)!).filter(Boolean)]), capacityMinutes } : undefined}
            >
              {cards.length ? cards : <div className="text-xs italic text-dim">empty</div>}
            </HorizonBucket>
          );
        })}
        {conflicts.length > 0 && (
          <div className="rounded border border-over/40 p-2 text-xs text-over" data-testid="board-conflicts">
            {conflicts.length} conflict(s) kept staged.
          </div>
        )}
        <button data-testid="commit-button" disabled={Object.keys(buffer).length === 0} onClick={onCommit}
          className="rounded-lg bg-accent px-3 py-2 text-bg disabled:opacity-40">commit plan</button>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire `PlanBoard` into `App.tsx`**

Replace the `<main>…</main>` block (the PlanView/DayPlanView/PendingTray composition) so that when `mode === 'plan' && posture === 'plan'` it renders `<PlanBoard altitude={altitude} capacityMinutes={summary?.capacityMinutes ?? 480} buffer={buffer} onStage={onStage} onUnstage={onUnstage} onCommit={() => void onCommit()} conflicts={conflicts} />`, and when `posture === 'review'` it renders the existing `<ReviewView .../>` (kept). Remove `<PendingTray/>`, `<PlanView/>`, `<DayPlanView/>` usages and imports. Keep `PipelineStrip`.

- [ ] **Step 4: Build + tests + manual check**

Run: `corepack pnpm build` && `corepack pnpm exec vitest run`. Expected: PASS (fix any test importing the removed components).
Serve + screenshot: Source shows collapsible groups; three buckets with the day bucket emphasized by default (Today large, Planned/Orbit minimized); clicking M/W/D on a source card moves it (staged) into a bucket; Commit posts.

- [ ] **Step 5: Delete `PendingTray.tsx`; commit**

```bash
git rm packages/gui/src/components/PendingTray.tsx
git add -A
git commit -m "gui: Add PlanBoard with three horizon buckets, emphasis, and commit"
```

---

## Task A4: Drag-and-drop with @dnd-kit (remove SkipMenu/PlanView/DayPlanView + click-stage)

Implements spec §A4. Drag is the single way tasks move; drop zones appear only during a drag, on every bucket.

**Files:**
- Modify: `packages/gui/package.json` (add deps), `packages/gui/src/components/PlanBoard.tsx`, `TaskCard.tsx`
- Delete: `packages/gui/src/components/SkipMenu.tsx`, `PlanView.tsx`, `DayPlanView.tsx`

- [ ] **Step 1: Add the dependency**

Run: `corepack pnpm --filter @caius/gui add @dnd-kit/core@^6 @dnd-kit/sortable@^8`
Expected: `package.json` gains both; lockfile updates.

- [ ] **Step 2: Make `TaskCard` a drag handle target**

Add an optional `dragHandleProps` passthrough so PlanBoard can attach dnd listeners:

```tsx
interface Props {
  task: UiTask; staged?: boolean; showFile?: boolean; actions?: ReactNode;
  dragHandle?: ReactNode;   // a ⠿ grip wired by the parent
}
```

Render `dragHandle` at the start of the top row: `<div className="flex items-start gap-2">{dragHandle}<div className="flex-1 …">…`.

- [ ] **Step 3: Wrap PlanBoard in a `DndContext`; make cards draggable and Source + buckets droppable**

In `PlanBoard.tsx`:
- Import: `import { DndContext, useDraggable, useDroppable, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';`
- Add `const [dragging, setDragging] = useState(false);` and `const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));`
- Create a `DraggableCard` wrapper:

```tsx
function DraggableCard({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.5 : 1 } : undefined;
  const handle = <button ref={setNodeRef as any} {...listeners} {...attributes} className="cursor-grab text-dim" aria-label="drag">⠿</button>;
  return <div style={style as any}>{children(handle)}</div>;
}
```

- Wrap each bucket and the Source container with `useDroppable`. Use droppable ids: `bucket:month`, `bucket:week`, `bucket:day`, `source`. Pass `dropActive={dragging}` to each `HorizonBucket`.
- Replace the click-stage M/W/D buttons with the drag handle (`dragHandle={handle}` on each `TaskCard`).
- Handle `onDragStart={() => setDragging(true)}` and:

```tsx
const onDragEnd = (e: DragEndEvent) => {
  setDragging(false);
  const taskId = String(e.active.id);
  const over = e.over ? String(e.over.id) : null;
  if (!over) return;
  if (over === 'source') { onUnstage(taskId); return; }
  const grain = over.replace('bucket:', '') as 'month' | 'week' | 'day';
  const t = source.find((s) => s.id === taskId) ?? Object.values(buffer).find((c) => c.taskId === taskId)?.snapshot
    ? source.find((s) => s.id === taskId) : undefined;
  if (!t) { // staged card moved between buckets: re-stage from buffer snapshot
    const c = buffer[taskId];
    if (c) onStage({ ...c, toGrain: grain, toBucket: 'this', slot: grain === 'day' ? 'today' : undefined });
    return;
  }
  onStage({ taskId: t.id, fromGrain: t.grain ?? 'someday', toGrain: grain, toBucket: 'this',
    slot: grain === 'day' ? 'today' : undefined, kind: 'promote', snapshot: { file: t.file, line: t.line, text: t.text } });
};
```

Wrap the returned JSX: `<DndContext sensors={sensors} onDragStart={…} onDragEnd={onDragEnd}>…</DndContext>`.

- [ ] **Step 4: Build + manual verification (drag is interaction-only — verify in browser)**

Run: `corepack pnpm build`, restart serve. Via Playwright MCP: at rest no drop zones and emphasis correct; on drag-start all buckets show a "drop here" zone; dropping a source card into each bucket stages it (count rises); dragging a staged card to another bucket re-targets; dragging back to Source un-stages; Commit still posts. Screenshot resting + mid-drag.

- [ ] **Step 5: Delete dead components; fix imports; commit**

```bash
git rm packages/gui/src/components/SkipMenu.tsx packages/gui/src/components/PlanView.tsx packages/gui/src/components/DayPlanView.tsx
grep -rn "SkipMenu\|PlanView\|DayPlanView" packages/gui/src   # expect no matches
corepack pnpm exec vitest run                                  # expect PASS
git add -A
git commit -m "gui: Drag-and-drop staging via @dnd-kit; remove SkipMenu and old plan views"
```

---

## Task A5: Review page (full-area via toggle) + file chips

Implements spec §A5.

**Files:**
- Modify: `packages/gui/src/components/ReviewView.tsx`, `packages/gui/src/App.tsx`

- [ ] **Step 1: Add file chips to non-project rows in `ReviewView.tsx`**

Wherever a review row renders a task, pass `showFile` to its `TaskCard` (or, if it renders raw rows, add the same `data-testid="file-chip"` span gated on `!task.project`). Match the chip markup from Task A2 Step 5.

- [ ] **Step 2: Ensure the Plan/Review toggle swaps the full board area in `App.tsx`**

Confirm `posture === 'review'` (and `mode === 'plan'`) renders `<ReviewView …/>` full-width (no PlanBoard alongside). The grain dropdown scopes the review grain (`ritual.grain` via `RITUALS[altitude].review`).

- [ ] **Step 3: Build, test, manual check, commit**

Run: `corepack pnpm build` && `corepack pnpm exec vitest run` (PASS). Serve: toggling Review shows the review for the selected grain with file chips on non-project rows.

```bash
git add -A
git commit -m "gui: Review as full-area page via toggle; file chips on review rows"
```

---

# PHASE B — Focus, in-place write-back, capture

> Phase B introduces Caius's **first disk writes**. The planning commit (Phase A) stays
> log-only. Read spec §B0–§B6. Every write goes through `packages/write` (read → reconcile →
> atomic temp-file + rename) so a stale client can never clobber a changed line.

## Task B1: `renderTaskLine` in core (inverse parser) + round-trip safety net

Implements spec §B1 (engine half).

**Files:**
- Modify: `packages/core/src/types.ts`, `packages/core/src/parse-line.ts`, `packages/core/src/index.ts`
- Create: `packages/core/src/render-line.ts`, `packages/core/test/render-line.test.ts`, `packages/core/test/render-line.corpus.test.ts`

- [ ] **Step 1: Read the parser** — open `packages/core/src/parse-line.ts`, `types.ts`, `tokenize.ts`. Note the `ParsedTask`/line type, the `Token` type (it already retains a `raw` string per token), and the state enum. The render code below must use those exact field names.

- [ ] **Step 2: Add `marker` + `indentText` to the line type and populate them**

In `types.ts`, add to the parsed line/task type: `marker: '-' | '*' | '+'` and `indentText: string`. In `parse-line.ts`, capture the raw leading whitespace (`indentText`) and the bullet marker character from the line and set them on the result. Do not change any existing field.

- [ ] **Step 3: Write the failing golden test `render-line.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parseLine } from '../src/parse-line';          // use core's actual line-parse export
import { renderTaskLine } from '../src/render-line';

const round = (line: string) => renderTaskLine(parseLine(line)!);

describe('renderTaskLine', () => {
  it('byte-identical for unchanged well-formed lines', () => {
    for (const line of [
      '- [ ] plain task',
      '  - [/] in progress ~30m',
      '* [x] done with project :[[Caius]]',
      '+ [-] cancelled !! *2026-07-01',
      '- [ ] with anchor ^abc123',
    ]) expect(round(line)).toBe(line);
  });

  it('renders changed state via the glyph map', () => {
    const t = parseLine('- [ ] task')!;
    expect(renderTaskLine({ ...t, state: 'done' })).toBe('- [x] task');
  });
});
```

- [ ] **Step 4: Run it — expect FAIL** (`renderTaskLine` undefined).
Run: `corepack pnpm exec vitest run packages/core/test/render-line.test.ts`

- [ ] **Step 5: Implement `render-line.ts`**

```ts
import type { ParsedTask } from './types';   // align name with core's exported parsed-line type

const GLYPH: Record<string, string> = {
  open: ' ', in_progress: '/', done: 'x', cancelled: '-', tombstone: '>',
};

export function renderTaskLine(t: ParsedTask): string {
  const tokens = t.tokens.map((tok) =>
    tok.changed ? renderToken(tok) : tok.raw,   // unchanged tokens emit raw (preserves spacing)
  ).join('');
  const anchor = t.blockId ? ` ^${t.blockId}` : '';
  return `${t.indentText}${t.marker} [${GLYPH[t.state]}] ${t.text}${tokens}${anchor}`;
}

// Re-render a token from its typed value when it was changed/added.
function renderToken(tok: { type: string; value: unknown }): string {
  switch (tok.type) {
    case 'estimate': { const m = tok.value as number;
      return m % 60 === 0 ? ` ~${m / 60}h` : m > 60 ? ` ~${Math.floor(m / 60)}h${m % 60}m` : ` ~${m}m`; }
    case 'importance': return ' ' + '!'.repeat(tok.value as number);
    case 'due': return ` *${tok.value as string}`;
    case 'project': return ` :[[${tok.value as string}]]`;
    default: return '';
  }
}
```

Notes: align `ParsedTask`, `tokens`, `tok.raw`, `tok.changed`, `tok.type`, `tok.value` with core's actual types from Step 1; if tokens have no `changed` flag yet, add one (default false) set when a patch mutates a token (Task B-write below sets it).

- [ ] **Step 6: Run golden test — expect PASS.** Export `renderTaskLine` from `packages/core/src/index.ts`.

- [ ] **Step 7: Write the corpus round-trip test `render-line.corpus.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseLine } from '../src/parse-line';
import { renderTaskLine } from '../src/render-line';
// Reuse the corpus walker used by the existing corpus integration test
// (see packages/core/test/corpus.integration.test.ts for how it enumerates .testvault task lines).

describe('renderTaskLine corpus round-trip', () => {
  it('parse(render(parse(line))) is structurally equal to parse(line) for every task line', () => {
    // For each raw task line in .testvault:
    //   const a = parseLine(line); const b = parseLine(renderTaskLine(a!));
    //   expect(structural(b)).toEqual(structural(a));   // compare state/text/tokens(value)/marker/indent
    // And byte-identity on well-formed unchanged lines: expect(renderTaskLine(a!)).toBe(line) where a.wellFormed.
  });
});
```

Implement it by mirroring the existing corpus test's file enumeration. Run: expect PASS over all corpus task lines.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "core: Add renderTaskLine inverse parser + marker/indentText + corpus round-trip"
```

## Task B2: `packages/write` — applyTaskUpdate (read → reconcile → render → atomic write)

Implements spec §B1 (I/O half).

**Files:**
- Create: `packages/write/package.json`, `packages/write/tsconfig.json`, `packages/write/src/index.ts`, `packages/write/src/apply.ts`, `packages/write/test/apply.test.ts`
- Modify: root `tsconfig.json` (add the project reference), `packages/index/src/scan.ts` (`notes`)

- [ ] **Step 1: Scaffold the package** — mirror an existing leaf package (e.g. `packages/resolve`): `package.json` name `@caius/write`, `type: module`, `main`/`exports` → `dist`, dep on `@caius/core`; `tsconfig.json` extends `tsconfig.base.json` with a reference to `../core`. Add `{ "path": "packages/write" }` to root `tsconfig.json` references.

- [ ] **Step 2: Write the failing test `apply.test.ts`** (temp-file based)

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyTaskUpdate } from '../src/apply';

const setup = (content: string) => {
  const root = mkdtempSync(join(tmpdir(), 'caius-write-'));
  writeFileSync(join(root, 'note.md'), content);
  return root;
};

describe('applyTaskUpdate', () => {
  it('toggles state and writes atomically', () => {
    const root = setup('- [ ] task one\n- [ ] task two\n');
    const r = applyTaskUpdate(root, { file: 'note.md', line: 0, expectedText: 'task one', patch: { state: 'done' } });
    expect(r.ok).toBe(true);
    expect(readFileSync(join(root, 'note.md'), 'utf8')).toBe('- [x] task one\n- [ ] task two\n');
  });

  it('returns a conflict and writes nothing when the line changed under you', () => {
    const root = setup('- [ ] changed already\n');
    const r = applyTaskUpdate(root, { file: 'note.md', line: 0, expectedText: 'old text', patch: { state: 'done' } });
    expect(r).toMatchObject({ conflict: expect.any(String) });
    expect(readFileSync(join(root, 'note.md'), 'utf8')).toBe('- [ ] changed already\n');
  });

  it('replaces the contiguous indented note block (description), preserving subtasks', () => {
    const root = setup('- [ ] parent\n  old note line\n  - [ ] child\n');
    applyTaskUpdate(root, { file: 'note.md', line: 0, expectedText: 'parent', patch: { description: 'new note' } });
    expect(readFileSync(join(root, 'note.md'), 'utf8')).toBe('- [ ] parent\n  new note\n  - [ ] child\n');
  });
});
```

- [ ] **Step 3: Run — expect FAIL** (`applyTaskUpdate` undefined).

- [ ] **Step 4: Implement `apply.ts`**

```ts
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parseLine, renderTaskLine } from '@caius/core';

export interface TaskPatch {
  state?: 'open' | 'in_progress' | 'done' | 'cancelled';
  text?: string; estMinutes?: number | null; importance?: 0 | 1 | 2 | 3;
  due?: string | null; project?: string | null; description?: string;
}
export interface UpdateReq { file: string; line: number; expectedText: string; patch: TaskPatch; }
export type UpdateResult = { ok: true } | { conflict: string };

export function applyTaskUpdate(root: string, req: UpdateReq): UpdateResult {
  const abs = join(root, req.file);
  const lines = readFileSync(abs, 'utf8').split('\n');
  const parsed = parseLine(lines[req.line]);
  if (!parsed || parsed.text !== req.expectedText) return { conflict: 'line changed under you' };

  // Apply scalar/token patches onto the parsed task, marking changed tokens, then re-render.
  const next = applyPatch(parsed, req.patch);
  lines[req.line] = renderTaskLine(next);

  if (req.patch.description !== undefined) replaceNoteBlock(lines, req.line, parsed.indentText, req.patch.description);

  const tmp = join(dirname(abs), `.${req.line}.${process.pid}.tmp`);
  writeFileSync(tmp, lines.join('\n'));
  renameSync(tmp, abs);
  return { ok: true };
}
```

Implement `applyPatch(parsed, patch)` (set `state`/`text`; for each token field present in `patch`, update/insert/remove the matching token and set its `changed` flag so `renderTaskLine` re-renders it) and `replaceNoteBlock(lines, taskLineIdx, indentText, description)` (replace the contiguous non-task indented lines immediately under the task — stop at the first child task line or a dedent — with the new description re-indented `indentText + '  '`). Keep both in `apply.ts`; unit-test edge cases (add/change/clear each token) by extending `apply.test.ts`.

- [ ] **Step 5: Run tests — expect PASS.**

- [ ] **Step 6: Add `notes: string[]` to `IndexedTask`** in `packages/index/src/scan.ts`, copied from the parsed task's note lines (the parser already collects them). Keep existing fields.

- [ ] **Step 7: Build + tests + commit**

Run: `corepack pnpm build` (verifies `@caius/write` compiles + is referenced) && `corepack pnpm exec vitest run`. Expected: PASS.

```bash
git add -A
git commit -m "write: Add @caius/write applyTaskUpdate (reconcile + atomic write); IndexedTask.notes"
```

## Task B3: POST /api/task + archive/state semantics (cancelled hidden)

Implements spec §B2.

**Files:**
- Create: `packages/api/src/task.ts`, `packages/api/test/task.integration.test.ts`
- Modify: `packages/api/src/server.ts`, `packages/api/src/query.ts`

- [ ] **Step 1: Read the existing POST pattern** — in `server.ts` study the `/api/commit` handler (POST body read + `req.method === 'POST'`); mirror it.

- [ ] **Step 2: Write the failing integration test** mirroring the existing commit integration test (`packages/api/test/`): write a temp vault, scan, `POST /api/task` toggling a real line, assert the file changed on disk and a 200 with the updated task; a second call with a stale `expectedText` returns 409 and leaves the file unchanged.

- [ ] **Step 3: Implement `task.ts`** — validate `{ file, line, expectedText, patch }`, call `applyTaskUpdate(root, req)`, on `ok` trigger a re-scan (or rely on the watcher) and return the re-read task; on `conflict` return `{ status: 409, conflict }`.

- [ ] **Step 4: Add the route in `server.ts`** — `if (p === '/api/task' && req.method === 'POST') { … read body … handleTask … json(res, body, status) }`.

- [ ] **Step 5: Cancelled hidden everywhere** — in `query.ts`, make `reviewSplit.done` done-only (`state === 'done'`, exclude `cancelled`); verify `funnel`/`filterTasks` don't surface `cancelled` (`live` already excludes it). Add/adjust a query unit test.

- [ ] **Step 6: Build, restart serve, tests, manual check, commit**

Run: `corepack pnpm build` && `corepack pnpm exec vitest run` (PASS). Manually `curl -X POST localhost:7777/api/task` against a `.testvault` line and confirm the markdown file changes.

```bash
git add -A
git commit -m "api: POST /api/task in-place write + 409 conflict; hide cancelled in review"
```

## Task B4: Focus view + shutdown calculator

Implements spec §B3, §B4.

**Files:**
- Modify: `packages/api/src/server.ts`, `packages/api/src/query.ts`, `packages/gui/src/lib/api.ts`, `packages/gui/src/App.tsx`
- Create: `packages/gui/src/lib/shutdown.test.ts`, `packages/gui/src/components/FocusView.tsx`, `packages/gui/src/components/ShutdownBar.tsx`

- [ ] **Step 1: `GET /api/focus`** — add `focus(result)` to `query.ts` returning `{ date, active, doneToday }` (active = live open+in_progress at grain `day` bucket `this`, in-progress first then by importance; doneToday = count of `[x]` in today's note), and route it in `server.ts`.

- [ ] **Step 2: Write the failing `shutdown.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { shutdown } from './api';

describe('shutdown', () => {
  it('earliest = now + Σ estimates; counts unestimated', () => {
    const now = new Date('2026-06-22T14:00:00');
    const r = shutdown([{ estMinutes: 30 } as any, { estMinutes: 45 } as any, { estMinutes: null } as any], now);
    expect(r.remainingMin).toBe(75);
    expect(r.unestimated).toBe(1);
    expect(r.earliest.getHours()).toBe(15);
    expect(r.earliest.getMinutes()).toBe(15);
  });
});
```

- [ ] **Step 3: Implement `shutdown()` + `fetchFocus()` + `postTask()` in `api.ts`**

```ts
export function shutdown(active: { estMinutes: number | null }[], now: Date) {
  const remainingMin = active.reduce((s, t) => s + (t.estMinutes ?? 0), 0);
  const unestimated = active.filter((t) => t.estMinutes == null).length;
  return { remainingMin, unestimated, earliest: new Date(now.getTime() + remainingMin * 60000) };
}
export const fetchFocus = () => getJson<{ date: string; active: ApiTask[]; doneToday: number }>('/api/focus');
export async function postTask(body: unknown): Promise<{ ok?: true; conflict?: string; task?: ApiTask }> {
  const res = await fetch('/api/task', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}
```

Run `corepack pnpm exec vitest run packages/gui/src/lib/shutdown.test.ts` — expect PASS.

- [ ] **Step 4: `ShutdownBar.tsx`** — renders "≈ {h}h {m}m left → earliest shutdown {clock}" + "+N unestimated", computed from the browser clock (`new Date()`).

- [ ] **Step 5: `FocusView.tsx`** — fetch `/api/focus`; render each active task as a card with complete/start-stop/archive/edit controls that call `postTask({ file, line, expectedText, patch })` (`{state:'done'}`, `{state:'in_progress'|'open'}`, `{state:'cancelled'}`); on `conflict` show "changed on disk — refresh" and re-fetch; a "done today" tally; `ShutdownBar` at top.

- [ ] **Step 6: Wire the Focus mode in `App.tsx`** — when `mode === 'focus'` render `<FocusView/>` instead of the board; the header Focus button (Task A1) already sets the mode.

- [ ] **Step 7: Build, restart serve, tests, manual check, commit**

Run: `corepack pnpm build` && `corepack pnpm exec vitest run` (PASS). Manually: Focus shows today's tasks; clicking complete writes `[x]` to the file and removes the card; shutdown time updates.

```bash
git add -A
git commit -m "api+gui: GET /api/focus, Focus view, live state writes, shutdown calculator"
```

## Task B5: Edit modal (from any card)

Implements spec §B5.

**Files:**
- Create: `packages/gui/src/components/EditModal.tsx`
- Modify: `packages/gui/src/components/TaskCard.tsx` (edit affordance), `FocusView.tsx`, `PlanBoard.tsx`, `ReviewView.tsx`

- [ ] **Step 1: `EditModal.tsx`** — dimmed backdrop, Esc-dismiss; fields text / estimate (`~Nh`/`~Nm`, blank clears) / importance (none/!/!!/!!!) / due (blank clears) / project (blank clears) / multi-line description, pre-filled from the task (description from `task` notes). **Save** posts only changed fields as a `patch` via `postTask`; **Cancel** discards; on `conflict` show it + reload.

- [ ] **Step 2: Add an edit affordance to `TaskCard`** — a small "✎" button (in `actions` or a dedicated `onEdit?` prop) that opens the modal. Reachable from Focus, PlanBoard cards, and Review rows (pass an `onEdit` handler from each parent that sets the modal's task).

- [ ] **Step 3: Build, restart serve, manual check, commit**

Run: `corepack pnpm build`. Manually: open the modal from a Focus card and a board card; change the estimate; Save; confirm the markdown line's `~Nm` token updates on disk and the UI refreshes; conflict path shows the message.

```bash
git add -A
git commit -m "gui: Edit modal with field patches via POST /api/task, reachable from every card"
```

## Task B6: Quick-add capture

Implements spec §B6.

**Files:**
- Modify: `packages/resolve/src/config.ts`, `packages/api/src/server.ts`, `packages/api/src/task.ts`, `packages/gui/src/lib/api.ts`, `packages/gui/src/components/PlanBoard.tsx`
- Create: `packages/write/src/append.ts`, `packages/write/test/append.test.ts`, `packages/gui/src/components/QuickAdd.tsx`

- [ ] **Step 1: Add `captureNote` to config** — in `packages/resolve/src/config.ts` add to `Config` a `captureNote` resolver (default = today's daily note path, derived the same way the daily periodic rule builds paths, e.g. `02 - Periodic/Daily/YYYY/MM/YYYY-MM-DD.md`). Add to `DEFAULT_CONFIG`.

- [ ] **Step 2: Write the failing `append.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendTask } from '../src/append';

describe('appendTask', () => {
  it('appends an open task to an existing note', () => {
    const root = mkdtempSync(join(tmpdir(), 'caius-append-'));
    writeFileSync(join(root, 'inbox.md'), '# Inbox\n');
    appendTask(root, { note: 'inbox.md', text: 'buy milk ~15m' });
    expect(readFileSync(join(root, 'inbox.md'), 'utf8')).toBe('# Inbox\n- [ ] buy milk ~15m\n');
  });

  it('creates the note if missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'caius-append-'));
    appendTask(root, { note: 'sub/new.md', text: 'first task' });
    expect(existsSync(join(root, 'sub/new.md'))).toBe(true);
    expect(readFileSync(join(root, 'sub/new.md'), 'utf8')).toContain('- [ ] first task');
  });
});
```

- [ ] **Step 3: Implement `append.ts`**

```ts
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

export function appendTask(root: string, req: { note: string; text: string }): { ok: true } {
  const abs = join(root, req.note);
  mkdirSync(dirname(abs), { recursive: true });
  const prev = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
  const sep = prev === '' || prev.endsWith('\n') ? '' : '\n';
  writeFileSync(abs, `${prev}${sep}- [ ] ${req.text.trim()}\n`);
  return { ok: true };
}
```

Export from `packages/write/src/index.ts`. Run the test — expect PASS. (Inline grammar tokens in `text` are preserved verbatim and parsed on the next scan; no extra work needed.)

- [ ] **Step 4: `POST /api/capture`** — in `task.ts`/`server.ts` add a handler: body `{ text, note? }`, default `note = config.captureNote`, call `appendTask`, return `200 {ok}`. Mirror the `/api/task` route wiring.

- [ ] **Step 5: `postCapture()` in `api.ts`**

```ts
export async function postCapture(text: string, note?: string): Promise<{ ok: true }> {
  const res = await fetch('/api/capture', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, note }) });
  return res.json();
}
```

- [ ] **Step 6: `QuickAdd.tsx`** — a pinned input (Enter submits → `postCapture(text)`, clears on success; supports inline tokens). Render it at the top of `PlanBoard`. (Optional keyboard shortcut: focus it on `c`.)

- [ ] **Step 7: Build, restart serve, tests, manual check, commit**

Run: `corepack pnpm build` && `corepack pnpm exec vitest run` (PASS). Manually: type "test capture ~20m" in QuickAdd, Enter; confirm today's daily note gains `- [ ] test capture ~20m` and the task appears after the watcher re-scan.

```bash
git add -A
git commit -m "api+gui+write: Quick-add capture (appendTask, POST /api/capture, QuickAdd, captureNote)"
```

---

## Self-Review (completed while writing)

- **Spec coverage:** §A1 nav → A1; §A2 source/groups/file chip → A2; §A3 buckets/emphasis/capacity/commit → A3; §A4 drag-drop/skip-ahead/deletions → A4; §A5 Review page+chips → A5; §B1 engine+write → B1,B2; §B2 API+cancelled → B3; §B3 Focus → B4; §B4 shutdown → B4; §B5 edit modal → B5; §B6 capture → B6. All covered.
- **Type consistency:** `PendingChange`/`StagingBuffer`/`commit`/`CommitResult` reused from `staging.ts` unchanged; `UiTask` shape per `api.ts`; `BUCKETS`/`BUCKET_LABEL` defined in A1 and consumed in A3/A4; `applyTaskUpdate`/`appendTask` signatures match between B2/B6 and their API callers; `postTask`/`postCapture`/`fetchFocus`/`shutdown` defined once in `api.ts`.
- **Known executor checkpoints (read before coding):** core's exact `parseLine` export name + `Token`/`ParsedTask` field names (B1); the `/api/commit` POST-body pattern (B3); the corpus walker in the existing core corpus test (B1 Step 7); the daily-note path derivation in `resolve` (B6 Step 1). These are existing code the executor reads — not placeholders.
- **Testing reality:** pure logic is TDD'd in vitest; drag-drop and live-write interactions are verified via the running app + Playwright MCP (no browser-test harness in the repo).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-22-caius-planning-redesign.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints for review.

Which approach?

