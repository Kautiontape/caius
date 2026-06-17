---
title: Caius — Ritual Planning GUI (implementation spec)
status: approved
date: 2026-06-17
supersedes: "2026-06-17-caius-phase1-design.md §10 (GUI); reframes §9 (API)"
reconciles: "source design 2026-06-17-caius-ritual-gui-design.md (the UX narrative)"
target_vault: /home/shawn/documents/obsidian/Main
---

# Caius — Ritual Planning GUI (implementation spec)

This is the **repo-committed, implementation-reconciled** successor to the source
ritual-GUI design. It keeps that document's UX intent and adds the concrete
engineering decisions resolved in brainstorming: the frontend stack, the
grain/bucket engine fix, exact API contracts, the buffer/commit reconciliation,
and what gets deleted.

## 0. What stays, what changes, what dies

**Stays (authoritative, unchanged):** the engine — grammar/parser (`core`),
resolution (`resolve`), indexer + SQLite + reconciliation (`index`), watcher
(`watch`). The parser/resolver/index are the foundation this surface sits on.

**Changes:** the GUI is reframed from a read-only dashboard into a **planning
instrument**. The unit of work is a deliberate planning *ritual* that produces a
committed plan. The read-only funnel/day-plan/explain/flags become **inputs and
ambient context** to the rituals, not the product.

**Dies (kill-your-darlings — confirmed):**
- `packages/api/src/gui.ts` (the inlined read-only dashboard page) is **deleted**.
  The surface is rebuilt from scratch as a React app in a new `packages/gui`.
- Any endpoint with **no consumer** in the new surface is pruned (see §10).
- There is no settings page or stored user config to preserve; config remains
  baked TS (`packages/resolve/src/config.ts`).

**Phase boundary:** still a **Phase-1 surface — no write-back**. The staging
buffer and commit flow are fully built, but in Phase 1 **commit is a no-op that
logs the intended diff** (it does not touch disk). The same `commit()` code path
becomes the Phase-2 write-back (tombstones + `from:` pointers). The buffer is the
seam between the two phases; the interface should *feel* complete now.

---

## 1. Stack & build/serve (confirmed decision)

**New `packages/gui`** — Vite + React 18 + TypeScript + Tailwind. This is a
deliberate departure from the current zero-dep, no-bundler, inlined GUI, chosen
because the ritual surface (staging buffer, six views, dropdowns, slotting) earns
a real component model.

- **Build:** `vite build` → `packages/gui/dist`. `pnpm build` gains a gui build
  step after `tsc -b`.
- **Serve:** `serveCaius` serves the built static assets from `packages/gui/dist`
  at `/`; `/api/*` is unchanged. If `dist` is missing, `caius serve` prints a
  clear "run `pnpm build` first" message (and still serves the API).
- **Dev:** `vite dev` (in `packages/gui`) with a proxy from `/api` → a running
  `caius serve` (default :7777). This is the inner-loop DX; production is
  build-then-serve.
- **Considered and rejected:** `vite-plugin-singlefile` to inline the bundle and
  preserve today's "ships in dist, no asset paths" property. Not used now; it is a
  one-plugin swap if the single-artifact property is wanted later.

`packages/gui` may import **type-only** from `@caius/index` / `@caius/resolve`
where convenient, but the wire contract is plain HTTP/JSON (`lib/api.ts`). The
dependency graph stays downward: `core → resolve → index/watch → api → {cli, gui}`.

---

## 2. The core reframing (UX intent)

Two principles drive every screen:

1. **Altitude is a noun; ritual is a verb. Surface the verbs.** The user never
   "navigates to the week"; they *do weekly planning*. Altitude (grain) is shown
   as context, never as primary navigation.
2. **Work flows down the funnel, one grain at a time, into the current or next
   period only.** You cannot plan arbitrarily far ahead. The period bound is a
   structural guard, not a guideline.

---

## 3. The pipeline + the grain/bucket fix (load-bearing)

The engine speaks **grains**; the GUI speaks **Marvin labels**. `lib/grains.ts`
is the GUI's single source of truth for the mapping.

| Engine grain | GUI label       | Period bound (the rule)             | Pulls from     | Pushes to |
|--------------|-----------------|-------------------------------------|----------------|-----------|
| `someday`    | Someday         | unbounded master list               | —              | month     |
| `month`      | Planning Ahead  | this month **or** next month        | Someday        | week      |
| `week`       | Orbit           | this week **or** next week          | Planning Ahead | day       |
| `day`        | Today / Tomorrow| today or tomorrow                   | Orbit          | (terminal)|

