---
title: Caius — Focus mode + in-place write-back (implementation spec)
status: superseded
superseded_by: 2026-06-22-caius-planning-redesign-design.md (folded in as Phase B)
date: 2026-06-18
builds_on: "2026-06-17-caius-ritual-gui-design.md (ritual GUI), 2026-06-17-caius-phase1-design.md (engine)"
target_vault: /home/shawn/documents/obsidian/Main
---

# Caius — Focus mode + in-place write-back

> **Superseded** — folded into `2026-06-22-caius-planning-redesign-design.md` as **Phase B**.
> Kept for history; the combined spec is authoritative.

This adds the **doing/editing** layer on top of the ritual planning surface: a Focus
view for today, live check-off / in-progress / archive, a Sunsama-style shutdown
calculator, and an edit modal — all powered by Caius's **first real write-back**.

## 0. Decisions (locked in brainstorming)

- **Two write modes.** The six planning rituals keep the deliberate staging-buffer +
  commit, and **commit stays log-only** (no disk writes) this phase. The new Focus and
  edit actions **write to the vault immediately** (optimistic UI; the watcher reconciles).
- **Archive = `[-]` cancelled = "won't do".** Distinct from `[x]` "done": done tasks
  still appear in Review/history; **cancelled tasks are hidden from every view.** No new
  grammar (strict 5 checkbox states preserved).
- **Scope = in-place single-line writes only.** Toggle checkbox state, rewrite a task
  line's text + trailing tokens, and edit a task's description (its indented note lines).
  **Out of scope:** cross-file moves, tombstones, `^id` minting (the planning commit
  stays log-only); time tracking / elapsed; recurrence.

---

## 1. Write-back engine

### 1.1 `renderTaskLine` (in `core`, pure — the inverse of the parser)

`core` owns the grammar exactly once; it gains the render direction alongside parse.

- Extend the line parse so a `ParsedTask` (and the underlying `TaskLine`) carries enough
  to reconstruct its source line exactly: add **`marker: string`** (`-` / `*` / `+`) and
  **`indentText: string`** (the raw leading whitespace). Token `raw` strings are already
  retained; keep them.
- Add `renderTaskLine(t): string` that emits:
  `indentText + marker + ' [' + glyph(state) + '] ' + text + tokens + blockId`
  where `glyph`: open `' '`, in_progress `'/'`, done `'x'`, cancelled `'-'`,
  tombstone `'>'`; each token contributes its `raw` (with its original leading space)
  for **unchanged** tokens, or is re-rendered from its typed value when changed/added
  (estimate minutes → `~Nh` / `~NhMm` / `~Nm`; importance tier → `!`×tier; due →
  `*YYYY-MM-DD`; project → `:[[name]]`); a removed token is dropped; `blockId` → ` ^id`
  when present.
- **Round-trip invariant (the safety net):** `parse(renderTaskLine(parse(line)))`
  structurally equals `parse(line)` for **all 5,574 corpus tasks**, and
  `renderTaskLine(parse(line)) === line` byte-for-byte for the unchanged case wherever
  the line is well-formed. This is a corpus integration test; it is what makes editing
  safe.

### 1.2 `packages/write` (new — the I/O primitive)

`applyTaskUpdate(root, req): Result` where
`req = { file, line, expectedText, patch }` and
`patch = { state?, text?, estMinutes?: number|null, importance?: 0|1|2|3, due?: string|null, project?: string|null, description?: string }`.

Algorithm:
1. Read `root/file`, split into lines.
2. **Reconcile:** parse `lines[line]`; if its parsed `text` ≠ `expectedText` (or the line
   isn't a task) → return `{ conflict: 'line changed under you' }` and write nothing.
   (Same snapshot-reconcile idea as the planning commit, applied per action.)
3. Apply `patch` to the parsed parts; `renderTaskLine` → the new task line.
4. If `patch.description` is present, replace the task's **contiguous indented note block**
   (the non-task indented lines immediately under the task line, up to the first child
   task or a dedent) with the new description (re-indented one level under the task).
   Subtasks are preserved.
5. Write atomically (temp file in the same dir + `rename`).
6. Return `{ ok: true }`. The watcher's debounced re-scan refreshes the index/GUI; writes
   are idempotent so there is no write→scan→write loop.

`packages/write` depends on `core` (for parse + `renderTaskLine`); the API depends on it.

### 1.3 Index/data-model additions

- `IndexedTask` gains **`notes: string[]`** (copied from `ParsedTask.notes`), so the edit
  modal can show/replace a task's description. (`marker`/`indentText` stay in `core`'s
  parse output; they need not surface on `IndexedTask`.)

---

## 2. API (additions + changes)

- **`POST /api/task`** — body `{ file, line, expectedText, patch }`. Calls
  `applyTaskUpdate`. Returns `200 { task }` (the re-read task) on success or
  `409 { conflict }` on a reconcile mismatch. Powers check-off, in-progress, archive, and
  the edit modal.
- **`GET /api/focus`** — today's actionable set: `{ date, active: UiTask[], doneToday }`
  where `active` = live (open + in_progress) tasks at grain `day`, bucket `this`, ordered
  in-progress first then by importance; `doneToday` = count of `[x]` done tasks in today's
  note. (Composable from `/api/tasks`; a dedicated endpoint keeps the client simple.)
- **Cancelled is hidden everywhere.** `reviewSplit.done` becomes **done-only**
  (`state === 'done'`, excluding cancelled); confirm no view (funnel/byGrain/tasks/review)
  surfaces `cancelled`. `live` already excludes cancelled, so plan/focus are unaffected.
