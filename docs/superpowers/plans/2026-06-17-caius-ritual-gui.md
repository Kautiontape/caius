# Caius Ritual Planning GUI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Caius's read-only dashboard with a six-ritual planning surface (React + Vite + Tailwind) backed by a staging buffer and a Phase-1 commit that logs an intended diff without writing to disk.

**Architecture:** The engine (`core`/`resolve`/`index`/`watch`) stays authoritative; it gains a non-breaking, structured `{ grain, bucket }` classification so the GUI can speak grains without re-deriving periods. A new `packages/gui` Vite app talks to the existing `packages/api` over HTTP/JSON. Every ritual action mutates an in-memory staging buffer; `POST /api/commit` re-scans the vault, reconciles staged intents by `(file,line)` surrogate + snapshot, and returns `{ applied, conflicts }` — Phase 1 logs, Phase 2 writes.

**Tech Stack:** TypeScript, pnpm workspaces, vitest (engine/API units), Vite + React 18 + Tailwind v3 (GUI), Playwright MCP (GUI flow verification), `node:sqlite`/`node:http` (existing).

**Spec:** `docs/superpowers/specs/2026-06-17-caius-ritual-gui-design.md`

---

## File Structure

**Engine (modify):**
- `packages/resolve/src/types.ts` — add `GRAINS`/`Grain`, `BUCKETS`/`Bucket`.
- `packages/resolve/src/period.ts` — add `periodBucket()` (4-way refinement).
- `packages/resolve/src/horizon.ts` — `resolveHorizon` returns `HorizonResult` (adds `grain`/`bucket`).
- `packages/resolve/src/index.ts` — export `HorizonResult`.
- `packages/index/src/scan.ts` — `IndexedTask` gains `grain`/`bucket`; populate + grain derivation.

**API (modify + add):**
- `packages/api/src/query.ts` — `grain` filter; `byGrain` in funnel; `reviewSplit()`; remove `dayPlan`.
- `packages/api/src/commit.ts` — **new**: `reconcileCommit()` + wire types.
- `packages/api/src/server.ts` — serve `gui/dist`; `capacityMinutes` on summary; `grain` param; `GET /api/review/:grain`; `POST /api/commit`; drop `/api/day-plan` + `gui.ts`.
- `packages/api/src/index.ts` — update exports.
- `packages/api/src/gui.ts` — **delete**.
- `packages/api/test/query.test.ts` — drop `dayPlan` block; add `grain`/`byGrain`/`reviewSplit`; update `mk()`.
- `packages/api/test/server.integration.test.ts` — update `/` + summary assertions; add review/commit.
- `packages/api/test/commit.test.ts` — **new**.

**Root (modify):**
- `package.json` — `build` also builds the gui; add `dev:gui`.

**GUI (new) — `packages/gui/`:**
- `package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/index.css`
- `src/lib/grains.ts` (+ `grains.test.ts`) — mapping source of truth.
- `src/lib/api.ts` — typed fetch + `ApiTask`→`UiTask`.
- `src/lib/staging.ts` (+ `staging.test.ts`) — buffer reducer + `commit()`.
- `src/App.tsx` — ritual state, buffer, data fetch.
- `src/components/{RitualHeader,PipelineStrip,TaskCard,SkipMenu,PendingTray,PlanView,DayPlanView,ReviewView,RitualSummary}.tsx`

---

## Milestone 1 — Foundations (engine grain/bucket + GUI scaffold + header/strip)

### Task 1: Engine grain/bucket types

**Files:**
- Modify: `packages/resolve/src/types.ts`

- [ ] **Step 1: Add the grain/bucket types**

Append to `packages/resolve/src/types.ts`:

```ts
/** Presentation grains (the GUI's vocabulary). Must match the GUI's lib/grains.ts. */
export const GRAINS = ['someday', 'month', 'week', 'day'] as const;
export type Grain = (typeof GRAINS)[number];

/** Period bucket relative to *now* at a grain's granularity. */
export const BUCKETS = ['past', 'this', 'next', 'future'] as const;
export type Bucket = (typeof BUCKETS)[number];
```

- [ ] **Step 2: Verify it compiles**

Run: `corepack pnpm exec tsc -b`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add packages/resolve/src/types.ts
git commit -m "resolve: Add Grain/Bucket types for the ritual GUI"
```

---

### Task 2: `periodBucket()` — 4-way period refinement

**Files:**
- Modify: `packages/resolve/src/period.ts`
- Test: `packages/resolve/test/period.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/resolve/test/period.test.ts`:

```ts
import { periodBucket } from '../src/period.js';

describe('periodBucket — day', () => {
  const now = new Date(2026, 5, 17); // 2026-06-17
  const b = (leaf: string) => periodBucket('day', leaf, now);
  it('current → this', () => expect(b('2026-06-17')).toBe('this'));
  it('next day → next', () => expect(b('2026-06-18')).toBe('next'));
  it('beyond next → future', () => expect(b('2026-06-20')).toBe('future'));
  it('earlier → past', () => expect(b('2026-06-10')).toBe('past'));
  it('unparseable → null', () => expect(b('scratch')).toBeNull());
  it('rolls over the year for next', () =>
    expect(periodBucket('day', '2027-01-01', new Date(2026, 11, 31))).toBe('next'));
});

describe('periodBucket — month', () => {
  const now = new Date(2026, 5, 17);
  const b = (leaf: string) => periodBucket('month', leaf, now);
  it('current → this', () => expect(b('2026-06')).toBe('this'));
  it('next → next', () => expect(b('2026-07')).toBe('next'));
  it('beyond → future', () => expect(b('2026-09')).toBe('future'));
  it('earlier → past', () => expect(b('2026-01')).toBe('past'));
  it('rolls over the year for next', () =>
    expect(periodBucket('month', '2027-01', new Date(2026, 11, 15))).toBe('next'));
});

