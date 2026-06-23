# Caius Planning UX — Phase 3 (Triage Power Tools) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the source column scale to a 700-item backlog (P1) and push estimation upstream (P4): text search, sort, filters, multi-select with bulk actions, one-click promote, and inline quick-estimate on every card.

**Architecture:** Filter/sort is pure, TDD'd logic in `lib/sourceFilter.ts`. The source column keeps its project/document grouping; filters narrow the set, sort orders tasks within each group. New presentational components: `SourceToolbar` (search/sort/filter/select-mode) and `SelectionBar` (bulk actions). `TaskCard` gains optional, backward-compatible affordances (inline quick-estimate chips, one-click promote, selection checkbox). `PlanBoard` owns the new state (filters, sortKey, selection set) and the bulk-action handlers, reusing the existing `onStage` (promote) and `postTask` (estimate/archive) paths. Verified by `tsc`, full vitest, and `vite build`.

**Tech Stack:** React 18 + Vite + Tailwind + @dnd-kit, Vitest. Same commands as prior phases.

**Decisions locked in brainstorming:** default sort = Priority (importance desc); filters = Project, Has/no-estimate, Importance, Due/overdue; bulk actions = Promote / Quick-estimate / Archive (reschedule is per-task, Phase 4); quick-estimate chips = 15m/30m/45m/1h/2h + custom. Grouping is kept; sort orders within groups; "age" sort is omitted (no created-date field in the model — note it as a future need).

---

## File Structure
- `packages/gui/src/lib/sourceFilter.ts` (new) — `filterTasks`, `sortTasks`, types, `EMPTY_FILTERS`. (Task 1)
- `packages/gui/src/lib/sourceFilter.test.ts` (new) — tests. (Task 1)
- `packages/gui/src/components/SourceToolbar.tsx` (new) — search + sort + filter + select toggle. (Task 2)
- `packages/gui/src/components/SelectionBar.tsx` (new) — floating bulk-action bar. (Task 2)
- `packages/gui/src/components/TaskCard.tsx` (modify) — quick-estimate chips, one-click promote, selection checkbox (all optional). (Task 3)
- `packages/gui/src/components/SourceColumn.tsx` (modify) — accept pre-filtered/grouped/sorted groups + selection wiring + toolbar slot. (Task 4)
- `packages/gui/src/components/PlanBoard.tsx` (modify) — own filter/sort/selection state + bulk handlers + one-click promote + quick-estimate writes. (Task 4)

---

## Task 1: Filter + sort lib (pure, TDD)

**Files:** create `packages/gui/src/lib/sourceFilter.ts`, `packages/gui/src/lib/sourceFilter.test.ts`.

Exact implementation:

```ts
// sourceFilter.ts
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

/** Pure sort (stable-ish via title tiebreak). Returns a new array. */
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
```

Tests (`sourceFilter.test.ts`) must cover: query matches text/project/file (case-insensitive); project filter; estimate has/none; minImportance threshold; due dated vs overdue (using a fixed `today`); priority sort (importance desc, title tiebreak); due sort (nulls last); estimate sort (nulls last). Build `UiTask` fixtures inline like the existing `edit.test.ts` does.

**Steps:** write failing test → run (fail) → implement → run (pass) → tsc → commit `gui: Add source filter/sort lib`.

---

## Task 2: SourceToolbar + SelectionBar components

**Files:** create `SourceToolbar.tsx`, `SelectionBar.tsx`. Presentational; verified by tsc.

**`SourceToolbar`** — props: `filters: SourceFilters`, `onFilters: (f) => void`, `sort: SortKey`, `onSort: (k) => void`, `projects: string[]` (for the project dropdown), `selectMode: boolean`, `onToggleSelectMode: () => void`. Renders a search `<input>` (updates `filters.query`), a sort `<select>` (the 5 SortKeys with friendly labels), a project `<select>` (All + each project), small toggle chips for estimate (all/has/none), importance (none/!/!!/!!!), due (all/dated/overdue), and a "☑ select" toggle button. Use existing Tailwind tokens; keep it a single wrapping flex row (`flex flex-wrap items-center gap-2`). Give the search `data-testid="source-search"`, the sort `data-testid="source-sort"`, the select toggle `data-testid="select-mode"`.

**`SelectionBar`** — props: `count: number`, `onPromote: () => void`, `onEstimate: (min: number) => void`, `onArchive: () => void`, `onClear: () => void`. A bar (only rendered when `count > 0`) showing `{count} selected`, a "→ Promote" button, a small quick-estimate chip group (15/30/45/1h/2h calling `onEstimate(min)`), an "Archive" button, and a "Clear" button. `data-testid="selection-bar"`.