### 3.1 Why `horizon` alone is insufficient (the §5 "reconcile before coding")

The engine's `horizon` string is **lossy** for the grain model:
- `orbit` = (current **month**) ∪ (future **week**)
- `week` = (current **week**) ∪ (next/future **daily** note)

So grain + this/next **bucket cannot be derived from the `horizon` string**. They
require the periodic **granularity** (which folder) and **relation** (period vs
now) — which `resolveHorizon` already computes and then discards into a label.

### 3.2 Fix: emit a structured `{ grain, bucket }` from `resolve`

`resolveHorizon` is extended to *additionally* return `grain` and `bucket`,
derived from the same granularity + relation it already has. **Non-breaking:** the
`horizon` value and its provenance string are untouched; we only add fields.

```ts
// packages/resolve/src/types.ts (additions)
export type Grain  = 'someday' | 'month' | 'week' | 'day';
export type Bucket = 'past' | 'this' | 'next' | 'future';
```

The complete physical-location → classification mapping (this is the contract):

| Physical location        | relation | `horizon` (legacy) | `grain`  | `bucket` |
|--------------------------|----------|--------------------|----------|----------|
| `02 - Periodic/Daily`    | past     | overdue            | day      | past     |
| `02 - Periodic/Daily`    | current  | today              | day      | this     |
| `02 - Periodic/Daily`    | next     | week               | day      | next     |
| `02 - Periodic/Daily`    | >next    | week               | day      | future   |
| `02 - Periodic/Weekly`   | past     | overdue            | week     | past     |
| `02 - Periodic/Weekly`   | current  | week               | week     | this     |
| `02 - Periodic/Weekly`   | next     | orbit              | week     | next     |
| `02 - Periodic/Weekly`   | >next    | orbit              | week     | future   |
| `02 - Periodic/Monthly`  | past     | overdue            | month    | past     |
| `02 - Periodic/Monthly`  | current  | orbit              | month    | this     |
| `02 - Periodic/Monthly`  | next     | planning_ahead     | month    | next     |
| `02 - Periodic/Monthly`  | >next    | planning_ahead     | month    | future   |
| `10 - Project/**`        | —        | someday            | someday  | null     |
| `20 - Area/**`           | —        | someday            | someday  | null     |
| default                  | —        | someday            | someday  | null     |

### 3.3 The `bucket` refinement (`period.ts`)

The existing `classifyPeriod` returns a 3-way `past | current | future` (still
used by the legacy horizon `by_date` lookup — leave it). Add a 4-way refinement
that distinguishes the **next** bucket from anything beyond it:

```ts
// packages/resolve/src/period.ts (addition)
// 'next' = exactly the period after now (tomorrow / next ISO week / next month).
// Computed by advancing a real Date and re-keying, so year/week rollovers
// (2026-W52 → 2027-W01, 2026-12 → 2027-01) are correct — never naive key+1.
export function periodBucket(
  granularity: PeriodGranularity, leaf: string, now: Date,
): Bucket | null;
```

`day` next = `now + 1 day`; `isoweek` next = `now + 7 days` re-keyed; `month` next
= month+1 with year rollover. Beyond next ⇒ `future`; before now ⇒ `past`; equal
⇒ `this`.

### 3.4 Cross-cutting lanes (not grains, not promotion targets)

- **`overdue`** = live tasks with `bucket === 'past'` (any periodic grain).
  Surfaced in rituals as a flagged **inbound source** ("these slipped"), never a
  promotion *destination*.
- **`now`** = the derived view of `in_progress` (`[/]`) tasks, any location.

The period bound governs what a **ritual will let you promote into**, not what the
engine indexes. A task stranded in a March daily note is still indexed and shows
in Overdue; it just can't be a promotion target.

---

## 4. The six rituals

Three altitudes × two postures. **Plan** winds up (pull a grain finer); **Review**
winds down (audit what the period held, re-decide leftovers).

