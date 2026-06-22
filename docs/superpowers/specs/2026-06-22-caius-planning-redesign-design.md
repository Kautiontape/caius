---
title: Caius — Planning redesign + Focus & in-place write-back
status: draft
date: 2026-06-22
builds_on: "2026-06-17-caius-ritual-gui-design.md (ritual GUI), 2026-06-17-caius-phase1-design.md (engine)"
supersedes: "ritual-GUI §navigation (6 rituals) + §staging-buffer (single tray); absorbs 2026-06-18-caius-focus-writeback-design.md"
target_vault: /home/shawn/documents/obsidian/Main
---

# Caius — Planning redesign + Focus & in-place write-back

Two phases under one design:

- **Phase A — Planning surface redesign** (GUI-only, no disk writes). Replace six rituals +
  a single staging tray with one **Plan board**: grain dropdown + Plan/Review toggle, a
  grouped/collapsible source with file labels, three horizon buckets (**Planned / Orbit /
  Today**), and **drag-and-drop** as the only way tasks move.
- **Phase B — Focus & in-place write-back** (folded in from the 2026-06-18 focus spec). The
  **doing/editing** layer: a **Focus** mode for today with live check-off / in-progress /
  archive, a Sunsama-style shutdown calculator, and an **edit modal** — all powered by
  Caius's **first real write-back** to the vault.

The two phases ship in order (A is lower-risk and unblocks daily use; B introduces disk
writes). The implementation will likely be **two plans** (one per phase) sharing this spec.

---

# Phase A — Planning surface redesign

## A0. Decisions (locked in brainstorming)

- **Navigation = model B.** A **grain dropdown** (Month / Week / Day) + a **Plan | Review**
  segmented toggle. Default posture = **Plan**, default grain = **Day**. **Review is its own
  full-area page** reached by the toggle (no side-by-side split).
- **Three absolute buckets, always shown: Planned (month) / Orbit (week) / Today (day).**
  They replace the single staging tray. Each shows tasks currently at that grain (this-period)
  plus anything staged into it (staged items marked pending).
- **Source = the Someday backlog** (`grain=someday`, live), grouped + collapsible (§A2). Funnel
  transitions (pull month→week→day) happen by **dragging bucket→bucket**, so a fixed
  three-bucket layout still expresses the whole funnel.
- **Emphasis follows the dropdown grain** — the selected grain's bucket is large + highlighted;
  the other two minimized. **No "Recommended" label text.**
- **Drag-and-drop replaces every click-to-stage.** Drop zones appear **only during a drag, on
  every bucket** (minimized ones expand). Dropping onto Source un-stages / defers to Someday.
  The old `SkipMenu` is removed (skip-ahead = dragging straight to a finer bucket).

## A1. Navigation (model B)

`RitualHeader` → `PlanHeader`: a **grain dropdown** (drives `altitude`), the existing
**`Plan | Review` toggle** (drives `posture`, restyled), a **Focus** switch (top-level mode —
becomes live in Phase B), and the shipped **theme toggle**. `PipelineStrip` stays as an
ambient funnel row. State stays `{ altitude, posture }` from `grains.ts`, plus a top-level
`mode: 'plan' | 'focus'` introduced for Phase B.

## A2. Source list — grouped, collapsible, file-labeled

Left region of the board. Source = Someday backlog (`fetchTasksAtGrain('someday')`).

- **Project tasks** → collapsible **`📁 <project>`** group.
- **Project-less tasks** → collapsible **`📄 <title>`** group, `title` = note basename without
  `.md` (`20 - Area/Health.md` → "Health"; `…/2026-06-20.md` → "2026-06-20").
- **File label (requirement 1):** every **non-project** task shows its **vault-relative path**.
  In Source it rides on the document-title group header; in buckets / Review / Focus (flat
  lists) it rides on the card. Project tasks need none (their header identifies them).