describe('periodBucket — isoweek', () => {
  const now = new Date(2026, 5, 17); // ISO 2026-W25
  const b = (leaf: string) => periodBucket('isoweek', leaf, now);
  it('current → this', () => expect(b('2026-W25')).toBe('this'));
  it('next → next', () => expect(b('2026-W26')).toBe('next'));
  it('beyond → future', () => expect(b('2026-W30')).toBe('future'));
  it('earlier → past', () => expect(b('2026-W10')).toBe('past'));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `corepack pnpm exec vitest run packages/resolve/test/period.test.ts`
Expected: FAIL — `periodBucket is not a function` / import error.

- [ ] **Step 3: Implement `periodBucket` + `nextKey`**

In `packages/resolve/src/period.ts`, add the import of `Bucket` at the top:

```ts
import type { Bucket } from './types.js';
```

Then append at the end of the file:

```ts
/** Comparable key for the period immediately after `now` (handles year/week/month rollover). */
function nextKey(granularity: PeriodGranularity, now: Date): number {
  switch (granularity) {
    case 'day': {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return nowKey('day', d);
    }
    case 'isoweek': {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
      return nowKey('isoweek', d);
    }
    case 'month': {
      const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return nowKey('month', d);
    }
  }
}

/**
 * 4-way refinement of {@link classifyPeriod}: distinguishes the *next* bucket
 * (tomorrow / next ISO week / next month) from anything further out. Returns
 * null when the leaf carries no parseable date for this granularity.
 */
export function periodBucket(
  granularity: PeriodGranularity,
  leaf: string,
  now: Date,
): Bucket | null {
  const key = leafKey(granularity, leaf);
  if (key === null) return null;
  const ref = nowKey(granularity, now);
  if (key < ref) return 'past';
  if (key === ref) return 'this';
  return key === nextKey(granularity, now) ? 'next' : 'future';
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `corepack pnpm exec vitest run packages/resolve/test/period.test.ts`
Expected: PASS (all new cases).

- [ ] **Step 5: Commit**

```bash
git add packages/resolve/src/period.ts packages/resolve/test/period.test.ts
git commit -m "resolve: Add periodBucket 4-way period refinement (this/next/past/future)"
```

---

### Task 3: `resolveHorizon` emits `grain`/`bucket`

**Files:**
- Modify: `packages/resolve/src/horizon.ts`, `packages/resolve/src/index.ts`
- Test: `packages/resolve/test/horizon.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/resolve/test/horizon.test.ts`:

```ts
describe('resolveHorizon — grain + bucket', () => {
  it('Daily current → day/this (horizon still today)', () => {
    const d = h('02 - Periodic/Daily/2026/06/2026-06-17.md');
    expect([d.value, d.grain, d.bucket]).toEqual(['today', 'day', 'this']);
  });
  it('Daily next-day → day/next (horizon still week)', () => {
    const d = h('02 - Periodic/Daily/2026/06/2026-06-18.md');
    expect([d.value, d.grain, d.bucket]).toEqual(['week', 'day', 'next']);
  });
  it('Daily far-future → day/future', () => {
    expect(h('02 - Periodic/Daily/2026/06/2026-06-20.md').bucket).toBe('future');
  });
  it('Daily past → day/past', () => {
    const d = h('02 - Periodic/Daily/2026/06/2026-06-10.md');
    expect([d.value, d.grain, d.bucket]).toEqual(['overdue', 'day', 'past']);
  });
  it('Weekly current → week/this', () => {
    const d = h('02 - Periodic/Weekly/2026/2026-W25.md');
    expect([d.grain, d.bucket]).toEqual(['week', 'this']);
  });
  it('Monthly next → month/next (horizon planning_ahead)', () => {
    const d = h('02 - Periodic/Monthly/2026/2026-07.md');
    expect([d.value, d.grain, d.bucket]).toEqual(['planning_ahead', 'month', 'next']);
  });
  it('Project note → someday/null', () => {
    const d = h('10 - Project/Caius/notes.md');
    expect([d.grain, d.bucket]).toEqual(['someday', null]);
  });
  it('default (unparseable periodic) → someday/null', () => {
    const d = h('02 - Periodic/Daily/scratchpad.md');
    expect([d.grain, d.bucket]).toEqual(['someday', null]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `corepack pnpm exec vitest run packages/resolve/test/horizon.test.ts`
Expected: FAIL — `grain`/`bucket` are `undefined`.

- [ ] **Step 3: Implement the structured return**

Replace the whole body of `packages/resolve/src/horizon.ts` with:

```ts
// Horizon axis (§5, D8). Date-relative: periodic notes classify by the date in
// their filename vs *now*; static rules map a folder straight to a level.
// First matching rule wins. Also emits the structured { grain, bucket } the
// ritual GUI consumes (the `horizon` string alone is lossy — see spec §3).

import { matchGlob } from './glob.js';
import { type Config, isPeriodicRule } from './config.js';
import {
  classifyPeriod,
  granularityForFormat,
  periodBucket,
  type PeriodGranularity,
  type PeriodRelation,
} from './period.js';
import { type Derived, type Grain, type Bucket } from './types.js';

/** A horizon resolution + its structured grain/bucket (non-breaking superset of Derived). */
export interface HorizonResult extends Derived {
  grain: Grain | null;
  bucket: Bucket | null;
}

const RELATION_WORD: Record<PeriodRelation, string> = {
  current: 'current',
  future: 'future',
  past: 'past',
};

const GRAIN_FOR: Record<PeriodGranularity, Grain> = {
  day: 'day',
  isoweek: 'week',
  month: 'month',
};

/** Friendly rule label, e.g. "02 - Periodic/Daily/**" → "Daily". */
function periodicLabel(match: string): string {
  const m = match.match(/Periodic\/([^/]+)/);
  return m ? m[1]! : match;
}

function leafOf(file: string): string {
  const base = file.slice(file.lastIndexOf('/') + 1);
  return base.replace(/\.md$/i, '');
}

/** A static horizon string maps to a grain only when it is the someday master list. */
function staticGrain(horizon: string): Grain | null {
  return horizon === 'someday' ? 'someday' : null;
}

/** Resolve the horizon for a file at a given moment. Always returns a value. */
export function resolveHorizon(file: string, now: Date, config: Config): HorizonResult {
  for (const rule of config.horizon_mapping) {
    if (!matchGlob(rule.match, file)) continue;

    if (isPeriodicRule(rule)) {
      const granularity = granularityForFormat(rule.date);
      if (!granularity) continue;
      const leaf = leafOf(file);
      const relation = classifyPeriod(granularity, leaf, now);
      if (!relation) continue; // glob matched but no parseable period → fall through
      const label = periodicLabel(rule.match);
      const unit = granularity === 'isoweek' ? 'week' : granularity;
      return {
        value: rule.by_date[relation],
        rule: `${label} periodic rule (${RELATION_WORD[relation]} → ${rule.by_date[relation]})`,
        source: `${RELATION_WORD[relation]} ${unit} ${leaf} vs now`,
        grain: GRAIN_FOR[granularity],
        bucket: periodBucket(granularity, leaf, now),
      };
    }

    return {
      value: rule.horizon,
      rule: `static rule ${rule.match}`,
      source: `path matches ${rule.match}`,
      grain: staticGrain(rule.horizon),
      bucket: null,
    };
  }

  return {
    value: config.horizon_default,
    rule: 'default',
    source: 'no horizon rule matched',
    grain: staticGrain(config.horizon_default),
    bucket: null,
  };
}
```

- [ ] **Step 4: Export the new type**

In `packages/resolve/src/index.ts`, change the horizon export line to also export the type:

```ts
export { resolveHorizon } from './horizon.js';
export type { HorizonResult } from './horizon.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `corepack pnpm exec vitest run packages/resolve`
Expected: PASS (existing horizon `.value` tests still green; new grain/bucket tests green).

- [ ] **Step 6: Commit**

```bash
git add packages/resolve/src/horizon.ts packages/resolve/src/index.ts packages/resolve/test/horizon.test.ts
git commit -m "resolve: resolveHorizon emits structured grain/bucket (HorizonResult)"
```

---

### Task 4: `IndexedTask` carries `grain`/`bucket`

**Files:**
- Modify: `packages/index/src/scan.ts`
- Test: `packages/index/test/scan.grain.test.ts` (new — self-contained to avoid duplicate imports)

- [ ] **Step 1: Write the failing test**

Create `packages/index/test/scan.grain.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanVault } from '../src/scan.js';
import { DEFAULT_CONFIG } from '@caius/resolve';

describe('scanVault — grain/bucket on tasks', () => {
  it('tags a current daily task day/this and a project task someday/null', () => {
    const root = mkdtempSync(join(tmpdir(), 'caius-grain-'));
    try {
      const file = (rel: string, body: string) => {
        const abs = join(root, rel);
        mkdirSync(join(abs, '..'), { recursive: true });
        writeFileSync(abs, body);
      };
      file('02 - Periodic/Daily/2026/06/2026-06-17.md', '- [ ] today task\n');
      file('10 - Project/Caius/notes.md', '- [ ] someday task\n');
      const r = scanVault(root, DEFAULT_CONFIG, new Date(2026, 5, 17));
      const today = r.tasks.find((t) => t.text === 'today task')!;
      const someday = r.tasks.find((t) => t.text === 'someday task')!;
      expect([today.grain, today.bucket]).toEqual(['day', 'this']);
      expect([someday.grain, someday.bucket]).toEqual(['someday', null]);
      expect(today.derivations.some((d) => d.axis === 'grain')).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `corepack pnpm exec vitest run packages/index/test/scan.grain.test.ts`
Expected: FAIL — `grain`/`bucket` undefined (and TS: property does not exist).

- [ ] **Step 3: Add the fields to `IndexedTask`**

In `packages/index/src/scan.ts`, add the import and two fields. Change the import line near the top:

```ts
import { resolveHorizon, resolveProject, type Config, type ProjectContext, type Grain, type Bucket } from '@caius/resolve';
```

In the `IndexedTask` interface, add after `horizon: string | null;`:

```ts
  grain: Grain | null;
  bucket: Bucket | null;
```

- [ ] **Step 4: Populate them in the scan loop**

In the task-construction `tasks.push({ ... })` block, add after `horizon: null,`:

```ts
        grain: null,
        bucket: null,
```

In the resolve pass (`tasks.forEach((t, i) => { ... })`), replace the horizon-assignment region with:

```ts
    const horizon = resolveHorizon(t.file, now, config);
    const project = resolveProject(pt, t.file, config, ctx);
    t.horizon = horizon.value;
    t.grain = horizon.grain;
    t.bucket = horizon.bucket;
    t.project = project.value;
    t.derivations.push(
      { axis: 'horizon', value: horizon.value, rule: horizon.rule, source: horizon.source },
      { axis: 'grain', value: horizon.grain, rule: `grain ${horizon.grain ?? 'none'} · bucket ${horizon.bucket ?? 'n/a'}`, source: horizon.source },
      { axis: 'project', value: project.value, rule: project.rule, source: project.source },
    );
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `corepack pnpm exec vitest run packages/index/test/scan.grain.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/index/src/scan.ts packages/index/test/scan.grain.test.ts
git commit -m "index: IndexedTask carries grain/bucket + grain derivation"
```

---

### Task 5: API — `grain` filter, `byGrain` funnel, prune `dayPlan`

**Files:**
- Modify: `packages/api/src/query.ts`, `packages/api/src/index.ts`
- Test: `packages/api/test/query.test.ts`

- [ ] **Step 1: Update the test helper + add/adjust cases**

In `packages/api/test/query.test.ts`:

(a) In `mk()`, add the two new required fields after `horizon: 'someday',`:

```ts
    grain: 'someday',
    bucket: null,
```

(b) Add `reviewSplit` to the import (keep `dayPlan` — it is removed in Task 7 so every commit compiles):

```ts
import { funnel, filterTasks, dayPlan, reviewSplit, explain, flagsSummary } from '../src/query.js';
```

(c) Append new cases:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `corepack pnpm exec vitest run packages/api/test/query.test.ts`
Expected: FAIL — `reviewSplit` undefined, `byGrain` undefined, `grain` not on `TaskFilter`.

- [ ] **Step 3: Implement in `query.ts`**

In `packages/api/src/query.ts`:

(a) Extend `Funnel` and `funnel()`. Change the interface:

```ts
export interface Funnel {
  lanes: FunnelLane[];
  now: IndexedTask[];
  byGrain: Record<string, number>;
}
```

At the end of `funnel()`, before `return`, build `byGrain` and include it:

```ts
  const byGrain: Record<string, number> = {};
  for (const t of live) {
    if (!t.grain) continue;
    byGrain[t.grain] = (byGrain[t.grain] ?? 0) + 1;
  }
  return { lanes, now, byGrain };
```

(b) Add `grain` to `TaskFilter` and `filterTasks`:

```ts
export interface TaskFilter {
  horizon?: string;
  grain?: string;
  project?: string;
  live?: boolean;
  state?: State;
}
```

In `filterTasks`, add after the `horizon` check:

```ts
    if (f.grain !== undefined && t.grain !== f.grain) return false;
```

(c) Add `reviewSplit` after the existing `dayPlan` block (leave `dayPlan` in place — Task 7 prunes it):

```ts
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
```

- [ ] **Step 4: Update API exports (additive — `dayPlan`/`INDEX_HTML` stay until Task 7)**

In `packages/api/src/index.ts`, add `reviewSplit` to the value export and `ReviewSplit` to the type export:

```ts
export {
  funnel,
  filterTasks,
  dayPlan,
  reviewSplit,
  explain,
  flagsSummary,
} from './query.js';
export type { Funnel, FunnelLane, TaskFilter, DayPlan, DayPlanGroup, ReviewSplit, Explanation, FlagGroup } from './query.js';
export { serveCaius } from './server.js';
export type { ServeOptions, Server } from './server.js';
export { INDEX_HTML } from './gui.js';
```

- [ ] **Step 5: Run to verify it passes (tests + full compile)**

Run: `corepack pnpm exec vitest run packages/api/test/query.test.ts`
Expected: PASS.
Run: `corepack pnpm exec tsc -b`
Expected: PASS — the whole tree still compiles (`dayPlan` retained everywhere).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/query.ts packages/api/src/index.ts packages/api/test/query.test.ts
git commit -m "api: Add grain filter + funnel byGrain + reviewSplit"
```

---

### Task 6: GUI package scaffold (Vite + React + Tailwind)

**Files:**
- Create: `packages/gui/package.json`, `packages/gui/tsconfig.json`, `packages/gui/vite.config.ts`, `packages/gui/tailwind.config.js`, `packages/gui/postcss.config.js`, `packages/gui/index.html`, `packages/gui/src/main.tsx`, `packages/gui/src/index.css`, `packages/gui/src/App.tsx`
- Modify: root `package.json`

- [ ] **Step 1: Create `packages/gui/package.json`**

```json
{
  "name": "@caius/gui",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^5.4.11",
    "tailwindcss": "^3.4.17",
    "postcss": "^8.4.49",
    "autoprefixer": "^10.4.20",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create `packages/gui/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "types": []
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/gui/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxies /api → a running `caius serve` (default :7777).
// `vite build` emits packages/gui/dist, which the API server serves in prod.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:7777' } },
  build: { outDir: 'dist', emptyOutDir: true },
});
```

- [ ] **Step 4: Create Tailwind + PostCSS config**

`packages/gui/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#e6edf3', dim: '#8b97a7', bg: '#0e1116',
        panel: '#161b22', panel2: '#1c2330', line: '#2a3340',
        accent: '#5aa9ff', warn: '#ffb454', over: '#ff6b6b', good: '#3fb950',
      },
    },
  },
  plugins: [],
};
```

`packages/gui/postcss.config.js`:

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 5: Create `index.html` + entry + styles**

`packages/gui/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Caius</title>
  </head>
  <body>
    <div id="root" data-testid="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`packages/gui/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root { height: 100%; }
body { margin: 0; background: #0e1116; color: #e6edf3;
  font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
```

`packages/gui/src/main.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 6: Create a placeholder `App.tsx` (replaced in Task 10)**

`packages/gui/src/App.tsx`:

```tsx
export function App() {
  return <div data-testid="app-placeholder" className="p-6">Caius ritual surface — scaffold.</div>;
}
```

- [ ] **Step 7: Wire the root build**

In root `package.json`, change `build` and add `dev:gui`:

```json
    "build": "tsc -b && pnpm --filter @caius/gui build",
    "dev:gui": "pnpm --filter @caius/gui dev",
```

- [ ] **Step 8: Install deps and verify the build**

Run: `corepack pnpm install`
Then: `corepack pnpm --filter @caius/gui build`
Expected: PASS — `packages/gui/dist/index.html` and `packages/gui/dist/assets/*` exist.

- [ ] **Step 9: Commit**

```bash
git add packages/gui package.json pnpm-lock.yaml
git commit -m "gui: Scaffold Vite + React + Tailwind package"
```

---

### Task 7: Serve `gui/dist`, add `capacityMinutes`, delete `gui.ts`

**Files:**
- Modify: `packages/api/src/server.ts`
- Delete: `packages/api/src/gui.ts`
- Test: `packages/api/test/server.integration.test.ts`

- [ ] **Step 1: Update the integration test**

In `packages/api/test/server.integration.test.ts`:

(a) Replace the `serves the GUI shell at /` test with a fallback-aware version (tests run without a build, so `dist` is absent → server returns a fallback page):

```ts
  it('serves an HTML page at / (build fallback when dist is absent)', async () => {
    const res = await fetch(server.url + '/');
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Caius');
  });
```

(b) Add a `capacityMinutes` assertion to the summary test:

```ts
  it('GET /api/summary includes capacityMinutes', async () => {
    const s = await api('/api/summary');
    expect(s.capacityMinutes).toBe(480);
  });
```

(c) Add a `byGrain` assertion to the funnel test (append inside that `it`):

```ts
    expect(typeof f.byGrain).toBe('object');
```

- [ ] **Step 2: Run to verify it fails**

Run: `corepack pnpm exec vitest run packages/api/test/server.integration.test.ts`
Expected: FAIL — `capacityMinutes` undefined; `/` still references old inlined GUI.

- [ ] **Step 3: Rewrite `server.ts`**

Replace `packages/api/src/server.ts` with:

```ts
// Read-only HTTP API + host for the built ritual GUI. Scans the vault into
// memory, re-scans on file changes (debounced), serves /api/* queries, the
// review split, the (Phase-1 log-only) commit, and the static GUI from
// packages/gui/dist (with a build-hint fallback when dist is absent).

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanVault, type ScanResult } from '@caius/index';
import { watchVault, type Watcher } from '@caius/watch';
import { DEFAULT_CONFIG, type Config } from '@caius/resolve';
import type { State } from '@caius/core';
import { funnel, filterTasks, reviewSplit, explain, flagsSummary } from './query.js';
import { reconcileCommit, type CommitChange } from './commit.js';

export interface ServeOptions {
  root: string;
  port?: number;
  config?: Config;
  now?: Date;
  guiDistDir?: string;
  onRescan?: (result: ScanResult) => void;
}

export interface Server {
  url: string;
  port: number;
  rescan(): void;
  close(): Promise<void>;
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const FALLBACK_HTML = `<!doctype html><meta charset="utf-8"><title>Caius</title>
<body style="font-family:system-ui;background:#0e1116;color:#e6edf3;padding:40px">
<h1>Caius</h1><p>The ritual GUI is not built yet. Run <code>pnpm build</code> (or
<code>pnpm dev:gui</code> for the dev server), then reload.</p></body>`;

function extOf(p: string): string {
  const i = p.lastIndexOf('.');
  return i < 0 ? '' : p.slice(i);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}

export function serveCaius(opts: ServeOptions): Promise<Server> {
  const config = opts.config ?? DEFAULT_CONFIG;
  const now = opts.now ?? new Date();
  const guiDist = opts.guiDistDir ?? fileURLToPath(new URL('../../gui/dist', import.meta.url));
  let result: ScanResult = scanVault(opts.root, config, now);

  const rescan = () => {
    try {
      result = scanVault(opts.root, config, now);
      opts.onRescan?.(result);
    } catch {
      /* keep serving the last good index on a transient read error */
    }
  };
  const watcher: Watcher = watchVault(opts.root, config, rescan, { debounceMs: 300 });

  const json = (res: ServerResponse, body: unknown, status = 200) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const serveStatic = (res: ServerResponse, pathname: string) => {
    const rel = pathname === '/' ? '/index.html' : pathname;
    const abs = guiDist + rel;
    if (existsSync(abs) && statSync(abs).isFile()) {
      res.writeHead(200, { 'content-type': CONTENT_TYPES[extOf(abs)] ?? 'application/octet-stream' });
      res.end(readFileSync(abs));
      return;
    }
    // SPA fallback / build hint.
    const indexAbs = guiDist + '/index.html';
    if (existsSync(indexAbs)) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(readFileSync(indexAbs));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(FALLBACK_HTML);
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const p = url.pathname;
    const q = url.searchParams;

    if (p === '/api/summary')
      return json(res, {
        vault: opts.root,
        report: result.report,
        capacityMinutes: config.capacity.workday_minutes,
      });
    if (p === '/api/funnel') return json(res, funnel(result));
    if (p === '/api/flags') return json(res, flagsSummary(result));
    if (p === '/api/tasks') {
      return json(
        res,
        filterTasks(result, {
          horizon: q.get('horizon') ?? undefined,
          grain: q.get('grain') ?? undefined,
          project: q.get('project') ?? undefined,
          state: (q.get('state') as State | null) ?? undefined,
          live: q.has('live') ? q.get('live') === 'true' : undefined,
        }),
      );
    }
    if (p.startsWith('/api/review/')) {
      const grain = decodeURIComponent(p.slice('/api/review/'.length));
      return json(res, reviewSplit(result, grain));
    }
    if (p === '/api/explain') {
      const rowid = q.get('rowid');
      const e = explain(result, {
        rowid: rowid != null ? Number(rowid) : undefined,
        blockId: q.get('blockId') ?? undefined,
      });
      return e ? json(res, e) : json(res, null, 404);
    }
    if (p === '/api/commit' && req.method === 'POST') {
      void readBody(req).then((raw) => {
        let changes: CommitChange[] = [];
        try {
          const parsed = JSON.parse(raw || '{}');
          changes = Array.isArray(parsed.changes) ? parsed.changes : [];
        } catch {
          return json(res, { error: 'invalid JSON body' }, 400);
        }
        const fresh = scanVault(opts.root, config, now); // diff-against-fresh-scan, not replay
        const out = reconcileCommit(fresh, changes);
        // Phase 1: log the intended diff; write nothing.
        console.log(`[caius commit] applied ${out.applied.length}, conflicts ${out.conflicts.length}`);
        for (const c of out.applied) {
          const bucket = c.toBucket ? `/${c.toBucket}` : '';
          const slot = c.slot ? ` [${c.slot}]` : '';
          console.log(`  ${c.kind} ${c.snapshot.file}:${c.snapshot.line + 1} ${c.fromGrain}→${c.toGrain}${bucket}${slot}`);
        }
        return json(res, out);
      });
      return;
    }
    if (p.startsWith('/api/')) return json(res, { error: 'not found' }, 404);

    return serveStatic(res, p);
  });

  return new Promise((resolve) => {
    server.listen(opts.port ?? 7777, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : (opts.port ?? 7777);
      resolve({
        url: `http://localhost:${port}`,
        port,
        rescan,
        close: () =>
          new Promise<void>((r) => {
            watcher.close();
            server.close(() => r());
          }),
      });
    });
  });
}
```

- [ ] **Step 4: Prune `dayPlan` from query.ts, index.ts, and its test**

In `packages/api/src/query.ts`, delete `DayPlanGroup`, `DayPlan`, `isoDate`, and the `dayPlan` function (the whole block; keep `reviewSplit`).

In `packages/api/src/index.ts`, remove `dayPlan`/`DayPlan`/`DayPlanGroup` and the `INDEX_HTML` re-export (`gui.ts` is deleted in Step 5). The file becomes:

```ts
export {
  funnel,
  filterTasks,
  reviewSplit,
  explain,
  flagsSummary,
} from './query.js';
export type { Funnel, FunnelLane, TaskFilter, ReviewSplit, Explanation, FlagGroup } from './query.js';
export { serveCaius } from './server.js';
export type { ServeOptions, Server } from './server.js';
```

In `packages/api/test/query.test.ts`, drop `dayPlan` from the import line and delete the entire `describe('dayPlan', ...)` block:

```ts
import { funnel, filterTasks, reviewSplit, explain, flagsSummary } from '../src/query.js';
```

- [ ] **Step 5: Delete the old inlined GUI**

Run: `git rm packages/api/src/gui.ts`

- [ ] **Step 6: Create the `commit.ts` stub (the `reconcileCommit` body is fleshed out + tested in Task 16; the stub keeps the API package compiling now)**

`packages/api/src/commit.ts`:

```ts
import type { ScanResult } from '@caius/index';