| Altitude | Plan (wind-up)                                  | Review (wind-down)                              |
|----------|-------------------------------------------------|-------------------------------------------------|
| Month    | **Monthly planning** — Someday → Planning Ahead | **Monthly review** — audit Planning Ahead       |
| Week     | **Weekly planning** — Planning Ahead → Orbit    | **Weekly review** — audit Orbit                 |
| Day      | **Daily planning** — Orbit → Today/Tomorrow     | **Daily shutdown** — audit Today                |

The day-grain Review keeps the name **"Daily shutdown"**; its siblings are
"Weekly/Monthly review". Pill labels stay generic **Plan / Review**; the header
title carries the full ritual name.

**Review is the roll-forward ritual** Phase-0 asked for: incomplete work
re-surfaces for a deliberate re-decision rather than silently migrating. Every
leftover gets an explicit destination; nothing moves on its own.

### Posture mechanics

- **Plan** shows the *coarser* source grain's tasks, each with a one-grain promote
  action (or a destination menu to skip — §6).
- **Review** shows the *current* grain's tasks split into **done** and **still
  open**. Each open leftover offers three destinations:
  1. **Defer** to next period (stays at this grain, next bucket) — `kind: 'defer'`
  2. **Roll back** up one grain — `kind: 'rollback'`
  3. **Drop** (cancel, `[-]`) — `kind: 'drop'`

---

## 5. Period targeting (this / next)

Both directions are period-bounded to **this or next bucket of the grain**:

| Grain | Plan target toggle      | Review "defer" default |
|-------|-------------------------|------------------------|
| month | this month / next month | next month             |
| week  | this week / next week   | next week              |
| day   | today / tomorrow        | tomorrow               |

One mechanism, two directions. Plan's toggle picks which bucket you're filling;
Review's defer sends leftovers to the *next* bucket. The ritual layer refuses to
offer any target beyond `next` (enforced using `grain`/`bucket`, §3).

---

## 6. Skip-a-grain (deliberate, never default)

Work normally advances exactly one grain. Skipping is allowed ("it's our vault")
but must be deliberate:
- The **primary** promote button advances exactly one grain (default `next`).
- A secondary **destination menu** (`⋯` per task) lists every grain finer than the
  current one. Picking a grain beyond the default is tagged **`(skip)`** in the
  staging tray so the transgression is visible in the diff before commit.

---

## 7. Navigation (Option B chrome)

- **Big ritual title, upper-left**, with a chevron → dropdown of all six rituals
  **grouped by altitude** (Month / Week / Day, each showing Plan + Review). The
  occasional "change altitude" move.
- **Universal Plan ⇄ Review pill** next to the title — flips posture at the current
  altitude in one click. Works at every altitude; Review tints amber.
- **Pipeline strip** below the header: the four grains under their Marvin labels,
  lighting the `from`/`into` of the current ritual. Altitude as context, not
  navigation. Shows ambient live counts per grain (+ Overdue / Now lanes).

---

## 8. Staging buffer + commit (the architecture)

### 8.1 Why a buffer

Every ritual action (promote/skip/defer/rollback/drop/slot) **mutates an
in-memory staging buffer, not the vault**:
1. **Collision safety** — nothing touches disk mid-session, so the one-live-line
   invariant and `^id` reconciliation can't be violated by a half-finished plan.
2. **It feels good now** — drags/clicks are instant, reversible, zero-latency.
3. **Clean phase seam** — Phase 1 `commit()` reconciles + logs; Phase 2 the same
   `commit()` also writes. The buffer is the boundary.

### 8.2 Commit is a diff against a fresh scan, NOT a replay

The vault may change under the session (the user edits a note in Obsidian
mid-ritual). `POST /api/commit` must:
1. Trigger a **fresh `scanVault`** (new `ScanResult`).
2. **Reconcile** each staged intent against current disk: match by `^id` when
   present, else by the `(file,line)` surrogate; compare the staged **snapshot**
   (captured task text) against the fresh task.
3. **Flag conflicts** — staged task gone, moved line, changed text, or a new
   second live line — surfaced, never auto-resolved.
4. **Phase 1:** log the intended diff for the non-conflicting set; write nothing.
   **Phase 2:** write tombstones + `from:` pointers for `applied`.

### 8.3 Buffer shape

