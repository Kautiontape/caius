# Caius Planning UX — Phase 2 (Keystone Layout + Capacity Meters) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the `[source | 3 stacked buckets]` planning board with the two-column **focus + context** layout: an anchored source column (the grain's previous tier), a single **aimable destination** column with tabs to peek any forward tier, an interactive funnel **spine**, and an **honest capacity meter** on the destination. Single-horizon staging (already the model) is preserved.

**Architecture:** New pure mapping/calc logic lives in `lib/*` with TDD (the codebase tests libs, not components). The board is recomposed from focused components: `SourceColumn`, `DestinationColumn` (tabs + capacity), `CapacityMeter`, and an enhanced spine (`PipelineStrip`). `App` gains an `aimedTier` state (the right column's current tier; defaults to the grain's destination, resets on grain change). The staging buffer and commit flow (Phase 1) are reused unchanged. Components are verified by `tsc --noEmit`, the full vitest suite (still passes — no component tests), and a production `vite build`.

**Tech Stack:** React 18 + Vite + Tailwind (`packages/gui`), `@dnd-kit/core`, Vitest. Test: `corepack pnpm exec vitest run <path>`. Type-check: `corepack pnpm --filter @caius/gui exec tsc --noEmit`. Build: `corepack pnpm --filter @caius/gui build`.