- Collapsed state persists in `localStorage` by group id.
- New pure helper `groupSource(tasks)` (project groups first, then document groups, each
  alpha-sorted) replaces the inline `groupByProject` in `PlanView`. Unit-tested.

## A3. Horizon buckets (Planned / Orbit / Today)

Three buckets, fixed order; labels from `GRAIN_LABEL` (month→"Planned", week→"Orbit",
day→"Today"). Replaces `PendingTray`.

- **Contents** = current membership (`fetchTasksAtGrain(grain,'this')`) ∪ staged-into-it;
  staged-uncommitted cards marked (dashed/accent) until Commit.
- **Emphasis** = dropdown grain → large + highlighted; others minimized. No label text.
- **Today bucket** keeps the Day view's capacity meter (Σ `estMinutes` vs `capacityMinutes`)
  and a **"→ tomorrow"** drop affordance (`bucket:'next'`).
- A single **Commit** button under the buckets applies the whole staging buffer via the
  existing `commit()` — **still log-only in Phase A**. Conflicts render inline as today.

## A4. Drag-and-drop

Using **`@dnd-kit/core` + `@dnd-kit/sortable`** (new dep — accessible, touch + keyboard,
animated). Tasks are draggables; Source groups + the three buckets are droppables.

- At rest: no drop zones; sizes per emphasis. On drag: every bucket reveals a drop zone, the
  minimized buckets expand, the dragged card lifts.
- Drop on a bucket → `onStage` a `PendingChange` (`toGrain` = that bucket; `kind:'promote'`;
  `'next'` for tomorrow). Bucket→bucket → re-stage with the new `toGrain` (the funnel pull).
  Drop on Source → `onUnstage`, else stage a defer to someday.
- `PendingChange` / `stagingReducer` / `commit` are reused unchanged; drag just dispatches the
  same `stage`/`unstage` actions `App.tsx` already wires.

## A5. Review page

Reached by the toggle; full-width. The existing `ReviewView` (`done`/`open` split,
defer/rollback/drop) plus **file chips** on non-project rows. Optional/secondary: drag a
slipped row back into a bucket to re-plan (else the existing buttons remain).

---

# Phase B — Focus & in-place write-back

> Folded from `2026-06-18-caius-focus-writeback-design.md` (status was: approved). Reconciled
> to the new navigation: **Focus is a top-level mode** selected by the header's Focus switch
> (the `mode` state from A1), replacing the board area entirely; it has no Plan/Review posture.

## B0. Decisions (locked)

- **Two write modes.** The planning surface keeps the staging-buffer + commit, and **commit
  stays log-only** this phase. The new **Focus and edit actions write to the vault
  immediately** (optimistic UI; the watcher reconciles).
- **Archive = `[-]` cancelled = "won't do",** distinct from `[x]` done. Done stays in
  Review/history; **cancelled is hidden from every view.** No new grammar (strict 5 states).
- **Scope = in-place single-line writes only:** toggle checkbox state, rewrite a task line's
  text + trailing tokens, edit a task's description (its indented note block). **Out of scope:**
  cross-file moves, tombstones, `^id` minting (planning commit stays log-only), time tracking,
  recurrence.

## B1. Write-back engine

- **`renderTaskLine` in `core`** (pure — inverse of the parser). Extend the line parse so a
  `ParsedTask`/`TaskLine` carries `marker` (`-`/`*`/`+`) and `indentText` (raw leading
  whitespace); token `raw` strings already retained. `renderTaskLine(t)` emits
  `indentText + marker + ' [' + glyph(state) + '] ' + text + tokens + blockId`, glyphs open` `,
  in_progress`/`, done`x`, cancelled`-`, tombstone`>`; unchanged tokens emit their `raw`,
  changed/added tokens re-render from typed value, removed tokens drop.
  **Round-trip invariant (safety net):** `parse(renderTaskLine(parse(line)))` structurally
  equals `parse(line)` for all 5,574 corpus tasks; byte-identical on well-formed unchanged
  lines. Corpus integration test.