```ts
// packages/gui/src/lib/staging.ts — one staged intent per task; absence = unchanged.
export type ChangeKind = 'promote' | 'skip' | 'defer' | 'rollback' | 'drop';

export interface PendingChange {
  taskId: string;            // (file,line) surrogate now; minted ^id at Phase-2 commit
  fromGrain: Grain;
  toGrain: Grain;            // destination grain ('drop' keeps fromGrain)
  toBucket?: 'this' | 'next';// which period bucket (period targeting, §5)
  slot?: 'today' | 'tomorrow'; // only when toGrain === 'day'
  kind: ChangeKind;
  snapshot: { file: string; line: number; text: string }; // for commit reconciliation
}
export type StagingBuffer = Record<string /*taskId*/, PendingChange>;
```

> Refinements over the source doc's shape: `toBucket` (period targeting needs it)
> and `snapshot` (commit-as-diff needs a pre-image to detect drift). `taskId` is
> the **temporary** `(file,line)` surrogate; it becomes a minted `^id` in Phase 2.

Reducer: `stage` / `unstage` / `clear` (pure). `commit()` POSTs the buffer to
`/api/commit` and returns `{ applied, conflicts }`.

---

## 9. Summaries (reserved slot, altitude-aware)

Summaries appear at the **close of a ritual** (the human-readable form of the
commit diff), not mid-ritual. Reserve the slot now; content is deferred:
- **Day grain:** time-centric — "3 done, 2 deferred, 3h 45m completed of 8h."
- **Week / Month grain:** throughput + project spread — "8 committed, 5 done, 3
  slipped; Growth cleared, ZeroedIn has 2 carrying over." Do **not** copy the
  day's time-summary upward.

Phase 1 renders **counts only**; the narrative summary is a later task.

---

## 10. API (reframed §9)

**Kept** (consumers in the new surface):
- `GET /api/tasks?grain=&project=&live=&state=` — primary Plan loader. Extend
  `filterTasks` to accept `grain` (keep `horizon` for back-compat). Responses
  include the new `grain` / `bucket` fields.
- `GET /api/funnel` — reframed as **ambient context**: extend the response with
  `byGrain: Record<Grain, number>` (live counts) for the pipeline strip. The
  legacy `overdue` horizon lane and the `now` lane stay as-is. (The Overdue
  inbound source for rituals is derived by filtering tasks where `bucket==='past'`.)
- `GET /api/explain?rowid=|blockId=` — secondary panel (provenance, now incl. the
  grain derivation).
- `GET /api/flags` — secondary panel; also the home for commit conflicts.
- `GET /api/summary` — header stats (vault, file/task/live counts) **plus
  `capacityMinutes`** (`config.capacity.workday_minutes`), consumed by
  `DayPlanView`'s capacity bar.

**Added:**
- `GET /api/review/:grain?period=this|next` — tasks at a grain split into
  `{ done, open }` for a Review view.
- `POST /api/commit` — body = `StagingBuffer`. Triggers a fresh scan, reconciles
  by `^id` else `(file,line)` + snapshot, returns
  `{ applied: PendingChange[], conflicts: { taskId, reason }[] }`. **Phase 1
  writes nothing**; logs the intended diff. The GUI treats the response
  identically in both phases (show applied, surface conflicts).