**Model recap (the new layout):**
- Grain (`altitude`: month|week|day) sets the LEFT source tier and the default RIGHT destination.
  - `sourceTierForGrain`: month→someday, week→month, day→week (= `PREV_GRAIN`).
  - `destTiersForGrain` (the right column's tabs): month→[month,week,day], week→[week,day], day→[day] (= `BUCKETS.slice(indexOf(grain))`). Default aimed = the grain itself.
- LEFT = anchored grouped source list of `sourceTier` (drop a card here to un-stage). RIGHT = the aimed tier's members + staged cards, with tabs to re-aim and a capacity meter. Promote = drag source→destination (stages a `promote` to the aimed tier). Single-horizon: a staged card leaves the source list and appears in the destination.
- Spine shows all tiers + counts, lights the active pair (source + aimed), shows overdue/now, and renders an ambient caption ("Pulling Someday → Planned"). (Spine forward-tier click re-aims; overdue stays display-only until Phase 4.)

**Out of scope (later phases):** search/sort/filters, multi-select, one-click promote, inline quick-estimate (Phase 3); overdue as a pullable source + reschedule, date-driven capture placement (Phase 4). Phase 2 stays drag-based (no usability regression).

---

## File Structure

- `packages/gui/src/lib/grains.ts` (modify) — add `sourceTierForGrain`, `destTiersForGrain`. (Task 1)
- `packages/gui/src/lib/grains.test.ts` (modify) — tests. (Task 1)
- `packages/gui/src/lib/capacity.ts` (new) — `tierBudgetMinutes`, `capacityMeter`. (Task 2)
- `packages/gui/src/lib/capacity.test.ts` (new) — tests. (Task 2)
- `packages/gui/src/components/CapacityMeter.tsx` (new) — honest hybrid bar. (Task 3)
- `packages/gui/src/components/SourceColumn.tsx` (new) — anchored grouped source list + droppable. (Task 4)
- `packages/gui/src/components/DestinationColumn.tsx` (new) — tabs + capacity meter + droppable member/staged list. (Task 5)
- `packages/gui/src/components/PipelineStrip.tsx` (modify) — interactive spine (aim, active pair, ambient caption). (Task 6)
- `packages/gui/src/components/PlanBoard.tsx` (rewrite body) — compose the two columns + DnD + reuse QuickAdd/commit/EditModal. (Task 7)
- `packages/gui/src/App.tsx` (modify) — `aimedTier` state + spine wiring. (Task 7)
- `packages/gui/src/components/HorizonBucket.tsx` (delete) — superseded by DestinationColumn. (Task 7)

---

## Task 1: Grain → source/destination mappings (pure lib)

**Files:** modify `packages/gui/src/lib/grains.ts`, `packages/gui/src/lib/grains.test.ts`.

- [ ] **Step 1: Write the failing test.** Append to `packages/gui/src/lib/grains.test.ts` (merge the new names into the existing `./grains` import):

```ts
import { sourceTierForGrain, destTiersForGrain } from './grains';

describe('sourceTierForGrain / destTiersForGrain', () => {
  it('maps each grain to the tier it pulls from', () => {
    expect(sourceTierForGrain('month')).toBe('someday');
    expect(sourceTierForGrain('week')).toBe('month');
    expect(sourceTierForGrain('day')).toBe('week');
  });

  it('lists the aimable destination tiers (grain onward)', () => {
    expect(destTiersForGrain('month')).toEqual(['month', 'week', 'day']);
    expect(destTiersForGrain('week')).toEqual(['week', 'day']);
    expect(destTiersForGrain('day')).toEqual(['day']);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `corepack pnpm exec vitest run packages/gui/src/lib/grains.test.ts` (FAIL — not exported).

- [ ] **Step 3: Implement.** In `packages/gui/src/lib/grains.ts`, add at the end:

```ts
/** The tier a given planning grain pulls FROM (the anchored left/source column). */
export function sourceTierForGrain(grain: Altitude): Grain {
  return PREV_GRAIN[grain]!; // month→someday, week→month, day→week
}

/** The destination tiers the right column may aim at for a grain: the grain's own
 * destination and everything downstream of it. month→[month,week,day], etc. */
export function destTiersForGrain(grain: Altitude): ('month' | 'week' | 'day')[] {
  return BUCKETS.slice(BUCKETS.indexOf(grain));
}
```

- [ ] **Step 4: Run to verify it passes.** `corepack pnpm exec vitest run packages/gui/src/lib/grains.test.ts` (all pass).

- [ ] **Step 5: Type-check.** `corepack pnpm --filter @caius/gui exec tsc --noEmit` (clean).

- [ ] **Step 6: Commit.**
```bash
git add packages/gui/src/lib/grains.ts packages/gui/src/lib/grains.test.ts
git commit -m "gui: Add grain→source/destination tier mappings"
```

---

## Task 2: Honest capacity meter calc (pure lib)

**Files:** create `packages/gui/src/lib/capacity.ts`, `packages/gui/src/lib/capacity.test.ts`.

- [ ] **Step 1: Write the failing test.** Create `packages/gui/src/lib/capacity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { tierBudgetMinutes, capacityMeter } from './capacity';

describe('tierBudgetMinutes', () => {
  it('scales the day capacity to week (×5) and month (×20)', () => {
    expect(tierBudgetMinutes('day', 480)).toBe(480);
    expect(tierBudgetMinutes('week', 480)).toBe(2400);
    expect(tierBudgetMinutes('month', 480)).toBe(9600);
  });
});

describe('capacityMeter', () => {
  it('is empty for no tasks', () => {
    expect(capacityMeter([], 480)).toEqual({
      knownMin: 0, noEstCount: 0, budgetMin: 480, solidPct: 0, hatchedPct: 0, over: false,
    });
  });

  it('splits known time (solid) from unestimated weight (hatched)', () => {
    const tasks = [{ estMinutes: 120 }, { estMinutes: 60 }, { estMinutes: null }, { estMinutes: null }];
    const m = capacityMeter(tasks, 480, 30); // nominal 30m per no-est task
    expect(m.knownMin).toBe(180);
    expect(m.noEstCount).toBe(2);
    expect(m.solidPct).toBeCloseTo(37.5);
    expect(m.hatchedPct).toBeCloseTo(12.5); // (2×30)/480
    expect(m.over).toBe(false);
  });

  it('caps solid at 100% and flags over-budget', () => {
    const m = capacityMeter([{ estMinutes: 600 }], 480);
    expect(m.solidPct).toBe(100);
    expect(m.hatchedPct).toBe(0);
    expect(m.over).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `corepack pnpm exec vitest run packages/gui/src/lib/capacity.test.ts` (FAIL — cannot resolve `./capacity`).

- [ ] **Step 3: Implement.** Create `packages/gui/src/lib/capacity.ts`:

```ts
import type { Altitude } from './grains';

/** Per-tier minute budget, scaled from the day capacity: week = 5 working days,
 * month = 20 working days. Configurable later. */
export function tierBudgetMinutes(grain: Altitude, dayCapacityMin: number): number {
  const factor = grain === 'day' ? 1 : grain === 'week' ? 5 : 20;
  return dayCapacityMin * factor;
}

export interface CapacityMeter {
  knownMin: number;     // Σ estimates
  noEstCount: number;   // tasks with no estimate
  budgetMin: number;
  solidPct: number;     // 0..100, estimated time toward budget
  hatchedPct: number;   // 0..(100-solidPct), "unknown" weight for no-est tasks
  over: boolean;        // knownMin > budgetMin
}

/** Honest hybrid meter: solid = known estimated time vs budget; hatched = a
 * nominal weight per unestimated task, so a tier full of no-est tasks still reads
 * as loaded. solid + hatched never exceed 100%. */
export function capacityMeter(
  tasks: { estMinutes: number | null }[],
  budgetMin: number,
  nominalMin = 30,
): CapacityMeter {
  const knownMin = tasks.reduce((s, t) => s + (t.estMinutes ?? 0), 0);
  const noEstCount = tasks.filter((t) => t.estMinutes == null).length;
  const budget = budgetMin > 0 ? budgetMin : 1;
  const solidPct = Math.min(100, (knownMin / budget) * 100);
  const hatchedPct = Math.min(100 - solidPct, ((noEstCount * nominalMin) / budget) * 100);
  return { knownMin, noEstCount, budgetMin, solidPct, hatchedPct, over: knownMin > budgetMin };
}
```

- [ ] **Step 4: Run to verify it passes.** `corepack pnpm exec vitest run packages/gui/src/lib/capacity.test.ts` (all pass).

- [ ] **Step 5: Commit.**
```bash
git add packages/gui/src/lib/capacity.ts packages/gui/src/lib/capacity.test.ts
git commit -m "gui: Add honest capacity-meter calc and per-tier budgets"
```

---

## Task 3: CapacityMeter component

**Files:** create `packages/gui/src/components/CapacityMeter.tsx`.

The honest hybrid bar + label, driven by a `CapacityMeter` value (Task 2). Display-only; not unit-tested (codebase convention).

- [ ] **Step 1: Implement.** Create `packages/gui/src/components/CapacityMeter.tsx`:

```tsx
import type { CapacityMeter as Meter } from '../lib/capacity';

const h = (min: number) => (min % 60 === 0 ? `${min / 60}h` : `${Math.floor(min / 60)}h${min % 60}m`);

/** Honest capacity bar: solid = estimated time, hatched = "unknown" weight for
 * unestimated tasks. The label leads with the no-est count — that's the signal. */
export function CapacityMeter({ meter }: { meter: Meter }) {
  return (
    <div data-testid="capacity-meter" className="flex items-center gap-2 text-[11px]">
      <span className={meter.over ? 'text-over' : 'text-good'}>
        {h(meter.knownMin)} known{meter.noEstCount > 0 && <span className="text-warn"> · {meter.noEstCount} no-est</span>} / {h(meter.budgetMin)}
      </span>
      <span className="relative h-1.5 w-24 overflow-hidden rounded-full bg-panel2">
        <span
          className={`absolute inset-y-0 left-0 ${meter.over ? 'bg-over' : 'bg-good'}`}
          style={{ width: `${meter.solidPct}%` }}
        />
        <span
          className="absolute inset-y-0"
          style={{
            left: `${meter.solidPct}%`,
            width: `${meter.hatchedPct}%`,
            backgroundImage:
              'repeating-linear-gradient(45deg, var(--warn,#d8a05a) 0 3px, transparent 3px 6px)',
            opacity: 0.7,
          }}
        />
      </span>
    </div>
  );
}
```

Notes: `bg-over`/`bg-good`/`bg-panel2`/`text-over`/`text-good`/`text-warn` are existing tokens. The hatch uses an inline `repeating-linear-gradient`; if `var(--warn)` is not defined in the theme, substitute a literal `#d8a05a` (check `packages/gui/src/index.css` for the CSS variable names and use whatever the warn color variable is, else the literal).

- [ ] **Step 2: Type-check.** `corepack pnpm --filter @caius/gui exec tsc --noEmit` (clean).

- [ ] **Step 3: Commit.**
```bash
git add packages/gui/src/components/CapacityMeter.tsx
git commit -m "gui: Add CapacityMeter honest-hybrid bar component"
```

---

## Task 4: SourceColumn component

**Files:** create `packages/gui/src/components/SourceColumn.tsx`.

Extract the LEFT pane: a labeled, droppable container that renders grouped source tasks (project/document groups, collapse/expand-all, archive-all), using the existing `SourceGroup` component and `groupSource`/grains label helpers. This is a refactor of the current `PlanBoard` source rendering into a reusable column parameterized by the source tier. Not unit-tested.

- [ ] **Step 1: Implement.** Create `packages/gui/src/components/SourceColumn.tsx`:

```tsx
import { type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { GRAIN_LABEL, type Grain } from '../lib/grains';
import { groupSource, type SourceGroup as Group } from '../lib/grouping';
import type { UiTask } from '../lib/api';
import { SourceGroup } from './SourceGroup';

interface Props {
  sourceTier: Grain;
  tasks: UiTask[];                         // already filtered to un-staged
  collapsed: Record<string, boolean>;
  anyExpanded: boolean;
  onToggle: (key: string) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onArchiveAll: (group: Group) => void;
  renderTask: (t: UiTask) => ReactNode;
}

/** The anchored left column: the grain's source tier as collapsible groups. It's a
 * droppable target — dropping a staged card here un-stages it back to the source. */
export function SourceColumn({
  sourceTier, tasks, collapsed, anyExpanded, onToggle, onCollapseAll, onExpandAll, onArchiveAll, renderTask,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'source' });
  const groups = groupSource(tasks);
  return (
    <div
      ref={setNodeRef}
      data-testid="source"
      className={`flex flex-col rounded-lg border bg-panel p-3 shadow-sm transition-all ${
        isOver ? 'border-accent ring-2 ring-accent/50' : 'border-line'
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-dim">Source · {GRAIN_LABEL[sourceTier]}</span>
        {groups.length > 0 && (
          <button data-testid="collapse-all" onClick={anyExpanded ? onCollapseAll : onExpandAll}
            className="text-xs text-dim hover:text-ink">{anyExpanded ? 'Collapse all' : 'Expand all'}</button>
        )}
      </div>
      {tasks.length === 0 && <div data-testid="source-empty" className="italic text-dim">{GRAIN_LABEL[sourceTier]} is empty.</div>}
      <div className="overflow-auto">
        {groups.map((group) => (
          <SourceGroup
            key={group.key}
            group={group}
            collapsed={collapsed[group.key] !== false}
            onToggle={onToggle}
            onArchiveAll={onArchiveAll}
            renderTask={renderTask}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check.** `corepack pnpm --filter @caius/gui exec tsc --noEmit` (clean — note this file is not yet imported; that's fine, tsc checks it).

- [ ] **Step 3: Commit.**
```bash
git add packages/gui/src/components/SourceColumn.tsx
git commit -m "gui: Add SourceColumn (grain-anchored grouped source + droppable)"
```

---

## Task 5: DestinationColumn component

**Files:** create `packages/gui/src/components/DestinationColumn.tsx`.

The RIGHT column: a header with **tabs** (one per `destTiersForGrain`) to re-aim, the **CapacityMeter** for the aimed tier, and a droppable list of the aimed tier's member + staged cards. Not unit-tested.

- [ ] **Step 1: Implement.** Create `packages/gui/src/components/DestinationColumn.tsx`:

```tsx
import { type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { BUCKET_LABEL } from '../lib/grains';
import type { CapacityMeter as Meter } from '../lib/capacity';
import { CapacityMeter } from './CapacityMeter';

type Tier = 'month' | 'week' | 'day';

interface Props {
  aimed: Tier;
  tabs: Tier[];
  isDefault: boolean;          // aimed === the grain's own destination
  onAim: (t: Tier) => void;
  meter: Meter;
  count: number;
  dragging: boolean;
  children: ReactNode;         // the cards
}

/** The aimable destination column. Tabs re-aim it; each tab is also a drop target
 * so a card can be sent to a tier without switching to it first. */
export function DestinationColumn({ aimed, tabs, isDefault, onAim, meter, count, dragging, children }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `bucket:${aimed}` });
  return (
    <div className="flex flex-col rounded-lg border border-line bg-panel p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex rounded-full bg-panel2 p-0.5 text-xs" data-testid="dest-tabs">
          {tabs.map((t) => (
            <TabDrop key={t} tier={t} active={t === aimed} onAim={onAim} />
          ))}
        </div>
        <span className="ml-auto text-[11px] uppercase tracking-wide text-dim">
          {isDefault ? 'destination' : 'peeking'} · {count}
        </span>
      </div>
      <CapacityMeter meter={meter} />
      <div
        ref={setNodeRef}
        data-testid={`bucket:${aimed}`}
        className={`mt-2 flex min-h-24 flex-1 flex-col gap-1.5 overflow-auto rounded border border-dashed p-2 transition-all ${
          isOver ? 'border-accent bg-accent/10' : dragging ? 'border-line' : 'border-transparent'
        }`}
      >
        {children}
        {dragging && <div className="rounded border border-dashed border-accent/60 p-2 text-center text-xs text-accent">drop to promote</div>}
      </div>
    </div>
  );
}

/** A tab that is also a drop target (drop a card on a tier without switching). */
function TabDrop({ tier, active, onAim }: { tier: Tier; active: boolean; onAim: (t: Tier) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `tab:${tier}` });
  return (
    <button
      ref={setNodeRef}
      data-testid={`dest-tab-${tier}`}
      onClick={() => onAim(tier)}
      className={`rounded-full px-3 py-1 ${active ? 'bg-accent text-bg' : 'text-dim hover:text-ink'} ${isOver ? 'ring-2 ring-accent/50' : ''}`}
    >
      {BUCKET_LABEL[tier]}
    </button>
  );
}
```

- [ ] **Step 2: Type-check.** `corepack pnpm --filter @caius/gui exec tsc --noEmit` (clean).

- [ ] **Step 3: Commit.**
```bash
git add packages/gui/src/components/DestinationColumn.tsx
git commit -m "gui: Add DestinationColumn (aim tabs + capacity meter + drop target)"
```

---

## Task 6: Interactive spine (enhance PipelineStrip)

**Files:** modify `packages/gui/src/components/PipelineStrip.tsx`.

Make the funnel strip light the **active pair** (source + aimed), let forward-tier nodes **re-aim** the destination on click, and render an **ambient caption** narrating the active move. Keep the overdue/now counters (overdue stays display-only this phase). Not unit-tested. The current `App` passes `from`/`to`/`auditGrain` — those props will be replaced by `sourceTier`/`aimed`/`onAim` in Task 7; update this component's interface accordingly.

- [ ] **Step 1: Implement.** Replace `packages/gui/src/components/PipelineStrip.tsx` with:

```tsx
import { PIPELINE, GRAIN_LABEL, BUCKET_LABEL, type Grain } from '../lib/grains';

interface Props {
  byGrain: Record<string, number>;
  sourceTier: Grain;
  aimed: 'month' | 'week' | 'day';
  onAim: (t: 'month' | 'week' | 'day') => void;
  overdueCount: number;
  nowCount: number;
}

const isAimable = (g: Grain): g is 'month' | 'week' | 'day' => g === 'month' || g === 'week' || g === 'day';

export function PipelineStrip({ byGrain, sourceTier, aimed, onAim, overdueCount, nowCount }: Props) {
  const lit = (g: Grain) => g === sourceTier || g === aimed;
  return (
    <div className="border-b border-line px-5 py-2 text-xs" data-testid="pipeline-strip">
      <div className="flex items-center gap-2">
        {PIPELINE.map((g, i) => {
          const aimable = isAimable(g);
          return (
            <span key={g} className="flex items-center gap-2">
              {i > 0 && <span className="text-dim">→</span>}
              <button
                data-testid={`pipe-${g}`}
                disabled={!aimable}
                onClick={() => aimable && onAim(g)}
                className={`rounded px-2 py-1 ${lit(g) ? 'bg-panel2 text-ink' : 'text-dim'} ${aimable ? 'hover:text-ink' : 'cursor-default'}`}
              >
                {GRAIN_LABEL[g]} <b className="text-ink">{byGrain[g] ?? 0}</b>
              </button>
            </span>
          );
        })}
        <span className="ml-auto flex gap-3">
          <span className="text-good" data-testid="now-count">now {nowCount}</span>
          <span className="text-over" data-testid="overdue-count">overdue {overdueCount}</span>
        </span>
      </div>
      <div data-testid="ambient-caption" className="mt-1 text-[11px] text-dim">
        Pulling <span className="text-ink">{GRAIN_LABEL[sourceTier]}</span> → <span className="text-ink">{BUCKET_LABEL[aimed]}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check.** This will FAIL until Task 7 updates `App.tsx` (the caller still passes the old props). That's expected — note the error and proceed; Task 7 fixes the call site. Do not "fix" by reverting. (If you want a green checkpoint, you may do Task 6 and Task 7 as one commit; see Task 7 Step 6.)

- [ ] **Step 3: Commit** (allowed to be red-on-tsc only because Task 7 immediately follows and is the integration commit; if you prefer, defer this commit and fold it into Task 7's commit).
```bash
git add packages/gui/src/components/PipelineStrip.tsx
git commit -m "gui: Make the funnel spine interactive (aim + active pair + ambient caption)"
```

---

## Task 7: Rewrite PlanBoard + wire App (integration)

**Files:** rewrite body of `packages/gui/src/components/PlanBoard.tsx`; modify `packages/gui/src/App.tsx`; delete `packages/gui/src/components/HorizonBucket.tsx`.

This composes Tasks 3–6 into the working board and wires the `aimedTier` state. Keep the Phase-1 commit modal/toast, QuickAdd, EditModal, archive, and the existing staging/DnD semantics — just retarget them to the new two-column model.

### 7a. App.tsx changes

- [ ] **Step 1.** Add `aimedTier` state and source-tier derivation; reset aimed when grain changes; pass the new props to `PipelineStrip` and `PlanBoard`.

In `packages/gui/src/App.tsx`:
- Add imports: `import { sourceTierForGrain } from './lib/grains';` and the existing `useEffect`/`useState` are present.
- After `const [altitude, setAltitude] = useState<Altitude>('day');` add:
```tsx
  const [aimedTier, setAimedTier] = useState<'month' | 'week' | 'day'>('day');
```
- Replace the grain setter wiring so changing grain resets the aim to that grain's destination. Where `PlanHeader` gets `onGrain={setAltitude}`, change to:
```tsx
        onGrain={(a) => { setAltitude(a); setAimedTier(a); }}
```
- Compute `const sourceTier = sourceTierForGrain(altitude);`
- Replace the `<PipelineStrip .../>` usage with:
```tsx
      <PipelineStrip
        byGrain={funnel?.byGrain ?? {}}
        sourceTier={sourceTier}
        aimed={aimedTier}
        onAim={setAimedTier}
        overdueCount={overdue.length}
        nowCount={funnel?.now.length ?? 0}
      />
```
- In the `<PlanBoard .../>` usage, add props `sourceTier={sourceTier}`, `aimed={aimedTier}`, `onAim={setAimedTier}` (keep the existing `altitude`, `capacityMinutes`, `buffer`, `onStage`, `onUnstage`, `onCommit`, `conflicts`).
- The old `ritual.from`/`ritual.to`/`ritual.grain` references used only by the old PipelineStrip props can be dropped from that call (the `ritual` is still used elsewhere — leave the rest).

### 7b. PlanBoard.tsx rewrite

- [ ] **Step 2.** Rewrite `packages/gui/src/components/PlanBoard.tsx`. Keep all existing behavior (QuickAdd, collapse persistence, archive/archive-all, EditModal, commit modal + toast, DnD via `@dnd-kit`), restructured to the two-column model. Key changes from the current file:
  - Props add `sourceTier: Grain`, `aimed: 'month'|'week'|'day'`, `onAim: (t) => void`. Keep the rest.
  - Fetch: `source` = `fetchTasksAtGrain(sourceTier)` (was hardcoded `'someday'`); destination members = `fetchTasksAtGrain(aimed, 'this')`. Re-fetch when `sourceTier`/`aimed` change (add them to the `refresh`/`useEffect` deps). Keep fetching all three buckets' members is unnecessary now — only the aimed tier is shown; fetch just `aimed`.
  - Render: `<SourceColumn sourceTier={sourceTier} tasks={unstaged} .../>` on the left; `<DestinationColumn aimed={aimed} tabs={destTiersForGrain(grainForTabs)} .../>` on the right. The tabs come from the GRAIN, not the aimed tier — pass the grain via a prop or derive from `altitude` (PlanBoard already receives `altitude`). Use `destTiersForGrain(altitude)`.
  - Staging: dropping a card on `bucket:<aimed>` OR `tab:<tier>` stages a `promote` with `toGrain` = that tier (the tab's tier for `tab:` drops, the aimed tier for `bucket:` drops). Dropping on `source` un-stages. Aiming (`onAim`) just switches which tier the destination shows.
  - Capacity: `capacityMeter([...members, ...stagedTasksForAimed], tierBudgetMinutes(aimed, capacityMinutes))`.
  - Keep the commit button + `CommitSummaryModal` + toast exactly as in Phase 1.

Here is the full rewritten file:

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, useDraggable,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { type Altitude, type Grain, destTiersForGrain } from '../lib/grains';
import { fetchTasksAtGrain, postTask, type UiTask } from '../lib/api';
import { tierBudgetMinutes, capacityMeter } from '../lib/capacity';
import type { SourceGroup as Group } from '../lib/grouping';
import type { PendingChange, StagingBuffer, CommitResult } from '../lib/staging';
import { summarizeBuffer, type CommitSummary } from '../lib/commitSummary';
import { SourceColumn } from './SourceColumn';
import { DestinationColumn } from './DestinationColumn';
import { TaskCard } from './TaskCard';
import { EditModal } from './EditModal';
import { QuickAdd } from './QuickAdd';
import { CommitSummaryModal } from './CommitSummaryModal';

interface Props {
  altitude: Altitude;
  sourceTier: Grain;
  aimed: 'month' | 'week' | 'day';
  onAim: (t: 'month' | 'week' | 'day') => void;
  capacityMinutes: number;
  buffer: StagingBuffer;
  onStage: (c: PendingChange) => void;
  onUnstage: (taskId: string) => void;
  onCommit: () => Promise<CommitResult>;
  conflicts: CommitResult['conflicts'];
}

function DraggableCard({ task, showFile, staged, onEdit, onArchive }: { task: UiTask; showFile?: boolean; staged?: boolean; onEdit?: () => void; onArchive?: () => void }) {
  const { setNodeRef, listeners, attributes, transform, isDragging } = useDraggable({ id: task.id });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : undefined };
  const handle = (
    <button {...listeners} {...attributes} aria-label="drag" className="cursor-grab touch-none select-none text-dim hover:text-ink">⠿</button>
  );
  return <div ref={setNodeRef} style={style}><TaskCard task={task} showFile={showFile} staged={staged} dragHandle={handle} onEdit={onEdit} onArchive={onArchive} /></div>;
}

const COLLAPSED_KEY = 'caius-collapsed';
const loadCollapsed = (): Record<string, boolean> => { try { const r = localStorage.getItem(COLLAPSED_KEY); if (r) return JSON.parse(r) as Record<string, boolean>; } catch { /* ignore */ } return {}; };
const saveCollapsed = (m: Record<string, boolean>) => { try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(m)); } catch { /* ignore */ } };

export function PlanBoard({ altitude, sourceTier, aimed, onAim, capacityMinutes, buffer, onStage, onUnstage, onCommit, conflicts }: Props) {
  const [source, setSource] = useState<UiTask[]>([]);
  const [members, setMembers] = useState<UiTask[]>([]);
  const [dragging, setDragging] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);
  const [editing, setEditing] = useState<UiTask | null>(null);
  const [confirmSummary, setConfirmSummary] = useState<CommitSummary | null>(null);
  const [committing, setCommitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const refresh = () => {
    void fetchTasksAtGrain(sourceTier).then(setSource);
    void fetchTasksAtGrain(aimed, 'this').then(setMembers);
  };
  useEffect(refresh, [sourceTier, aimed]);

  const archive = (t: UiTask) => postTask({ file: t.file, line: t.line, expectedText: t.text, patch: { state: 'cancelled' } });
  const archiveOne = async (t: UiTask) => { await archive(t); refresh(); };
  const archiveAll = async (group: Group) => {
    if (!window.confirm(`Archive all ${group.tasks.length} task(s) in "${group.title}" as won't-do?`)) return;
    for (const t of group.tasks) await archive(t);
    refresh();
  };

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));
  const toggleGroup = (key: string) => setCollapsed((prev) => { const next = { ...prev, [key]: !(prev[key] !== false) }; saveCollapsed(next); return next; });

  const byId = new Map<string, UiTask>();
  for (const t of source) byId.set(t.id, t);
  for (const t of members) byId.set(t.id, t);
  for (const c of Object.values(buffer)) if (!byId.has(c.taskId)) byId.set(c.taskId, { ...(byId.get(c.taskId) as UiTask), id: c.taskId, file: c.snapshot.file, line: c.snapshot.line, text: c.snapshot.text } as UiTask);

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(false);
    const taskId = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    if (!over) return;
    if (over === 'source') { onUnstage(taskId); return; }
    let tier: 'month' | 'week' | 'day' | null = null;
    if (over.startsWith('bucket:')) tier = over.replace('bucket:', '') as 'month' | 'week' | 'day';
    else if (over.startsWith('tab:')) tier = over.replace('tab:', '') as 'month' | 'week' | 'day';
    if (!tier) return;
    const task = byId.get(taskId);
    const snapshot = task ? { file: task.file, line: task.line, text: task.text } : buffer[taskId]?.snapshot;
    if (!snapshot) return;
    onStage({ taskId, fromGrain: task?.grain ?? sourceTier, toGrain: tier, toBucket: 'this', slot: tier === 'day' ? 'today' : undefined, kind: 'promote', snapshot });
  };

  const stagedForAimed = Object.values(buffer).filter((c) => c.toGrain === aimed);
  const unstaged = source.filter((t) => !buffer[t.id]);
  const stagedTasks = stagedForAimed.map((c) => byId.get(c.taskId)).filter((t): t is UiTask => !!t);
  const meter = capacityMeter([...members, ...stagedTasks], tierBudgetMinutes(aimed, capacityMinutes));

  const groupsKeys = (ts: UiTask[]) => ts; // grouping happens inside SourceColumn
  const anyExpanded = Object.values(collapsed).some((v) => v === false);
  const setAll = (val: boolean) => { const next: Record<string, boolean> = {}; for (const t of unstaged) next[t.project ? `project:${t.project}` : `doc:${t.file}`] = val; saveCollapsed(next); setCollapsed(next); };

  return (
    <>
      <div className="px-5 pt-5"><QuickAdd onCaptured={refresh} /></div>
      <DndContext sensors={sensors} onDragStart={() => setDragging(true)} onDragEnd={onDragEnd}>
        <section data-testid="plan-board" className="grid grid-cols-[1.4fr_1fr] gap-5 px-5 pb-5 pt-3">
          <SourceColumn
            sourceTier={sourceTier}
            tasks={unstaged}
            collapsed={collapsed}
            anyExpanded={anyExpanded}
            onToggle={toggleGroup}
            onCollapseAll={() => setAll(true)}
            onExpandAll={() => setAll(false)}
            onArchiveAll={archiveAll}
            renderTask={(t) => <DraggableCard key={t.id} task={t} showFile onEdit={() => setEditing(t)} onArchive={() => void archiveOne(t)} />}
          />
          <div className="flex flex-col gap-3">
            <DestinationColumn
              aimed={aimed}
              tabs={destTiersForGrain(altitude)}
              isDefault={aimed === altitude}
              onAim={onAim}
              meter={meter}
              count={members.length + stagedTasks.length}
              dragging={dragging}
            >
              {[...members.map((t) => <DraggableCard key={`m-${t.id}`} task={t} showFile onEdit={() => setEditing(t)} onArchive={() => void archiveOne(t)} />),
                ...stagedTasks.map((t) => <DraggableCard key={`s-${t.id}`} task={t} staged showFile onEdit={() => setEditing(t)} />)]
                .length ? [...members.map((t) => <DraggableCard key={`m-${t.id}`} task={t} showFile onEdit={() => setEditing(t)} onArchive={() => void archiveOne(t)} />),
                  ...stagedTasks.map((t) => <DraggableCard key={`s-${t.id}`} task={t} staged showFile onEdit={() => setEditing(t)} />)]
                : <div className="text-xs italic text-dim">empty</div>}
            </DestinationColumn>
            {conflicts.length > 0 && (
              <div className="rounded border border-over/40 p-2 text-xs text-over" data-testid="board-conflicts">{conflicts.length} conflict(s) kept staged.</div>
            )}
            <button data-testid="commit-button" disabled={Object.keys(buffer).length === 0 || committing}
              onClick={() => setConfirmSummary(summarizeBuffer(buffer))}
              className="rounded-lg bg-accent px-3 py-2 text-bg disabled:opacity-40">commit plan</button>
          </div>
          {editing && <EditModal task={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
          {confirmSummary && (
            <CommitSummaryModal
              summary={confirmSummary}
              onCancel={() => setConfirmSummary(null)}
              onConfirm={async () => {
                setConfirmSummary(null); setCommitting(true);
                try {
                  const res = await onCommit();
                  setToast({ msg: `✓ Committed ${res.applied.length} change${res.applied.length === 1 ? '' : 's'}` + (res.conflicts.length ? ` · ${res.conflicts.length} conflict(s) kept` : ''), ok: true });
                } catch { setToast({ msg: '⚠ Commit failed — check the server and try again.', ok: false }); }
                finally { setCommitting(false); setTimeout(() => setToast(null), 3000); }
              }}
            />
          )}
          {toast && (
            <div data-testid="commit-toast" className={`fixed bottom-5 left-1/2 -translate-x-1/2 rounded-lg border bg-panel px-4 py-2 text-sm shadow-lg ${toast.ok ? 'border-good/40 text-good' : 'border-over/40 text-over'}`}>{toast.msg}</div>
          )}
        </section>
      </DndContext>
    </>
  );
}
```

Notes for the implementer:
- Remove the unused `groupsKeys` helper if your editor flags it — it's a leftover; delete it. (Grouping happens in `SourceColumn`.) Also de-duplicate the destination children expression if you prefer: compute `const cards = [...]` once and render `{cards.length ? cards : <empty/>}` — cleaner than the inline duplication above. Do that.
- The `byId` reconstruction for staged-only cards guards the case where a staged card's tier was switched; keep it simple — if a staged task isn't in `source`/`members`, fall back to its `buffer` snapshot for `file/line/text` (the spread shown). If TS complains about the partial spread, build the `UiTask` explicitly from the snapshot with sensible defaults (grain `sourceTier`, nulls for est/project/due, `importance: 0`, etc.).

### 7c. Delete HorizonBucket and verify

- [ ] **Step 3.** Delete the superseded component: `git rm packages/gui/src/components/HorizonBucket.tsx`. Grep to confirm no remaining imports: `grep -rn "HorizonBucket" packages/gui/src` → none.

- [ ] **Step 4.** Type-check: `corepack pnpm --filter @caius/gui exec tsc --noEmit` — resolve any type errors (clean the destination-children duplication and the `byId` partial-spread per the notes above).

- [ ] **Step 5.** Full suite + build: `corepack pnpm exec vitest run` (all pass — no component tests), then `corepack pnpm --filter @caius/gui build` (tsc + vite build clean).

- [ ] **Step 6.** Commit (fold Task 6's spine change in if it wasn't committed separately):
```bash
git add packages/gui/src/App.tsx packages/gui/src/components/PlanBoard.tsx
git rm packages/gui/src/components/HorizonBucket.tsx
git commit -m "gui: Two-column focus+context board (anchored source + aimable destination)"
```

- [ ] **Step 7 (manual smoke, optional, needs server).** `corepack pnpm build && corepack pnpm caius serve .testvault --port 7777`. Check: grain=Month shows Someday on the left and a Planned destination with tabs (Planned/Orbit/Today) + capacity meter; switching grain re-points the source and resets the aim; dragging a source card onto the destination (or a tab) stages it (card leaves source, appears in destination, counts move); spine lights the active pair and the ambient caption reads "Pulling Someday → Planned"; commit still shows the summary + toast.

---

## Self-review checklist (run after writing the plan)
- **Spec coverage:** P2 source-follows-grain (Tasks 1,4,7), P12 full-width destination (Task 5), P11 single-horizon move visible (Task 7 staging), P13 spine + ambient caption (Task 6), P5 capacity meter on every tier (Tasks 2,3,5,7). ✓
- **Type consistency:** `sourceTierForGrain`/`destTiersForGrain` (Task 1) used in App + PlanBoard; `capacityMeter`/`tierBudgetMinutes` (Task 2) used in PlanBoard via CapacityMeter; PlanBoard `onCommit: () => Promise<CommitResult>` matches App. ✓
- **No placeholders:** libs have exact code + tests; components have full code; the one judgment call (destination children de-dup + byId fallback) is called out explicitly. ✓