- **`packages/write` (new I/O primitive):** `applyTaskUpdate(root, req)` where
  `req = { file, line, expectedText, patch }`,
  `patch = { state?, text?, estMinutes?, importance?, due?, project?, description? }`.
  Read file → **reconcile** (parsed `text` ≠ `expectedText` or not-a-task → `{conflict}`, no
  write) → apply patch → `renderTaskLine` → if `description`, replace the task's contiguous
  indented note block (subtasks preserved) → **atomic write** (temp + rename) → `{ok}`. The
  watcher's debounced re-scan refreshes; writes are idempotent (no write→scan→write loop).
  Depends on `core`.
- **Index:** `IndexedTask` gains `notes: string[]` (from `ParsedTask.notes`) for the edit modal.

## B2. API (additions)

- **`POST /api/task`** — `{ file, line, expectedText, patch }` → `applyTaskUpdate`; `200 {task}`
  or `409 {conflict}`. Powers check-off, in-progress, archive, edit modal.
- **`GET /api/focus`** — `{ date, active: UiTask[], doneToday }`; `active` = live (open +
  in_progress) at grain `day`, bucket `this`, in-progress first then by importance; `doneToday`
  = count of `[x]` in today's note.
- **Cancelled hidden everywhere** — `reviewSplit.done` becomes done-only; confirm no view
  surfaces cancelled (`live` already excludes it). Modal payloads include `description`
  (= `notes.join('\n')`) + the editable token fields.

## B3. Focus view (top-level mode)

Selected by the header **Focus** switch (the `mode` state). Shows **only today** — the
`active` list, each card with live controls: **complete** (`→[x]`), **start/stop in-progress**
(`toggle [/]`), **archive** (`→[-]`), **edit** (modal), estimate inline. Complete/archive write
immediately and animate the card out. A small **"done today"** tally. Each control posts
`{file,line,expectedText}` + patch; on `409` the card shows "changed on disk — refresh" and
re-fetches instead of clobbering.

## B4. Shutdown calculator

Banner atop Focus, computed **client-side from the browser clock**: `remainingMin` = Σ
`estMinutes` over incomplete `active` with estimates; **earliest shutdown = now + remainingMin**
(rendered as a clock time); incomplete-without-estimate shown as **"+N unestimated"** (floor).
Optional secondary line vs `capacity.workday_minutes`. Pure `shutdown(active, now)` + unit test.

## B5. Edit modal

Opened from **any** task card (Focus **and** the Plan board / buckets / Review — the affordance
lives on the shared `TaskCard`). Fields: text, estimate, importance (none/!/!!/!!!), due
(blank clears), project override (blank clears), multi-line description. Pre-filled; **Save**
sends only changed fields as a `patch` (live write); **Cancel** discards; `409` surfaces the
conflict and reloads.

---

## Components & files (both phases)

```
packages/core/src/
  render-line.ts        renderTaskLine() + glyph map                      (new, B)
  parse-line.ts         + marker + indentText                             (modify, B)
  types.ts              marker/indentText on the line type                (modify, B)
packages/write/         applyTaskUpdate() (reconcile→render→atomic write) (new package, B)
packages/index/src/scan.ts   IndexedTask gains notes[]                     (modify, B)
packages/api/src/
  server.ts             POST /api/task, GET /api/focus                    (modify, B)
  query.ts              reviewSplit done-only; focus()                     (modify, B)
  task.ts               request validation + applyTaskUpdate wiring        (new, B)
packages/gui/src/
  App.tsx               mode (plan|focus) + altitude/posture; compose board / review / focus  (modify, A+B)
  components/
    PlanHeader.tsx      grain dropdown + Plan|Review + Focus + theme       (rework RitualHeader, A)
    PlanBoard.tsx       Source + three buckets + DnD context               (new — replaces PlanView+DayPlanView, A)
    SourceGroup.tsx     one collapsible project/document group             (new, A)
    HorizonBucket.tsx   one bucket (emphasis, drop zone, capacity meter)   (new, A)
    FocusView.tsx       today list + live controls + calc banner           (new, B)
    ShutdownBar.tsx     the calculator banner                              (new, B)
    EditModal.tsx       the edit modal                                     (new, B)
    TaskCard.tsx        drag handle + file chip (A); edit affordance (B)   (modify, A+B)
    ReviewView.tsx      file chips on non-project rows                     (modify, A)
    PendingTray.tsx / SkipMenu.tsx / PlanView.tsx / DayPlanView.tsx        (DELETE, A)
  lib/
    grouping.ts         groupSource() pure helper + types                  (new, A)
    grains.ts           keep; maybe BUCKETS = [month,week,day]             (modify, A)
    api.ts              postTask(), fetchFocus(), shutdown()               (modify, B)
    staging.ts          unchanged (reused)
```