**Pruned:** `GET /api/day-plan` as a standalone endpoint is **removed** — its job
(today's live tasks + capacity) is absorbed by `DayPlanView`, which composes from
`/api/tasks?grain=day` plus `capacityMinutes` from `/api/summary`. Its
capacity-bar math moves into the GUI.

---

## 11. Engine changes (concrete)

1. `packages/resolve/src/types.ts` — add `Grain`, `Bucket` types (§3.2).
2. `packages/resolve/src/period.ts` — add `periodBucket()` (4-way, §3.3).
3. `packages/resolve/src/horizon.ts` — `resolveHorizon` returns
   `Derived & { grain: Grain | null; bucket: Bucket | null }` (single pass; reuses
   the granularity/relation it already computes). Static/default rules ⇒
   `grain` from the mapped horizon (`someday`), `bucket: null`.
4. `packages/index/src/scan.ts` — `IndexedTask` gains `grain: Grain | null` and
   `bucket: Bucket | null`; populate from the extended horizon result; push a
   `grain` derivation for explainability.
5. `packages/api` — `query.ts` (`grain` filter, `byGrain` in funnel, `review`
   split, `commit` reconciliation), `server.ts` (route `/api/review/:grain`,
   `POST /api/commit`, serve `packages/gui/dist`, drop `/api/day-plan` + the
   `gui.ts` import), delete `gui.ts`.

The GUI's `lib/grains.ts` mirrors the `Grain` strings; they MUST match the engine
values exactly (`someday|month|week|day`). A unit test asserts parity.

---

## 12. GUI package layout & components (§10 contract)

```
packages/gui/
  index.html, vite.config.ts, tailwind.config.js, package.json, tsconfig.json
  src/
    main.tsx, App.tsx        ritual state, buffer, data fetch
    lib/
      grains.ts              grain↔label↔period + ritual table (source of truth)
      staging.ts             buffer reducer: stage/unstage/clear + commit()
      api.ts                 typed fetch wrappers; IndexedTask→UiTask at the seam
    components/
      RitualHeader.tsx       title + grouped dropdown + Plan/Review pill
      PipelineStrip.tsx      four-grain context strip + ambient counts
      PlanView.tsx           wind-up: grouped source list + promote/skip
      DayPlanView.tsx        day-grain 3-col special case (Orbit→Today/Tomorrow) + capacity bar
      ReviewView.tsx         wind-down: done/open split + defer/rollback/drop
      TaskCard.tsx           shared card (importance, estimate, project, in-progress, staged opacity)
      SkipMenu.tsx           ⋯ destination menu; beyond-default tagged (skip)
      PendingTray.tsx        staged-change diffs + per-row undo + commit button
      RitualSummary.tsx      reserved slot (altitude-aware; counts only for now)
```

`UiTask` (the GUI's view of `IndexedTask`): `{ id, text, project, grain, bucket,
slot, estMinutes, importance, inProgress, done }`, mapped in `lib/api.ts`.

`RITUALS`, `GRAIN_LABEL`, `PIPELINE`, `NEXT_GRAIN`, `PREV_GRAIN`, `PERIOD_LABEL`
per the source doc's §10.1 (carried verbatim into `lib/grains.ts`).

---

## 13. Milestones

1. **Foundations** — engine grain/bucket (§11.1–11.4); `gui` scaffold (Vite +
   React + Tailwind) + build/serve wiring + `/api/tasks?grain=`; `lib/grains.ts`;
   App shell + `RitualHeader` + `PipelineStrip`. Delete `gui.ts` + `/api/day-plan`.
2. **Plan posture** — `staging.ts` reducer, `PlanView`, `TaskCard`, `SkipMenu`,
   `PendingTray`, `DayPlanView` (capacity bar). Wire all three Plan rituals.
3. **Review posture** — `ReviewView`, `GET /api/review/:grain`,
   defer/rollback/drop; `RitualSummary` reserved slot (counts).
4. **Commit** — `POST /api/commit` (fresh scan + reconcile + conflicts, log-only);
   conflict handling + the labelled commit button in `PendingTray`.

---

## 14. §11 open-item resolutions (adopted)

1. **Surrogate id** = `(file,line)`, explicitly **temporary**; mint a vault-unique
   `^id` on commit in Phase 2 (avoiding the 2,060 legacy note-scoped anchors).
2. **"Tomorrow"** is a **derived** view (the next daily note), not a stored field —
   consistent with "horizon is where the live line physically is."
3. **Commit conflicts** → **commit the clean subset, keep conflicts staged** for
   re-decision (matches the non-destructive ethos).

---

## 15. Test strategy

- **vitest:** `lib/grains` (label/period mapping; engine-parity assertion),
  `staging` reducer (stage/unstage/clear), `period.periodBucket` (rollovers),
  `resolveHorizon` grain/bucket table (§3.2), and the new API
  (`grain` filter, `byGrain`, `review` split, `commit` reconcile incl. conflict
  cases) via server integration.
- **Playwright** (mirroring the existing `data-testid` approach): ritual dropdown
  switches altitude; Plan/Review pill flips posture; staging an action greys the
  card and adds a tray row; commit logs the diff and clears the clean subset;
  conflict rows remain staged.

---

## 16. Non-goals / phase seam

- **No write-back** in Phase 1. `commit()` reconciles + logs; it does not write.
- No `^id` minting yet (surrogate keys; Phase 2 mints).
- No narrative summaries (counts only).
- No `area` axis, no YAML config loader, no recurrence (all still deferred).
- The same `commit()` path + buffer is the Phase-2 seam: "make commit write"
  rather than "design the planning UX."