export interface CommitChange {
  taskId: string;
  fromGrain: string;
  toGrain: string;
  toBucket?: 'this' | 'next';
  slot?: 'today' | 'tomorrow';
  kind: 'promote' | 'skip' | 'defer' | 'rollback' | 'drop';
  snapshot: { file: string; line: number; text: string };
}

export interface CommitResult {
  applied: CommitChange[];
  conflicts: { taskId: string; reason: string }[];
}

/** Phase-1 reconciliation (fleshed out + tested in Task 16). */
export function reconcileCommit(_fresh: ScanResult, _changes: CommitChange[]): CommitResult {
  return { applied: [], conflicts: [] };
}
```

- [ ] **Step 7: Run the API tests + typecheck**

Run: `corepack pnpm exec tsc -b`
Then: `corepack pnpm exec vitest run packages/api`
Expected: PASS (integration fallback + capacityMinutes + byGrain green; no `dayPlan` references remain).

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/server.ts packages/api/src/commit.ts packages/api/src/query.ts packages/api/src/index.ts packages/api/test/server.integration.test.ts packages/api/test/query.test.ts
git rm packages/api/src/gui.ts
git commit -m "api: Serve built GUI from dist; capacityMinutes; review+commit routes; drop dayPlan + inlined gui"
```

---

