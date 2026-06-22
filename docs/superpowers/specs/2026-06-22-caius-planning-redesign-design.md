---
title: Caius — Planning surface redesign (nav, grouped source, horizon buckets, drag-drop)
status: draft
date: 2026-06-22
builds_on: "2026-06-17-caius-ritual-gui-design.md (ritual GUI)"
supersedes: "ritual-GUI spec §navigation (6 rituals) and §staging-buffer (single tray)"
target_vault: /home/shawn/documents/obsidian/Main
---

# Caius — Planning surface redesign

Reshape the planning GUI from six discrete rituals + a single staging tray into **one
Plan board**: a grain dropdown + Plan/Review toggle, a grouped/collapsible source list with
file labels, three horizon buckets (**Planned / Orbit / Today**), and **drag-and-drop** as
the single way tasks move. **GUI-only** — no engine or API changes; it reuses the existing
`/api/tasks`, `/api/commit`, `/api/review`, `/api/funnel` endpoints and the existing staging
buffer + log-only commit seam.

## 0. Decisions (locked in brainstorming)

- **Navigation = model B.** A **grain dropdown** (Month / Week / Day) + a **Plan | Review**
  segmented toggle. Default posture = **Plan**, default grain = **Day**. **Review is its own
  full-area page** reached by the toggle (no side-by-side split). Focus stays a separate
  top-level mode (its own header switch; not built here — see the focus-writeback spec).
- **Three absolute buckets, always shown: Planned (month) / Orbit (week) / Today (day).**
  They replace the single "Staging buffer" tray. Each shows the tasks currently resolved to
  that grain (this-period) plus anything staged into it (staged items marked pending).
- **Source = the Someday backlog** (`grain=someday`, live) — the triage pool — grouped and
  collapsible (see §2). Funnel transitions (pull month→week→day) happen by **dragging
  bucket→bucket**, so a fixed three-bucket layout still expresses the whole funnel.
- **Emphasis follows the dropdown grain.** The selected grain's bucket is rendered **large +
  highlighted**; the other two are **minimized** at rest. **No "Recommended" label text.**
- **Drag-and-drop replaces every click-to-stage.** Grip-handle cards drag between Source and
  any bucket, and between buckets. **Drop zones appear only during a drag, on every bucket**
  (the minimized ones expand to a comfortable target). Dropping onto Source un-stages / defers
  to Someday.
- **Skip-ahead and "skip" replace the SkipMenu.** Dragging a Someday card straight onto Today
  (rather than Planned) is a skip-ahead; the old `SkipMenu` component is removed.

### Open questions for your spec review

1. **Bucket set per grain.** Recommended: always show all three buckets regardless of grain
   (only emphasis changes). Alternative: show only the selected grain's bucket + finer ones
   (Month=3, Week=2, Day=1), matching the strict funnel. Going with **always three**.
2. **Drag-drop library.** Recommended: add **`@dnd-kit/core` + `@dnd-kit/sortable`** (a new
   runtime dep — accessible, touch + keyboard, smooth) over hand-rolled pointer events.
3. **"Tomorrow."** The old Day view had a Tomorrow column. Folded into the Today bucket as a
   `this`/`next` sub-target (drop on the bucket's "tomorrow" affordance), not a 4th bucket.

## 1. Navigation (model B)

`RitualHeader` becomes `PlanHeader`:

- **Grain dropdown** — `Month / Week / Day`, driving the existing `altitude` state. Replaces
  the 6-item title dropdown.
- **`Plan | Review` segmented toggle** — already present in the header (`posture-toggle`);
  keep it, restyle. Drives `posture`.
- Right side: a **Focus** link (top-level mode switch; inert placeholder until the
  focus-writeback spec is built) and the **theme toggle** (already shipped).
- The funnel context strip (`PipelineStrip`) stays as an ambient header row.

State stays exactly `{ altitude, posture }` from `grains.ts` (`RITUALS[altitude][posture]`).
The dropdown sets `altitude`; the toggle sets `posture`. No new top-level state except UI
(collapsed groups, drag state).

## 2. Source list — grouped, collapsible, file-labeled

The Plan board's left region. Source = Someday backlog (`fetchTasksAtGrain('someday')`,
already live-filtered).