- Task payloads used by the modal include **`description`** (= `notes.join('\n')`) and the
  editable token fields (already present: `estMinutes`, `importance`, `due`, `project`).

---

## 3. Focus view (7th surface, top-level)

A distinct **"Focus"** mode in the header, **separate from the ritual dropdown** (Focus
is not a ritual — it has no Plan/Review posture). The header offers a one-click switch
between the planning surface and Focus.

- Shows **only today**: the `active` list (open + in-progress), each as a card with live,
  immediate controls: **complete** (`→ [x]`), **start/stop in-progress** (`toggle [/]`),
  **archive** (`→ [-]`), **edit** (opens the modal), and the estimate inline. Completing
  or archiving writes immediately and animates the card out of the active list.
- A small **"done today"** tally (count) for momentum; not the full list.
- Each control issues `POST /api/task` with the card's `{file,line,expectedText}` and the
  relevant `patch`; on `409 conflict` the card shows a "changed on disk — refresh" state
  and re-fetches rather than clobbering.

---

## 4. Shutdown calculator (Sunsama-style)

A banner at the top of Focus, computed **client-side from the browser clock** (so it's
live and unaffected by the server's session-frozen `now`):

- `remainingMin` = Σ `estMinutes` over the `active` (incomplete) tasks that have an estimate.
- **`earliest shutdown` = now + remainingMin** → rendered as a clock time, e.g.
  *"≈ 3h 45m of work left → earliest shutdown 5:45 PM."*
- Incomplete tasks **without** an estimate show as **"+N unestimated"** so the time reads
  as a floor (nudging an estimate via the edit modal).
- Optional secondary line vs. `capacity.workday_minutes`.
- Pure function `shutdown(active, now): { remainingMin, earliest, unestimated }` with a
  unit test; time tracking / elapsed is explicitly deferred.

---

## 5. Edit modal

A modal (dimmed backdrop, keyboard-dismissable) opened from **any** task card — Focus
**and** the ritual views (add an edit affordance to the shared `TaskCard`).

- Fields: **text**, **estimate** (`~Nh`/`~Nm`, blank clears), **importance**
  (none/!/!!/!!!), **due** (date, blank clears), **project override** (`:[[…]]`, blank
  clears), and a multi-line **description** (the indented note block).
- Pre-filled from the task's current values (incl. `description`). **Save** sends only the
  changed fields as a `patch` to `POST /api/task` (live write); **Cancel** discards. On
  `409` it surfaces the conflict and reloads the task.

---

## 6. Components & files

```
packages/core/src/
  render-line.ts        renderTaskLine() + glyph map           (new, pure)
  parse-line.ts         add marker + indentText to the parse   (modify)
  types.ts              marker/indentText on the line type      (modify)
packages/write/         new package
  src/apply.ts          applyTaskUpdate() (read→reconcile→render→atomic write)
  src/index.ts
packages/index/src/scan.ts   IndexedTask gains notes[]          (modify)
packages/api/src/
  server.ts             POST /api/task, GET /api/focus          (modify)
  query.ts              reviewSplit done-only; focus()           (modify)
  task.ts               request validation + applyTaskUpdate wiring (new)
packages/gui/src/
  App.tsx               plan ⇄ focus mode switch                 (modify)
  lib/api.ts            postTask(), fetchFocus(), shutdown()     (modify)
  components/
    FocusView.tsx       today list + live controls + calc banner (new)
    ShutdownBar.tsx     the calculator banner                    (new)
    EditModal.tsx       the edit modal                           (new)
    TaskCard.tsx        add edit affordance                      (modify)
    RitualHeader.tsx    add the Focus switch                     (modify)
```

---

## 7. Milestones

1. **Write engine** — `core` `renderTaskLine` + parser `marker`/`indentText` + corpus
   round-trip test; `packages/write` `applyTaskUpdate` (each field + description block +
   `expectedText` conflict) with temp-file tests; `POST /api/task` + integration test
   (real file change + 409 conflict). `IndexedTask.notes`.
2. **Archive / state semantics** — `reviewSplit` done-only; cancelled hidden across views;
   verify the three state writes (complete/in-progress/archive) end-to-end.
3. **Focus view + shutdown calculator** — `GET /api/focus`; `FocusView` + live controls;
   `ShutdownBar` + `shutdown()` unit test; the plan⇄focus header switch.
4. **Edit modal** — `EditModal` + field patches via `POST /api/task`, reachable from Focus
   and ritual cards.

---

## 8. Testing

- **core:** `renderTaskLine` golden cases + the **corpus round-trip** integration test
  (structural identity over all tasks; byte-identity on well-formed lines).
- **write:** temp-file tests per patch field (state, text, estimate add/change/clear,
  importance, due, project, description add/edit/clear), the contiguous-note-block rule
  with subtasks present, and the `expectedText` mismatch → conflict (no write).
- **api:** integration — `POST /api/task` changes the file on disk and returns the updated
  task; conflict returns 409 and leaves the file untouched; `GET /api/focus` shape;
  `reviewSplit` excludes cancelled.
- **gui:** `shutdown()` unit test; Playwright — Focus check-off/in-progress/archive write
  and update the list + calc; edit modal changes text/estimate and persists; conflict path.

---

## 9. Non-goals (this phase)

- No cross-file moves / tombstones / `^id` minting — the **planning commit stays
  log-only**; promotions still don't touch disk.
- No time tracking / elapsed — the shutdown calc uses estimates only.
- No recurrence; no subtask-aware description interleaving (only the contiguous note block
  under the task line is treated as the description).