### Task 8: `lib/grains.ts` — the mapping source of truth (+ parity test)

**Files:**
- Create: `packages/gui/src/lib/grains.ts`, `packages/gui/src/lib/grains.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/gui/src/lib/grains.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GRAINS } from '@caius/resolve';
import { PIPELINE, GRAIN_LABEL, NEXT_GRAIN, PREV_GRAIN, RITUALS } from './grains';

describe('grains — engine parity', () => {
  it('PIPELINE order equals the engine GRAINS', () => {
    expect(PIPELINE).toEqual([...GRAINS]);
  });
  it('every grain has a Marvin label', () => {
    for (const g of PIPELINE) expect(GRAIN_LABEL[g]).toBeTruthy();
  });
});

describe('grains — ladder', () => {
  it('NEXT and PREV are inverse along the pipeline', () => {
    expect(NEXT_GRAIN.someday).toBe('month');
    expect(NEXT_GRAIN.day).toBeNull();
    expect(PREV_GRAIN.day).toBe('week');
    expect(PREV_GRAIN.someday).toBeNull();
  });
});

describe('grains — rituals', () => {
  it('exposes plan + review at all three altitudes', () => {
    for (const alt of ['month', 'week', 'day'] as const) {
      expect(RITUALS[alt].plan.posture).toBe('plan');
      expect(RITUALS[alt].review.posture).toBe('review');
    }
    expect(RITUALS.day.review.title).toBe('Daily shutdown');
    expect(RITUALS.day.plan.from).toBe('week');
    expect(RITUALS.day.plan.to).toBe('day');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `corepack pnpm exec vitest run packages/gui/src/lib/grains.test.ts`
Expected: FAIL — `./grains` not found.

- [ ] **Step 3: Implement `grains.ts`**

`packages/gui/src/lib/grains.ts`:

```ts
// The single source of truth for grain ↔ Marvin-label ↔ period mapping and the
// ritual table. The four grain strings MUST match @caius/resolve GRAINS
// (asserted by grains.test.ts).

export type Grain = 'someday' | 'month' | 'week' | 'day';
export type Posture = 'plan' | 'review';
export type Altitude = 'month' | 'week' | 'day';

export const GRAIN_LABEL: Record<Grain, string> = {
  someday: 'Someday',
  month: 'Planning Ahead',
  week: 'Orbit',
  day: 'Today',
};

export const PIPELINE: Grain[] = ['someday', 'month', 'week', 'day'];

export const NEXT_GRAIN: Record<Grain, Grain | null> = {
  someday: 'month', month: 'week', week: 'day', day: null,
};
export const PREV_GRAIN: Record<Grain, Grain | null> = {
  someday: null, month: 'someday', week: 'month', day: 'week',
};

/** "this / next" period labels per altitude (both directions use these). */
export const PERIOD_LABEL: Record<Altitude, { this: string; next: string }> = {
  month: { this: 'this month', next: 'next month' },
  week: { this: 'this week', next: 'next week' },
  day: { this: 'today', next: 'tomorrow' },
};

export interface Ritual {
  key: string;
  altitude: Altitude;
  posture: Posture;
  title: string;
  from?: Grain;
  to?: Grain;
  grain?: Grain;
  blurb: string;
}