- **Tasks with a project** → grouped under a **collapsible project header** (`📁 <project>`).
- **Tasks without a project** → grouped under a **collapsible document-title header**
  (`📄 <title>`), where `title` = the note's basename without `.md`
  (e.g. `20 - Area/Health.md` → "Health"; `…/2026-06-20.md` → "2026-06-20").
- **File label (requirement 1).** Every **non-project** task shows its **vault-relative file
  path** as a chip. In the Source it's carried by the document-title group header (no per-card
  chip needed); in **buckets and the Review page** (flat lists) the chip rides on the card.
  Project tasks need no file chip (the project header identifies them).
- Collapsed/expanded state persists in `localStorage` keyed by group id.
- A new pure helper `groupSource(tasks): { kind: 'project'|'document', key, title, tasks }[]`
  (project groups first, then document groups; each alpha-sorted) — replaces the inline
  `groupByProject` in `PlanView`. Unit-tested.

## 3. Horizon buckets (Planned / Orbit / Today)

Three buckets, fixed order, labels from `GRAIN_LABEL` (month→"Planned" rename, week→"Orbit",
day→"Today"). Replaces `PendingTray`.

- **Contents** = tasks currently at that grain & `bucket==='this'`
  (`fetchTasksAtGrain(grain,'this')`) **∪** tasks staged into it (from the staging buffer).
  Staged-but-uncommitted cards are visually marked (dashed/accent) until Commit.
- **Emphasis** = the dropdown's grain → that bucket is large + highlighted; the other two are
  minimized strips. **No label text** announces it.
- **Today bucket** keeps the Day view's capacity meter (Σ `estMinutes` vs `capacityMinutes`,
  over-cap in `--over`), and exposes a **"→ tomorrow"** drop affordance (`bucket:'next'`).
- A single **Commit** button sits under the buckets; it applies the whole staging buffer via
  the existing `commit()` (still **log-only** this phase). Conflicts render inline as today.

## 4. Drag-and-drop interaction

Using `@dnd-kit` (pending decision 0.2). Each task is a draggable; Source groups and the
three buckets are droppables.

- **At rest:** no drop zones; buckets sized per emphasis.
- **On drag start:** every bucket reveals a drop zone and the minimized buckets expand to a
  comfortable target; the dragged card lifts (shadow + slight rotate).
- **Drop on a bucket** → `onStage` a `PendingChange` with `toGrain` = that bucket's grain
  (`toBucket:'this'`, or `'next'` for the tomorrow affordance), `kind:'promote'`. Drop on a
  *finer-than-default* bucket is the skip-ahead path (no separate menu).
- **Drop between buckets** → re-stage with the new `toGrain` (the funnel pull, e.g.
  Planned→Orbit).
- **Drop on Source** → `onUnstage` if staged, else stage a defer (`kind:'defer'`, toGrain =
  someday).