## Milestones

**Phase A (GUI-only):**
A1. Nav + scaffold — `PlanHeader` (grain dropdown + toggle); `App` swaps to an empty
`PlanBoard`; delete dead ritual chrome. Tests green.
A2. Grouped source — `grouping.ts` + `SourceGroup` (collapsible, persisted); file chips;
`groupSource` unit tests.
A3. Buckets (no DnD) — `HorizonBucket` ×3 with emphasis + capacity meter; contents = membership
∪ staged; Commit; remove `PendingTray` (keep interim click-stage so it stays usable).
A4. Drag-and-drop — add `@dnd-kit`; wire drag→stage/unstage across Source↔buckets and
bucket↔bucket; drop zones on drag only; remove `SkipMenu` + interim click-stage.
A5. Review page — toggle to full-area `ReviewView` + file chips.

**Phase B (write-back + Focus):**
B1. Write engine — `core` `renderTaskLine` + parser `marker`/`indentText` + corpus round-trip;
`packages/write` `applyTaskUpdate` (per field + description block + `expectedText` conflict);
`POST /api/task` + integration test; `IndexedTask.notes`.
B2. Archive / state semantics — `reviewSplit` done-only; cancelled hidden across views; verify
complete/in-progress/archive writes end-to-end.
B3. Focus view + shutdown — `GET /api/focus`; `FocusView` + live controls; `ShutdownBar` +
`shutdown()` unit test; the header Focus switch goes live.
B4. Edit modal — `EditModal` + field patches via `POST /api/task`, reachable from Focus + Plan
board + Review cards.

## Testing

- **Phase A** — unit: `groupSource` ordering/title derivation; emphasis selection. Playwright:
  collapse persists; drag into each bucket stages + raises buffer count; bucket→bucket
  re-targets; drag to Source un-stages; drop zones only on drag and on every bucket; Commit
  posts + clears clean subset; Plan↔Review toggle; file chips on non-project cards.
- **Phase B** — core: `renderTaskLine` golden + corpus round-trip. write: temp-file per patch
  field + contiguous-note-block (subtasks present) + `expectedText` mismatch → no-write
  conflict. api: `POST /api/task` changes disk + returns task; conflict 409 leaves file
  untouched; `GET /api/focus` shape; `reviewSplit` excludes cancelled. gui: `shutdown()` unit;
  Playwright Focus check-off/in-progress/archive + edit-modal persist + conflict path.
- All 195 existing tests stay green; `grains.test.ts` engine-parity unchanged.

## Non-goals / relationship to other specs

- **Supersedes** ritual-GUI navigation + single staging-buffer; **absorbs** the 2026-06-18
  focus-writeback spec (now Phase B here — that file is marked superseded).
- **No quick-add / capture** of brand-new tasks to a default note. Your original "add … current
  tasks" wish is *manage/edit* (covered by Phase B), not *create-new* — capture remains
  unspecced and is a candidate for its own follow-up spec.
- Phase A: no engine/API changes. Phase B: no cross-file moves / tombstones / `^id` minting
  (planning commit stays log-only); no time tracking; no recurrence.