**Steps:** create both files → tsc clean → commit `gui: Add SourceToolbar and SelectionBar components`. (Full code provided to the implementer at dispatch.)

---

## Task 3: TaskCard affordances (quick-estimate, one-click promote, selection)

**Files:** modify `packages/gui/src/components/TaskCard.tsx`. All new props OPTIONAL (existing call sites unaffected).

Add props: `onPromote?: () => void` (one-click promote, shown on hover next to ✎/🗑), `onQuickEstimate?: (min: number) => void` (turns the estimate label into a clickable `+ est ▾` that reveals chips 15/30/45/60/120), `selectable?: boolean`, `selected?: boolean`, `onToggleSelect?: () => void` (a checkbox at the left when `selectable`). Keep a local `useState` for the quick-estimate popover open/closed. The promote button uses `→` glyph with `title="Promote"`. Quick-estimate chip click calls `onQuickEstimate(min)` then closes the popover.

**Steps:** implement → tsc clean → full suite (existing card usages still compile/behave) → commit `gui: Add quick-estimate, one-click promote, and selection to TaskCard`.

---

## Task 4: Wire triage into SourceColumn + PlanBoard (integration)

**Files:** modify `SourceColumn.tsx`, `PlanBoard.tsx`.

- `SourceColumn`: accept `groups: SourceGroup[]` (pre-filtered/grouped/sorted by PlanBoard) instead of computing from `tasks`; add a `toolbar?: ReactNode` slot rendered above the groups; thread `selectable`/`selectedIds`/`onToggleSelect` and `onPromote`/`onQuickEstimate` down to the rendered cards (via the `renderTask` callback PlanBoard supplies — simplest: PlanBoard keeps owning `renderTask` and passes selection/promote/estimate per card, so `SourceColumn` only needs the `groups` + `toolbar` + the existing collapse props). Keep it presentational.
- `PlanBoard`: 
  - State: `filters: SourceFilters` (init `EMPTY_FILTERS`), `sort: SortKey` (init `'priority'`), `selectMode: boolean`, `selected: Set<string>` (task ids).
  - Derive: `const today = new Date().toISOString().slice(0,10)` (PlanBoard may read the date once at render — acceptable; or accept it as a prop. Use `new Date()` here, not in a lib). `const filtered = filterTasks(unstaged, filters, today)`. Group with `groupSource(filtered)`, then sort each group's `tasks` with `sortTasks(group.tasks, sort)`. Build `projects` = unique sorted project names from `unstaged`.
  - Render `<SourceToolbar .../>` into the SourceColumn `toolbar` slot; render `<SelectionBar .../>` (floating) when `selectMode && selected.size > 0`.
  - `renderTask` for source cards passes: `selectable={selectMode}`, `selected={selected.has(t.id)}`, `onToggleSelect={() => toggle(t.id)}`, `onPromote={() => promoteOne(t)}`, `onQuickEstimate={(m) => estimateOne(t, m)}`.
  - Handlers:
    - `promoteOne(t)` → `onStage({ taskId: t.id, fromGrain: t.grain ?? sourceTier, toGrain: aimed, toBucket: 'this', slot: aimed === 'day' ? 'today' : undefined, kind: 'promote', snapshot: { file: t.file, line: t.line, text: t.text } })`.
    - `estimateOne(t, min)` → `await postTask({ file: t.file, line: t.line, expectedText: t.text, patch: { estMinutes: min } }); refresh();`
    - Bulk (over `selected`): `bulkPromote` = promoteOne for each selected task found in `filtered`; `bulkEstimate(min)` = estimateOne sequentially; `bulkArchive` = archive sequentially. After bulk, clear `selected`. (Sequential writes for the same reason archiveAll is sequential.)
  - Verify: tsc clean, full suite green, `vite build` clean.

**Steps:** implement → tsc → vitest → build → commit `gui: Wire search/sort/filter, multi-select bulk actions, one-click promote, quick-estimate`.
Optional manual smoke: search narrows the source; sort reorders within groups; selecting N shows the bar; bulk promote stages all N; quick-estimate chip writes and the capacity meter updates.

---

## Self-review checklist
- **Spec coverage:** P1 search/sort/filter (Tasks 1,2,4), multi-select + bulk (Tasks 2,4), one-click promote (Tasks 3,4); P4 inline quick-estimate (Tasks 3,4). ✓
- **Type consistency:** `SourceFilters`/`SortKey`/`EMPTY_FILTERS` from Task 1 used in Toolbar + PlanBoard; `onQuickEstimate(min:number)` consistent across TaskCard/SelectionBar/PlanBoard; promote reuses `onStage`/`PendingChange`. ✓
- **No created-date for "age" sort** — omitted deliberately; note in commit/PR if asked.