- Keyboard drag (dnd-kit's keyboard sensor) for accessibility.

The `PendingChange` shape is unchanged; `stagingReducer`/`commit` are reused as-is. Drag is a
new way to dispatch the same `stage`/`unstage` actions `App.tsx` already wires.

## 5. Review page

Reached by the `Plan | Review` toggle; fills the board area (full width). Largely the existing
`ReviewView` (`done` / `open` split for the grain, `defer` / `rollback` / `drop` actions),
with two changes:

- **File chips** on non-project rows (requirement 1, consistent with buckets).
- (Optional, secondary) slipped/open rows are draggable back into a bucket to re-plan; if cut
  for scope, the existing defer/rollback buttons remain.

## 6. Components & files

```
packages/gui/src/
  App.tsx                  compose PlanHeader + PipelineStrip + PlanBoard / ReviewView;
                           hold collapsed-groups + drag state                     (modify)
  components/
    PlanHeader.tsx         grain dropdown + Plan|Review toggle + Focus + theme   (rename/rework RitualHeader)
    PlanBoard.tsx          Source (grouped) + three buckets + DnD context         (new — replaces PlanView + DayPlanView)
    SourceGroup.tsx        one collapsible project/document group                 (new)
    HorizonBucket.tsx      one bucket (emphasis, drop zone, capacity meter)       (new)
    TaskCard.tsx           add drag handle + file chip; keep edit-affordance hook (modify)
    ReviewView.tsx         file chips on non-project rows                         (modify)
    PendingTray.tsx        DELETE (buckets + Commit replace it)
    SkipMenu.tsx           DELETE (drag-to-bucket replaces it)
    DayPlanView.tsx        DELETE (folded into PlanBoard; capacity meter moves to Today bucket)
    PlanView.tsx           DELETE (folded into PlanBoard)
  lib/
    grouping.ts            groupSource() pure helper + types                       (new)
    grains.ts              keep; maybe a BUCKETS = [month,week,day] export         (modify)
    staging.ts             unchanged (reused)
    api.ts                 unchanged (reused; add fetchSomeday convenience if useful)
```

## 7. Data / API

**No server changes.** All data already available:
- Source: `GET /api/tasks?grain=someday&live=true`.
- Buckets: `GET /api/tasks?grain={month|week|day}&bucket=this&live=true`.
- Commit: `POST /api/commit` (log-only).
- Review: `GET /api/review/{grain}?period=this`; funnel: `GET /api/funnel`.

## 8. Milestones

1. **Nav + scaffold** — `PlanHeader` (grain dropdown + toggle); `App` swaps PlanView/DayPlanView
   for an empty `PlanBoard`; delete dead ritual chrome. Existing tests green.
2. **Grouped source** — `grouping.ts` + `SourceGroup` (collapsible, persisted); file chips on
   `TaskCard`; `groupSource` unit tests.
3. **Buckets (no DnD yet)** — `HorizonBucket` ×3 with emphasis + capacity meter; contents =
   current membership ∪ staged; Commit button; remove `PendingTray`. Click-stage kept
   temporarily so it's usable mid-build.
4. **Drag-and-drop** — add `@dnd-kit`; wire drag→stage/unstage across Source↔buckets and
   bucket↔bucket; drop zones on drag only; remove `SkipMenu` and the interim click-stage.
5. **Review page** — toggle to full-area `ReviewView` + file chips (+ optional drag-back).

## 9. Testing

- **Unit:** `groupSource` (project-first ordering, document-title derivation, alpha sort);
  document-title basename derivation; emphasis selection by grain.
- **Component/interaction (Playwright):** collapse/expand persists; drag a Source card into
  each bucket → it appears staged + buffer count rises; drag bucket→bucket re-targets; drag
  back to Source un-stages; drop zones appear only during drag and on every bucket; Commit
  posts the buffer and clears the clean subset (existing behavior); Plan↔Review toggle swaps
  the area; file chips present on non-project cards.
- **Keep green:** all 195 existing tests; `grains.test.ts` engine-parity unchanged.

## 10. Non-goals / relationship to other specs

- **Supersedes** the ritual-GUI spec's six-ritual navigation and single staging-buffer tray.
- **No write-back here** — commit stays log-only; the Focus + in-place write spec
  (`2026-06-18-caius-focus-writeback-design.md`) is unchanged and still unbuilt. This redesign
  only adds the inert Focus header slot it will later occupy.
- No new task **capture/quick-add** surface (you noted wanting "add … current tasks" — that's
  not specced anywhere yet; out of scope here, candidate for its own spec).
- No engine/API/grammar changes.