export const RITUALS: Record<Altitude, Record<Posture, Ritual>> = {
  month: {
    plan: { key: 'month-plan', altitude: 'month', posture: 'plan', title: 'Monthly planning', from: 'someday', to: 'month', blurb: 'what is worth committing to a month' },
    review: { key: 'month-review', altitude: 'month', posture: 'review', title: 'Monthly review', grain: 'month', blurb: 'what slipped — defer or drop' },
  },
  week: {
    plan: { key: 'week-plan', altitude: 'week', posture: 'plan', title: 'Weekly planning', from: 'month', to: 'week', blurb: 'what is actually happening this week' },
    review: { key: 'week-review', altitude: 'week', posture: 'review', title: 'Weekly review', grain: 'week', blurb: 'what slipped — defer or drop' },
  },
  day: {
    plan: { key: 'day-plan', altitude: 'day', posture: 'plan', title: 'Daily planning', from: 'week', to: 'day', blurb: 'do now, or push to tomorrow' },
    review: { key: 'day-review', altitude: 'day', posture: 'review', title: 'Daily shutdown', grain: 'day', blurb: 'close out the day, defer the rest' },
  },
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `corepack pnpm exec vitest run packages/gui/src/lib/grains.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/gui/src/lib/grains.ts packages/gui/src/lib/grains.test.ts
git commit -m "gui: Add grains.ts mapping (engine-parity tested)"
```

---

### Task 9: `lib/api.ts` — typed fetch + `ApiTask`→`UiTask`

**Files:**
- Create: `packages/gui/src/lib/api.ts`

- [ ] **Step 1: Implement `api.ts`** (no unit test — exercised by milestone Playwright checks)

`packages/gui/src/lib/api.ts`:

```ts
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
    inProgress: t.state === 'in_progress',
    done: t.state === 'done' || t.state === 'cancelled',
  };
}

const getJson = <T>(u: string): Promise<T> => fetch(u).then((r) => r.json() as Promise<T>);

export async function fetchTasksAtGrain(grain: Grain): Promise<UiTask[]> {
  const tasks = await getJson<ApiTask[]>(`/api/tasks?grain=${grain}&live=true`);
  return tasks.map(toUiTask);
}

export async function fetchOverdue(): Promise<UiTask[]> {
  const tasks = await getJson<ApiTask[]>(`/api/tasks?live=true`);
  return tasks.filter((t) => t.bucket === 'past').map(toUiTask);
}

export async function fetchReview(grain: Grain): Promise<{ done: UiTask[]; open: UiTask[] }> {
  const r = await getJson<{ done: ApiTask[]; open: ApiTask[] }>(`/api/review/${grain}`);
  return { done: r.done.map(toUiTask), open: r.open.map(toUiTask) };
}

export interface FunnelData { byGrain: Record<string, number>; now: ApiTask[]; }
export const fetchFunnel = () => getJson<FunnelData>('/api/funnel');

export interface SummaryData {
  vault: string;
  capacityMinutes: number;
  report: { fileCount: number; taskCount: number; liveCount: number };
}
export const fetchSummary = () => getJson<SummaryData>('/api/summary');
```

- [ ] **Step 2: Typecheck**

Run: `corepack pnpm --filter @caius/gui exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/gui/src/lib/api.ts
git commit -m "gui: Add typed API client (ApiTask→UiTask seam)"
```

---

### Task 10: App shell + `RitualHeader` + `PipelineStrip`

**Files:**
- Create: `packages/gui/src/components/RitualHeader.tsx`, `packages/gui/src/components/PipelineStrip.tsx`
- Modify: `packages/gui/src/App.tsx`

- [ ] **Step 1: Implement `RitualHeader.tsx`**

`packages/gui/src/components/RitualHeader.tsx`:

```tsx
import { useState } from 'react';
import { RITUALS, type Altitude, type Posture } from '../lib/grains';

interface Props {
  altitude: Altitude;
  posture: Posture;
  onPick: (altitude: Altitude, posture: Posture) => void;
  onPosture: (posture: Posture) => void;
}

const ALTITUDES: Altitude[] = ['month', 'week', 'day'];

export function RitualHeader({ altitude, posture, onPick, onPosture }: Props) {
  const [open, setOpen] = useState(false);
  const ritual = RITUALS[altitude][posture];
  return (
    <header className="flex items-center gap-4 px-5 py-4 border-b border-line relative">
      <button
        data-testid="ritual-title"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-2xl font-medium text-ink"
      >
        {ritual.title}
        <span className="text-dim text-base">▾</span>
      </button>

      <div className="flex rounded-full bg-panel2 p-0.5 text-sm" data-testid="posture-toggle">
        {(['plan', 'review'] as Posture[]).map((ps) => (
          <button
            key={ps}
            data-testid={`posture-${ps}`}
            onClick={() => onPosture(ps)}
            className={`px-3 py-1 rounded-full capitalize ${
              posture === ps ? (ps === 'review' ? 'bg-warn text-bg' : 'bg-accent text-bg') : 'text-dim'
            }`}
          >
            {ps}
          </button>
        ))}
      </div>

      <span className="ml-auto text-dim text-xs">{ritual.blurb}</span>

      {open && (
        <div
          data-testid="ritual-menu"
          className="absolute left-5 top-16 z-10 w-72 rounded-lg border border-line bg-panel p-2 shadow-xl"
        >
          {ALTITUDES.map((alt) => (
            <div key={alt} className="mb-2 last:mb-0">
              <div className="px-2 py-1 text-xs uppercase tracking-wide text-dim">{alt}</div>
              {(['plan', 'review'] as Posture[]).map((ps) => (
                <button
                  key={ps}
                  data-testid={`menu-${alt}-${ps}`}
                  onClick={() => {
                    onPick(alt, ps);
                    setOpen(false);
                  }}
                  className="block w-full rounded px-2 py-1.5 text-left hover:bg-panel2"
                >
                  {RITUALS[alt][ps].title}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </header>
  );
}
```

- [ ] **Step 2: Implement `PipelineStrip.tsx`**

`packages/gui/src/components/PipelineStrip.tsx`:

```tsx
import { PIPELINE, GRAIN_LABEL, type Grain } from '../lib/grains';

interface Props {
  byGrain: Record<string, number>;
  from?: Grain;
  to?: Grain;
  auditGrain?: Grain;
  overdueCount: number;
  nowCount: number;
}

export function PipelineStrip({ byGrain, from, to, auditGrain, overdueCount, nowCount }: Props) {
  const lit = (g: Grain) => g === from || g === to || g === auditGrain;
  return (
    <div className="flex items-center gap-2 px-5 py-2 border-b border-line text-xs" data-testid="pipeline-strip">
      {PIPELINE.map((g, i) => (
        <span key={g} className="flex items-center gap-2">
          {i > 0 && <span className="text-dim">→</span>}
          <span
            data-testid={`pipe-${g}`}
            className={`rounded px-2 py-1 ${lit(g) ? 'bg-panel2 text-ink' : 'text-dim'}`}
          >
            {GRAIN_LABEL[g]} <b className="text-ink">{byGrain[g] ?? 0}</b>
          </span>
        </span>
      ))}
      <span className="ml-auto flex gap-3">
        <span className="text-good" data-testid="now-count">now {nowCount}</span>
        <span className="text-over" data-testid="overdue-count">overdue {overdueCount}</span>
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Replace `App.tsx` with the shell**

`packages/gui/src/App.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { type Altitude, type Posture, RITUALS } from './lib/grains';
import { fetchFunnel, fetchSummary, fetchOverdue, type FunnelData, type SummaryData, type UiTask } from './lib/api';
import { RitualHeader } from './components/RitualHeader';
import { PipelineStrip } from './components/PipelineStrip';

export function App() {
  const [altitude, setAltitude] = useState<Altitude>('day');
  const [posture, setPosture] = useState<Posture>('plan');
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [overdue, setOverdue] = useState<UiTask[]>([]);

  useEffect(() => {
    void fetchFunnel().then(setFunnel);
    void fetchSummary().then(setSummary);
    void fetchOverdue().then(setOverdue);
  }, []);

  const ritual = RITUALS[altitude][posture];

  return (
    <div className="min-h-full">
      <RitualHeader
        altitude={altitude}
        posture={posture}
        onPick={(a, p) => { setAltitude(a); setPosture(p); }}
        onPosture={setPosture}
      />
      <PipelineStrip
        byGrain={funnel?.byGrain ?? {}}
        from={ritual.from}
        to={ritual.to}
        auditGrain={ritual.grain}
        overdueCount={overdue.length}
        nowCount={funnel?.now.length ?? 0}
      />
      <main className="p-5" data-testid="ritual-body">
        <div className="text-dim text-sm">
          {summary ? `${summary.report.liveCount} live tasks · ${summary.vault}` : 'loading…'}
        </div>
        <div className="mt-4 text-dim" data-testid="view-placeholder">
          {ritual.title} — view lands in Milestone {posture === 'plan' ? 2 : 3}.
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + build**

Run: `corepack pnpm --filter @caius/gui build`
Expected: PASS — `dist` regenerated.

- [ ] **Step 5: Verify the shell in a browser (Playwright MCP)**

Run the server against the test vault, built GUI served from dist. (`.testvault` is a gitignored clone of the real vault — create it once with `git clone /home/shawn/documents/obsidian/Main .testvault` if absent.)
```bash
corepack pnpm build && node packages/cli/dist/main.js serve .testvault --port 7777 &
```
Then drive with Playwright MCP:
- `browser_navigate` → `http://localhost:7777`
- `browser_snapshot` — expect `data-testid="ritual-title"` reading **"Daily planning"**, a `pipeline-strip` with four labels (Someday/Planning Ahead/Orbit/Today) and counts, and `now`/`overdue` counts.
- `browser_click` on `data-testid="ritual-title"`, then on `data-testid="menu-week-review"` — expect the title to become **"Weekly review"** and the Review pill to be active (amber).
- `browser_click` on `data-testid="posture-plan"` — expect title **"Weekly planning"**.

Stop the server (`kill %1`) when done.

- [ ] **Step 6: Commit**

```bash
git add packages/gui/src/App.tsx packages/gui/src/components/RitualHeader.tsx packages/gui/src/components/PipelineStrip.tsx
git commit -m "gui: App shell + RitualHeader (dropdown + Plan/Review pill) + PipelineStrip"
```

---

## Milestone 2 — Plan posture (staging buffer + plan views)

### Task 11: `lib/staging.ts` — buffer reducer (+ test)

**Files:**
- Create: `packages/gui/src/lib/staging.ts`, `packages/gui/src/lib/staging.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/gui/src/lib/staging.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { stagingReducer, type PendingChange, type StagingBuffer } from './staging';

const change = (taskId: string, over: Partial<PendingChange> = {}): PendingChange => ({
  taskId,
  fromGrain: 'week',
  toGrain: 'day',
  toBucket: 'this',
  kind: 'promote',
  snapshot: { file: 'f.md', line: 1, text: 't' },
  ...over,
});

describe('stagingReducer', () => {
  it('stages a change keyed by taskId', () => {
    const s = stagingReducer({}, { type: 'stage', change: change('a') });
    expect(s.a!.kind).toBe('promote');
  });
  it('re-staging the same task overwrites', () => {
    let s: StagingBuffer = stagingReducer({}, { type: 'stage', change: change('a') });
    s = stagingReducer(s, { type: 'stage', change: change('a', { kind: 'drop' }) });
    expect(s.a!.kind).toBe('drop');
    expect(Object.keys(s)).toHaveLength(1);
  });
  it('unstages a task', () => {
    let s: StagingBuffer = stagingReducer({}, { type: 'stage', change: change('a') });
    s = stagingReducer(s, { type: 'unstage', taskId: 'a' });
    expect(s.a).toBeUndefined();
  });
  it('clears the buffer', () => {
    let s: StagingBuffer = stagingReducer({}, { type: 'stage', change: change('a') });
    s = stagingReducer(s, { type: 'clear' });
    expect(Object.keys(s)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `corepack pnpm exec vitest run packages/gui/src/lib/staging.test.ts`
Expected: FAIL — `./staging` not found.

- [ ] **Step 3: Implement `staging.ts`**

`packages/gui/src/lib/staging.ts`:

```ts
import type { Grain } from './grains';

export type ChangeKind = 'promote' | 'skip' | 'defer' | 'rollback' | 'drop';

export interface PendingChange {
  taskId: string;                 // (file,line) surrogate — temporary; ^id at Phase-2 commit
  fromGrain: Grain;
  toGrain: Grain;                 // 'drop' keeps fromGrain
  toBucket?: 'this' | 'next';
  slot?: 'today' | 'tomorrow';    // only when toGrain === 'day'
  kind: ChangeKind;
  snapshot: { file: string; line: number; text: string }; // for commit reconciliation
}
export type StagingBuffer = Record<string, PendingChange>;

export type StagingAction =
  | { type: 'stage'; change: PendingChange }
  | { type: 'unstage'; taskId: string }
  | { type: 'clear' };

export function stagingReducer(buf: StagingBuffer, a: StagingAction): StagingBuffer {
  switch (a.type) {
    case 'stage':
      return { ...buf, [a.change.taskId]: a.change };
    case 'unstage': {
      const n = { ...buf };
      delete n[a.taskId];
      return n;
    }
    case 'clear':
      return {};
  }
}

export interface CommitResult {
  applied: PendingChange[];
  conflicts: { taskId: string; reason: string }[];
}

/** POST the buffer to the Phase-1 commit endpoint (re-scan + reconcile; no write). */
export async function commit(buf: StagingBuffer): Promise<CommitResult> {
  const res = await fetch('/api/commit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ changes: Object.values(buf) }),
  });
  return (await res.json()) as CommitResult;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `corepack pnpm exec vitest run packages/gui/src/lib/staging.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/gui/src/lib/staging.ts packages/gui/src/lib/staging.test.ts
git commit -m "gui: Add staging buffer reducer + commit() client"
```

---

### Task 12: `TaskCard` + `SkipMenu`

**Files:**
- Create: `packages/gui/src/components/TaskCard.tsx`, `packages/gui/src/components/SkipMenu.tsx`

- [ ] **Step 1: Implement `SkipMenu.tsx`**

`packages/gui/src/components/SkipMenu.tsx`:

```tsx
import { useState } from 'react';
import { PIPELINE, GRAIN_LABEL, NEXT_GRAIN, type Grain } from '../lib/grains';

interface Props {
  current: Grain;                         // the task's current grain
  onPick: (toGrain: Grain, isSkip: boolean) => void;
}

/** ⋯ menu listing every grain finer than `current`; beyond the default `next` is a skip. */
export function SkipMenu({ current, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const finer = PIPELINE.slice(PIPELINE.indexOf(current) + 1);
  const def = NEXT_GRAIN[current];
  if (finer.length === 0) return null;
  return (
    <div className="relative">
      <button
        data-testid="skip-trigger"
        onClick={() => setOpen((o) => !o)}
        className="px-1.5 text-dim hover:text-ink"
        aria-label="more destinations"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-line bg-panel p-1 shadow-xl" data-testid="skip-menu">
          {finer.map((g) => {
            const isSkip = g !== def;
            return (
              <button
                key={g}
                data-testid={`skip-to-${g}`}
                onClick={() => { onPick(g, isSkip); setOpen(false); }}
                className="block w-full rounded px-2 py-1.5 text-left hover:bg-panel2"
              >
                → {GRAIN_LABEL[g]} {isSkip && <span className="text-warn text-xs">(skip)</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement `TaskCard.tsx`**

`packages/gui/src/components/TaskCard.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { UiTask } from '../lib/api';

interface Props {
  task: UiTask;
  staged?: boolean;
  actions?: ReactNode;
}

function estLabel(min: number | null): string {
  if (min == null) return 'no est';
  if (min % 60 === 0) return `~${min / 60}h`;
  if (min > 60) return `~${Math.floor(min / 60)}h${min % 60}m`;
  return `~${min}m`;
}

export function TaskCard({ task, staged, actions }: Props) {
  return (
    <div
      data-testid="task-card"
      data-staged={staged ? 'true' : 'false'}
      className={`rounded-lg border border-line bg-panel2 p-2.5 ${
        task.inProgress ? 'border-l-2 border-l-good' : ''
      } ${staged ? 'opacity-[0.42]' : ''}`}
    >
      <div className="flex items-start gap-2">
        <div className={`flex-1 text-sm ${task.done ? 'line-through text-dim' : 'text-ink'}`}>
          {task.inProgress && <span className="mr-1 text-good">◷</span>}
          {task.text || '(untitled)'}
        </div>
        {actions}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-dim">
        {task.project && <span className="text-accent">{task.project}</span>}
        <span className={task.estMinutes == null ? 'text-warn' : ''}>{estLabel(task.estMinutes)}</span>
        {task.importance > 0 && <span>{'!'.repeat(task.importance)}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `corepack pnpm --filter @caius/gui exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/gui/src/components/TaskCard.tsx packages/gui/src/components/SkipMenu.tsx
git commit -m "gui: Add TaskCard + SkipMenu (deliberate grain-skip)"
```

---

### Task 13: `PendingTray`

**Files:**
- Create: `packages/gui/src/components/PendingTray.tsx`

- [ ] **Step 1: Implement `PendingTray.tsx`**

`packages/gui/src/components/PendingTray.tsx`:

```tsx
import { GRAIN_LABEL } from '../lib/grains';
import type { PendingChange } from '../lib/staging';

interface Props {
  changes: PendingChange[];
  commitLabel: string;                 // e.g. "commit daily planning"
  conflicts?: { taskId: string; reason: string }[];
  onUnstage: (taskId: string) => void;
  onCommit: () => void;
}

export function PendingTray({ changes, commitLabel, conflicts = [], onUnstage, onCommit }: Props) {
  return (
    <aside className="rounded-lg border border-line bg-panel p-3" data-testid="pending-tray">
      <div className="mb-2 text-xs uppercase tracking-wide text-dim">Staging buffer</div>
      {changes.length === 0 ? (
        <div className="text-sm italic text-dim" data-testid="tray-empty">staging buffer empty</div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {changes.map((c) => (
            <li key={c.taskId} data-testid="tray-row" className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate">
                <span className="text-dim">{c.snapshot.text}</span>{' '}
                <span className={c.kind === 'drop' ? 'text-over' : 'text-ink'}>
                  {c.kind === 'drop'
                    ? 'drop'
                    : `${GRAIN_LABEL[c.fromGrain]} → ${GRAIN_LABEL[c.toGrain]}${c.toBucket ? ` (${c.toBucket})` : ''}`}
                </span>{' '}
                {c.kind === 'skip' && <span className="text-warn text-xs">(skip)</span>}
              </span>
              <button data-testid="tray-undo" onClick={() => onUnstage(c.taskId)} className="text-dim hover:text-over">×</button>
            </li>
          ))}
        </ul>
      )}

      {conflicts.length > 0 && (
        <div className="mt-2 rounded border border-over/40 p-2 text-xs text-over" data-testid="tray-conflicts">
          {conflicts.length} conflict(s) kept staged:
          <ul className="mt-1 list-disc pl-4">
            {conflicts.map((c) => <li key={c.taskId}>{c.reason}</li>)}
          </ul>
        </div>
      )}

      <button
        data-testid="commit-button"
        disabled={changes.length === 0}
        onClick={onCommit}
        className="mt-3 w-full rounded-lg bg-accent px-3 py-2 text-bg disabled:opacity-40"
      >
        {commitLabel}
      </button>
    </aside>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `corepack pnpm --filter @caius/gui exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/gui/src/components/PendingTray.tsx
git commit -m "gui: Add PendingTray (staged diffs + commit button + conflict surface)"
```

---

### Task 14: `PlanView` + `DayPlanView` + wire Plan into App

**Files:**
- Create: `packages/gui/src/components/PlanView.tsx`, `packages/gui/src/components/DayPlanView.tsx`
- Modify: `packages/gui/src/App.tsx`

- [ ] **Step 1: Implement `PlanView.tsx`**

`packages/gui/src/components/PlanView.tsx`:

```tsx
import { RITUALS, GRAIN_LABEL, NEXT_GRAIN, type Altitude, type Grain } from '../lib/grains';
import type { UiTask } from '../lib/api';
import type { PendingChange } from '../lib/staging';
import { TaskCard } from './TaskCard';
import { SkipMenu } from './SkipMenu';

interface Props {
  altitude: Altitude;
  source: UiTask[];                 // tasks at the `from` grain
  targetBucket: 'this' | 'next';
  pending: Record<string, PendingChange>;
  onStage: (c: PendingChange) => void;
  onUnstage: (taskId: string) => void;
}

function groupByProject(tasks: UiTask[]): [string, UiTask[]][] {
  const m = new Map<string, UiTask[]>();
  for (const t of tasks) {
    const k = t.project ?? 'no project';
    (m.get(k) ?? m.set(k, []).get(k)!).push(t);
  }
  return [...m.entries()];
}

export function PlanView({ altitude, source, targetBucket, pending, onStage, onUnstage }: Props) {
  const ritual = RITUALS[altitude].plan;
  const from = ritual.from!;
  const defaultTo = NEXT_GRAIN[from]!;

  const stage = (t: UiTask, toGrain: Grain, isSkip: boolean) => {
    const change: PendingChange = {
      taskId: t.id,
      fromGrain: t.grain ?? from,
      toGrain,
      toBucket: targetBucket,
      slot: toGrain === 'day' ? (targetBucket === 'this' ? 'today' : 'tomorrow') : undefined,
      kind: isSkip ? 'skip' : 'promote',
      snapshot: { file: t.file, line: t.line, text: t.text },
    };
    onStage(change);
  };

  return (
    <section data-testid="plan-view" className="flex flex-col gap-4">
      {source.length === 0 && <div className="italic text-dim" data-testid="plan-empty">Nothing in {GRAIN_LABEL[from]}.</div>}
      {groupByProject(source).map(([project, tasks]) => (
        <div key={project}>
          <div className="mb-1.5 text-xs uppercase tracking-wide text-dim">{project}</div>
          <div className="flex flex-col gap-1.5">
            {tasks.map((t) => {
              const staged = !!pending[t.id];
              return (
                <TaskCard
                  key={t.id}
                  task={t}
                  staged={staged}
                  actions={
                    staged ? (
                      <button data-testid="plan-unstage" onClick={() => onUnstage(t.id)} className="text-dim hover:text-over text-sm">undo</button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          data-testid="plan-promote"
                          onClick={() => stage(t, defaultTo, false)}
                          className="rounded bg-panel2 px-2 py-0.5 text-xs text-accent hover:bg-line"
                        >
                          → {GRAIN_LABEL[defaultTo]}
                        </button>
                        <SkipMenu current={from} onPick={(g, isSkip) => stage(t, g, isSkip)} />
                      </div>
                    )
                  }
                />
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 2: Implement `DayPlanView.tsx`**

`packages/gui/src/components/DayPlanView.tsx`:

```tsx
import type { UiTask } from '../lib/api';
import type { PendingChange } from '../lib/staging';
import { TaskCard } from './TaskCard';

interface Props {
  source: UiTask[];                  // Orbit (week grain, this week) — the source
  capacityMinutes: number;
  pending: Record<string, PendingChange>;
  onStage: (c: PendingChange) => void;
  onUnstage: (taskId: string) => void;
}

export function DayPlanView({ source, capacityMinutes, pending, onStage, onUnstage }: Props) {
  const slotted = (slot: 'today' | 'tomorrow') =>
    Object.values(pending).filter((c) => c.toGrain === 'day' && c.slot === slot);

  const estFor = (changes: PendingChange[]) =>
    changes.reduce((sum, c) => {
      const t = source.find((s) => s.id === c.taskId);
      return sum + (t?.estMinutes ?? 0);
    }, 0);

  const stageTo = (t: UiTask, slot: 'today' | 'tomorrow') =>
    onStage({
      taskId: t.id,
      fromGrain: 'week',
      toGrain: 'day',
      toBucket: slot === 'today' ? 'this' : 'next',
      slot,
      kind: 'promote',
      snapshot: { file: t.file, line: t.line, text: t.text },
    });

  const column = (title: string, slot: 'today' | 'tomorrow') => {
    const changes = slotted(slot);
    const est = estFor(changes);
    const over = est > capacityMinutes;
    return (
      <div className="flex-1 rounded-lg border border-line bg-panel p-3" data-testid={`day-col-${slot}`}>
        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-dim">
          <span>{title}</span>
          <span data-testid={`cap-${slot}`} className={over ? 'text-over' : ''}>{est}/{capacityMinutes}m</span>
        </div>
        <div className={`mt-1 h-2 rounded-full bg-panel2`}>
          <div className={`h-full rounded-full ${over ? 'bg-over' : 'bg-good'}`} style={{ width: `${capacityMinutes ? Math.min(100, Math.round((100 * est) / capacityMinutes)) : 0}%` }} />
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          {changes.map((c) => {
            const t = source.find((s) => s.id === c.taskId);
            if (!t) return null;
            return <TaskCard key={c.taskId} task={t} actions={<button data-testid="day-unstage" onClick={() => onUnstage(c.taskId)} className="text-dim hover:text-over text-sm">×</button>} />;
          })}
          {changes.length === 0 && <div className="text-xs italic text-dim">empty</div>}
        </div>
      </div>
    );
  };

  return (
    <section data-testid="day-plan-view" className="flex gap-4">
      <div className="flex-1 rounded-lg border border-line bg-panel p-3" data-testid="day-col-source">
        <div className="text-xs uppercase tracking-wide text-dim">Orbit (this week)</div>
        <div className="mt-2 flex flex-col gap-1.5">
          {source.filter((t) => !pending[t.id]).map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              actions={
                <div className="flex gap-1">
                  <button data-testid="slot-today" onClick={() => stageTo(t, 'today')} className="rounded bg-panel2 px-2 py-0.5 text-xs text-accent">today</button>
                  <button data-testid="slot-tomorrow" onClick={() => stageTo(t, 'tomorrow')} className="rounded bg-panel2 px-2 py-0.5 text-xs text-dim">tomorrow</button>
                </div>
              }
            />
          ))}
          {source.every((t) => pending[t.id]) && source.length > 0 && <div className="text-xs italic text-dim">all slotted</div>}
          {source.length === 0 && <div className="text-xs italic text-dim" data-testid="day-source-empty">Orbit is empty.</div>}
        </div>
      </div>
      {column('Today', 'today')}
      {column('Tomorrow', 'tomorrow')}
    </section>
  );
}
```

- [ ] **Step 3: Wire Plan posture into `App.tsx`**

Replace `packages/gui/src/App.tsx` with:

```tsx
import { useEffect, useReducer, useState } from 'react';
import { type Altitude, type Posture, RITUALS } from './lib/grains';
import {
  fetchFunnel, fetchSummary, fetchOverdue, fetchTasksAtGrain,
  type FunnelData, type SummaryData, type UiTask,
} from './lib/api';
import { stagingReducer, commit, type PendingChange, type CommitResult } from './lib/staging';
import { RitualHeader } from './components/RitualHeader';
import { PipelineStrip } from './components/PipelineStrip';
import { PlanView } from './components/PlanView';
import { DayPlanView } from './components/DayPlanView';
import { PendingTray } from './components/PendingTray';

export function App() {
  const [altitude, setAltitude] = useState<Altitude>('day');
  const [posture, setPosture] = useState<Posture>('plan');
  const [targetBucket, setTargetBucket] = useState<'this' | 'next'>('this');

  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [overdue, setOverdue] = useState<UiTask[]>([]);
  const [source, setSource] = useState<UiTask[]>([]);

  const [buffer, dispatch] = useReducer(stagingReducer, {});
  const [conflicts, setConflicts] = useState<CommitResult['conflicts']>([]);

  const ritual = RITUALS[altitude][posture];

  useEffect(() => {
    void fetchFunnel().then(setFunnel);
    void fetchSummary().then(setSummary);
    void fetchOverdue().then(setOverdue);
  }, []);

  useEffect(() => {
    if (posture === 'plan' && ritual.from) void fetchTasksAtGrain(ritual.from).then(setSource);
  }, [posture, ritual.from]);

  const onStage = (c: PendingChange) => dispatch({ type: 'stage', change: c });
  const onUnstage = (taskId: string) => dispatch({ type: 'unstage', taskId });

  const onCommit = async () => {
    const res = await commit(buffer);
    setConflicts(res.conflicts);
    // Keep conflicts staged; clear the applied (clean) subset.
    const conflictIds = new Set(res.conflicts.map((c) => c.taskId));
    for (const id of Object.keys(buffer)) if (!conflictIds.has(id)) dispatch({ type: 'unstage', taskId: id });
    void fetchFunnel().then(setFunnel);
  };

  return (
    <div className="min-h-full">
      <RitualHeader
        altitude={altitude}
        posture={posture}
        onPick={(a, p) => { setAltitude(a); setPosture(p); }}
        onPosture={setPosture}
      />
      <PipelineStrip
        byGrain={funnel?.byGrain ?? {}}
        from={ritual.from}
        to={ritual.to}
        auditGrain={ritual.grain}
        overdueCount={overdue.length}
        nowCount={funnel?.now.length ?? 0}
      />
      <main className="grid grid-cols-[1fr_320px] gap-5 p-5" data-testid="ritual-body">
        <div>
          {posture === 'plan' && altitude !== 'day' && (
            <div className="mb-3 flex gap-1 text-xs" data-testid="bucket-toggle">
              {(['this', 'next'] as const).map((b) => (
                <button
                  key={b}
                  data-testid={`bucket-${b}`}
                  onClick={() => setTargetBucket(b)}
                  className={`rounded px-2 py-1 ${targetBucket === b ? 'bg-panel2 text-ink' : 'text-dim'}`}
                >
                  {b} {altitude}
                </button>
              ))}
            </div>
          )}

          {posture === 'plan' && altitude === 'day' && (
            <DayPlanView
              source={source}
              capacityMinutes={summary?.capacityMinutes ?? 480}
              pending={buffer}
              onStage={onStage}
              onUnstage={onUnstage}
            />
          )}
          {posture === 'plan' && altitude !== 'day' && (
            <PlanView
              altitude={altitude}
              source={source}
              targetBucket={targetBucket}
              pending={buffer}
              onStage={onStage}
              onUnstage={onUnstage}
            />
          )}
          {posture === 'review' && (
            <div className="text-dim" data-testid="review-placeholder">Review lands in Milestone 3.</div>
          )}
        </div>

        <PendingTray
          changes={Object.values(buffer)}
          commitLabel={`commit ${ritual.title.toLowerCase()}`}
          conflicts={conflicts}
          onUnstage={onUnstage}
          onCommit={() => void onCommit()}
        />
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Build**

Run: `corepack pnpm --filter @caius/gui build`
Expected: PASS.

- [ ] **Step 5: Verify Plan flow (Playwright MCP)**

Rebuild + serve, then drive:
```bash
corepack pnpm build && node packages/cli/dist/main.js serve .testvault --port 7777 &
```
- Navigate to `http://localhost:7777`. Default ritual = **Daily planning** → `day-plan-view` with three columns (`day-col-source`, `day-col-today`, `day-col-tomorrow`).
- `browser_click` a `slot-today` button on a source card → expect that card to leave the source column and appear under Today, `cap-today` minutes to increase, and a `tray-row` to appear.
- Switch to **Weekly planning** (menu → `menu-week-plan`): expect `plan-view`, a `bucket-toggle`, and `plan-promote` buttons reading "→ Orbit".
- Click `plan-promote` on a card → card greys (`data-staged="true"`) and a `tray-row` appears reading "Planning Ahead → Orbit (this)".
- Click `skip-trigger` → `skip-menu` lists "→ Today (skip)"; clicking it stages a row with the `(skip)` tag.

Stop the server when done.

- [ ] **Step 6: Commit**

```bash
git add packages/gui/src/App.tsx packages/gui/src/components/PlanView.tsx packages/gui/src/components/DayPlanView.tsx
git commit -m "gui: Plan posture — PlanView, DayPlanView (3-col + capacity), staging wired"
```

---

## Milestone 3 — Review posture

### Task 15: `ReviewView` + `RitualSummary` + wire Review into App

**Files:**
- Create: `packages/gui/src/components/ReviewView.tsx`, `packages/gui/src/components/RitualSummary.tsx`
- Modify: `packages/gui/src/App.tsx`

- [ ] **Step 1: Implement `RitualSummary.tsx` (reserved slot, counts only)**

`packages/gui/src/components/RitualSummary.tsx`:

```tsx
import type { Altitude } from '../lib/grains';

interface Props {
  altitude: Altitude;
  doneCount: number;
  openCount: number;
  stagedCount: number;
  completedMinutes?: number;
  capacityMinutes?: number;
}

/** Reserved slot — counts only in Phase 1; narrative summary is deferred (spec §9). */
export function RitualSummary({ altitude, doneCount, openCount, stagedCount, completedMinutes, capacityMinutes }: Props) {
  return (
    <div className="rounded-lg border border-line bg-panel p-3 text-sm" data-testid="ritual-summary">
      <span className="text-ink">{doneCount} done</span>
      <span className="text-dim"> · </span>
      <span className="text-ink">{openCount} open</span>
      <span className="text-dim"> · </span>
      <span className="text-ink">{stagedCount} staged</span>
      {altitude === 'day' && completedMinutes != null && capacityMinutes != null && (
        <>
          <span className="text-dim"> · </span>
          <span className="text-ink">{completedMinutes}m / {capacityMinutes}m completed</span>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement `ReviewView.tsx`**

`packages/gui/src/components/ReviewView.tsx`:

```tsx
import { RITUALS, GRAIN_LABEL, PREV_GRAIN, PERIOD_LABEL, type Altitude } from '../lib/grains';
import type { UiTask } from '../lib/api';
import type { PendingChange } from '../lib/staging';
import { TaskCard } from './TaskCard';

interface Props {
  altitude: Altitude;
  done: UiTask[];
  open: UiTask[];
  pending: Record<string, PendingChange>;
  onStage: (c: PendingChange) => void;
  onUnstage: (taskId: string) => void;
}

export function ReviewView({ altitude, done, open, pending, onStage, onUnstage }: Props) {
  const ritual = RITUALS[altitude].review;
  const grain = ritual.grain!;
  const back = PREV_GRAIN[grain];
  const nextLabel = PERIOD_LABEL[altitude].next;

  const snap = (t: UiTask) => ({ file: t.file, line: t.line, text: t.text });

  const defer = (t: UiTask) =>
    onStage({ taskId: t.id, fromGrain: grain, toGrain: grain, toBucket: 'next', kind: 'defer', snapshot: snap(t) });
  const rollback = (t: UiTask) =>
    back && onStage({ taskId: t.id, fromGrain: grain, toGrain: back, toBucket: 'this', kind: 'rollback', snapshot: snap(t) });
  const drop = (t: UiTask) =>
    onStage({ taskId: t.id, fromGrain: grain, toGrain: grain, kind: 'drop', snapshot: snap(t) });

  return (
    <section data-testid="review-view" className="flex flex-col gap-4">
      <div>
        <div className="mb-1.5 text-xs uppercase tracking-wide text-dim" data-testid="review-done">Completed ({done.length})</div>
        <div className="flex flex-col gap-1.5">
          {done.map((t) => <TaskCard key={t.id} task={t} />)}
          {done.length === 0 && <div className="text-xs italic text-dim">nothing completed yet</div>}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-xs uppercase tracking-wide text-dim" data-testid="review-open">Still open ({open.length})</div>
        <div className="flex flex-col gap-1.5">
          {open.map((t) => {
            const staged = !!pending[t.id];
            return (
              <TaskCard
                key={t.id}
                task={t}
                staged={staged}
                actions={
                  staged ? (
                    <button data-testid="review-unstage" onClick={() => onUnstage(t.id)} className="text-dim hover:text-over text-sm">undo</button>
                  ) : (
                    <div className="flex gap-1 text-xs">
                      <button data-testid="review-defer" onClick={() => defer(t)} className="rounded bg-panel2 px-2 py-0.5 text-accent">defer → {nextLabel}</button>
                      {back && <button data-testid="review-rollback" onClick={() => rollback(t)} className="rounded bg-panel2 px-2 py-0.5 text-dim">↑ {GRAIN_LABEL[back]}</button>}
                      <button data-testid="review-drop" onClick={() => drop(t)} className="rounded bg-panel2 px-2 py-0.5 text-over">drop</button>
                    </div>
                  )
                }
              />
            );
          })}
          {open.length === 0 && <div className="text-xs italic text-dim" data-testid="review-clear">all clear ✓</div>}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire Review into `App.tsx`**

In `packages/gui/src/App.tsx`:

(a) Add imports:

```tsx
import { fetchReview } from './lib/api';
import { ReviewView } from './components/ReviewView';
import { RitualSummary } from './components/RitualSummary';
```

(Merge `fetchReview` into the existing `./lib/api` import rather than duplicating the line.)

(b) Add review state + fetch (after the `source` state):

```tsx
  const [review, setReview] = useState<{ done: UiTask[]; open: UiTask[] }>({ done: [], open: [] });
```

```tsx
  useEffect(() => {
    if (posture === 'review' && ritual.grain) void fetchReview(ritual.grain).then(setReview);
  }, [posture, ritual.grain]);
```

(c) Replace the `review-placeholder` block with:

```tsx
          {posture === 'review' && (
            <div className="flex flex-col gap-4">
              <RitualSummary
                altitude={altitude}
                doneCount={review.done.length}
                openCount={review.open.length}
                stagedCount={Object.keys(buffer).length}
              />
              <ReviewView
                altitude={altitude}
                done={review.done}
                open={review.open}
                pending={buffer}
                onStage={onStage}
                onUnstage={onUnstage}
              />
            </div>
          )}
```

- [ ] **Step 4: Build**

Run: `corepack pnpm --filter @caius/gui build`
Expected: PASS.

- [ ] **Step 5: Verify Review flow (Playwright MCP)**

Rebuild + serve against `.testvault` (which has overdue/live tasks). Drive:
- Menu → `menu-day-review` → title **"Daily shutdown"**; expect `ritual-summary`, `review-done`, `review-open` sections.
- On an open card, click `review-defer` → card greys, a `tray-row` reads "Today → Today (next)"; `ritual-summary` staged count increments.
- Click `review-drop` on another → `tray-row` shows "drop" in red.
- Switch to **Weekly review** (`menu-week-review`) → `review-rollback` button reads "↑ Planning Ahead".

Stop the server when done.

- [ ] **Step 6: Commit**

```bash
git add packages/gui/src/App.tsx packages/gui/src/components/ReviewView.tsx packages/gui/src/components/RitualSummary.tsx
git commit -m "gui: Review posture — ReviewView (defer/rollback/drop) + RitualSummary slot"
```

---

## Milestone 4 — Commit (Phase-1 log-only)

### Task 16: `reconcileCommit` (fresh-scan diff, not replay)

**Files:**
- Modify: `packages/api/src/commit.ts`
- Test: `packages/api/test/commit.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/api/test/commit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { IndexedTask, ScanResult } from '@caius/index';
import { reconcileCommit, type CommitChange } from '../src/commit.js';

let rowid = 0;
function task(file: string, line: number, text: string): IndexedTask {
  return {
    rowid: ++rowid, blockId: null, file, line, state: 'open', live: true, text,
    importance: 0, estMinutes: null, due: null, done: null, project: null,
    horizon: 'week', grain: 'week', bucket: 'this', area: null, parentRowid: null,
    tokens: [], derivations: [],
  };
}
function fresh(tasks: IndexedTask[]): ScanResult {
  return { files: [], tasks, flags: [], report: {} as ScanResult['report'] };
}
function change(file: string, line: number, text: string): CommitChange {
  return {
    taskId: `${file}\n${line}`, fromGrain: 'week', toGrain: 'day', toBucket: 'this',
    kind: 'promote', snapshot: { file, line, text },
  };
}

describe('reconcileCommit', () => {
  it('applies a staged change when the live line still matches', () => {
    const r = fresh([task('a.md', 1, 'unchanged')]);
    const out = reconcileCommit(r, [change('a.md', 1, 'unchanged')]);
    expect(out.applied).toHaveLength(1);
    expect(out.conflicts).toHaveLength(0);
  });
  it('flags a conflict when the task is gone from its staged location', () => {
    const r = fresh([task('a.md', 5, 'moved away')]);
    const out = reconcileCommit(r, [change('a.md', 1, 'unchanged')]);
    expect(out.applied).toHaveLength(0);
    expect(out.conflicts[0]!.reason).toMatch(/no longer/i);
  });
  it('flags a conflict when the text changed under the session', () => {
    const r = fresh([task('a.md', 1, 'edited in obsidian')]);
    const out = reconcileCommit(r, [change('a.md', 1, 'original text')]);
    expect(out.applied).toHaveLength(0);
    expect(out.conflicts[0]!.reason).toMatch(/changed/i);
  });
  it('commits the clean subset and keeps only the conflict', () => {
    const r = fresh([task('a.md', 1, 'clean'), task('b.md', 2, 'now different')]);
    const out = reconcileCommit(r, [change('a.md', 1, 'clean'), change('b.md', 2, 'was this')]);
    expect(out.applied.map((c) => c.taskId)).toEqual(['a.md\n1']);
    expect(out.conflicts.map((c) => c.taskId)).toEqual(['b.md\n2']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `corepack pnpm exec vitest run packages/api/test/commit.test.ts`
Expected: FAIL — stub returns empty `applied`/`conflicts`.

- [ ] **Step 3: Implement `reconcileCommit`**

Replace the stub in `packages/api/src/commit.ts` (keep the interfaces; replace the function):

```ts
import type { ScanResult, IndexedTask } from '@caius/index';

export interface CommitChange {
  taskId: string;
  fromGrain: string;
  toGrain: string;
  toBucket?: 'this' | 'next';
  slot?: 'today' | 'tomorrow';
  kind: 'promote' | 'skip' | 'defer' | 'rollback' | 'drop';
  snapshot: { file: string; line: number; text: string };
}

export interface CommitResult {
  applied: CommitChange[];
  conflicts: { taskId: string; reason: string }[];
}

/**
 * Phase-1 commit reconciliation: a diff of the staged intents against a FRESH
 * scan (not a replay). Match by ^id when present, else by the (file,line)
 * surrogate, then compare the staged snapshot. Phase 2 reuses this, then writes.
 */
export function reconcileCommit(fresh: ScanResult, changes: CommitChange[]): CommitResult {
  const applied: CommitChange[] = [];
  const conflicts: { taskId: string; reason: string }[] = [];

  const at = (file: string, line: number): IndexedTask | undefined =>
    fresh.tasks.find((t) => t.file === file && t.line === line);

  for (const c of changes) {
    const live = at(c.snapshot.file, c.snapshot.line);
    if (!live) {
      conflicts.push({ taskId: c.taskId, reason: `task no longer at ${c.snapshot.file}:${c.snapshot.line + 1} (moved or removed)` });
      continue;
    }
    if (live.text !== c.snapshot.text) {
      conflicts.push({ taskId: c.taskId, reason: `task text changed under the session at ${c.snapshot.file}:${c.snapshot.line + 1}` });
      continue;
    }
    applied.push(c);
  }
  return { applied, conflicts };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `corepack pnpm exec vitest run packages/api/test/commit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/commit.ts packages/api/test/commit.test.ts
git commit -m "api: Implement reconcileCommit (fresh-scan diff, conflict detection)"
```

---

### Task 17: `POST /api/commit` integration test + end-to-end commit verification

**Files:**
- Test: `packages/api/test/server.integration.test.ts`

- [ ] **Step 1: Add a commit integration test**

Append inside the `describe('serveCaius (integration)', ...)` block in `packages/api/test/server.integration.test.ts`:

```ts
  it('POST /api/commit reconciles against a fresh scan and writes nothing', async () => {
    // 'Backlog item' is live at 10 - Project/Caius/tasks.md line index 1.
    const ok = {
      taskId: '10 - Project/Caius/tasks.md\n1',
      fromGrain: 'someday', toGrain: 'month', toBucket: 'this', kind: 'promote',
      snapshot: { file: '10 - Project/Caius/tasks.md', line: 1, text: 'Backlog item' },
    };
    const stale = {
      taskId: '10 - Project/Caius/tasks.md\n1',
      fromGrain: 'someday', toGrain: 'month', toBucket: 'this', kind: 'promote',
      snapshot: { file: '10 - Project/Caius/tasks.md', line: 1, text: 'WRONG TEXT' },
    };
    const res = await fetch(server.url + '/api/commit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ changes: [ok] }),
    }).then((r) => r.json());
    expect(res.applied).toHaveLength(1);
    expect(res.conflicts).toHaveLength(0);

    const res2 = await fetch(server.url + '/api/commit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ changes: [stale] }),
    }).then((r) => r.json());
    expect(res2.applied).toHaveLength(0);
    expect(res2.conflicts).toHaveLength(1);

    // No write-back: the summary task counts are unchanged after committing.
    const s = await api('/api/summary');
    expect(s.report.taskCount).toBe(4);
  });

  it('GET /api/review/:grain splits a grain', async () => {
    const r = await api('/api/review/someday');
    expect(Array.isArray(r.done)).toBe(true);
    expect(Array.isArray(r.open)).toBe(true);
  });
```

- [ ] **Step 2: Run to verify it passes**

Run: `corepack pnpm exec vitest run packages/api/test/server.integration.test.ts`
Expected: PASS (commit route already wired in Task 7; `reconcileCommit` real since Task 16).

- [ ] **Step 3: Full test sweep + typecheck**

Run: `corepack pnpm exec tsc -b && corepack pnpm exec vitest run`
Expected: PASS — all packages green.

- [ ] **Step 4: Commit**

```bash
git add packages/api/test/server.integration.test.ts
git commit -m "api: Integration test for commit (clean subset + conflict) and review split"
```

---

### Task 18: End-to-end commit verification (Playwright MCP) + serve hint

**Files:**
- Modify: `packages/cli/src/main.ts` (build-hint on serve)

- [ ] **Step 1: Add a build hint to `caius serve`**

In `packages/cli/src/main.ts`, in the `serve` branch, after the existing two `console.log` lines, add:

```ts
  console.log('  (build the GUI with `pnpm build`; for live UI dev use `pnpm dev:gui`)');
```

- [ ] **Step 2: Build + serve + verify the whole loop (Playwright MCP)**

```bash
corepack pnpm build && node packages/cli/dist/main.js serve .testvault --port 7777 &
```
Drive with Playwright MCP, watching the **server stdout** for the commit log:
- Navigate to `http://localhost:7777` (Daily planning).
- Slot two source cards into Today (`slot-today`), confirm `tray-row` ×2 and `commit-button` enabled.
- Click `commit-button` (label "commit daily planning").
- Expect: server stdout prints `[caius commit] applied 2, conflicts 0` with two `promote … week→day [today]` lines; the tray empties (`tray-empty` visible); the `pipeline-strip` counts are unchanged (no write-back).
- Confirm on disk nothing changed: `git -C .testvault status --porcelain` prints nothing.

Stop the server when done (`kill %1`).

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/main.ts
git commit -m "cli: Print GUI build hint on serve"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- §1 stack/serve → Tasks 6, 7, 18. §2 reframing → App/views. §3 grain/bucket fix → Tasks 1–4. §4 six rituals → grains.ts (Task 8) + views (14, 15). §5 period targeting → bucket toggle (14) + defer (15). §6 skip → SkipMenu (12). §7 chrome → RitualHeader/PipelineStrip (10). §8 buffer+commit → Tasks 11, 16, 17, 18. §9 summaries → RitualSummary (15, counts-only). §10 API → Tasks 5, 7, 16, 17. §11 engine changes → Tasks 1–5, 7. §12 GUI layout → all gui tasks. §13 milestones → the four milestones. §14 §11 resolutions → surrogate id (api.ts/staging.ts), tomorrow derived (toUiTask slot), conflicts keep-staged (App.onCommit + reconcileCommit). §15 tests → unit + Playwright per milestone. §16 non-goals → no write-back (commit logs only).
- **Deliberately scoped to Phase-1.1 fast-follow (logged, not silently dropped):** a full Explain panel and a Flags panel (endpoints stay; only ambient `now`/`overdue` counts + flags reachable via `/api/flags`); deep Overdue inbound triage UX (surfaced as a count now); the narrative summary (counts only per spec §9).

**Placeholder scan:** No TBD/TODO/dead code left; every code step ships complete, referenced code.

**Type consistency:** `Grain`/`Bucket` (resolve) ↔ `Grain` (grains.ts, parity-tested Task 8). `PendingChange` (staging.ts) mirrors `CommitChange` (commit.ts) field-for-field. `UiTask`/`ApiTask` defined once (api.ts) and used by all views. `reconcileCommit`/`CommitResult` names match between `commit.ts`, `staging.ts`, and `server.ts`. `fetchTasksAtGrain`/`fetchReview`/`fetchFunnel`/`fetchSummary`/`fetchOverdue` names match between `api.ts` and `App.tsx`.

## Non-Goals (Phase 1)
- No write-back: `commit()` logs the intended diff; disk is untouched (verified Task 18).
- No `^id` minting (surrogate `(file,line)` keys; Phase 2 mints).
- No narrative summaries, no `area` axis, no recurrence, no YAML config.
