# Caius — Planning UX Fixes (post user-testing) — Design

**Date:** 2026-06-23
**Status:** Design approved in brainstorming; pending written-spec review → implementation plan.
**Source:** `USER-TESTING-2026-06-23.md` (hands-on session, the three planning rituals).
**Builds on:** `2026-06-22-caius-planning-redesign-design.md` (the funnel/periodic-note model and the
ritual GUI). This spec does **not** replace that model — it fixes the friction the test surfaced
and reshapes the planning *board* around a focus-plus-context layout.

---

## 1. Goal

The funnel→periodic-note model and the Today capacity meter tested as the app's best ideas. The
friction was concentrated in: the source pane doesn't scale or follow the grain, capacity/estimates
are starved everywhere but Day, overdue is a dead counter, capture is blind and mis-places, and a
handful of readability/feedback rough edges. Address **all 14** findings, keeping what's good
(funnel model, provenance everywhere, edit modal, capture grammar).

## 2. The keystone — board layout (focus + context)

Every grain shows exactly the **one transition you're working**, at full size, with every other tier
collapsed to lightweight, on-demand context. This replaces the current `grid-cols-[1.4fr_1fr]`
[ source | three stacked buckets ] board.

- **Funnel spine** (top, always visible): `Someday → Planning Ahead → Orbit → Today`, plus `now`
  and `⚠ overdue`. The active `from → to` pair is lit. Nodes are the **navigator** — clicking one
  re-points a column at that tier. This is the evolution of `PipelineStrip`.
- **Left column = the grain's anchored source.** Month → Someday; Week → Planning Ahead; Day →
  Orbit. It is the stable pool you pull from and does not swap as you peek.
- **Right column = a single destination slot you *aim*.** It defaults to the grain's destination
  (Month → Planned, Week → Orbit, Day → Today) and carries **tabs** to peek any forward tier. Peeked
  tiers are **droppable** — flexibility with a default preference. The label reads *destination* on
  the default tier and *peeking* otherwise.
- **Tasks are lists, not cards-in-a-grid.** Full-width rows, titles wrap, a meta line carries
  project · estimate · importance · file-chip. Horizontal space is spent on two columns, never on
  wrapping pills.
- **Single-horizon.** Promoting **moves** a task forward, out of its parent tier. Each tier's load
  reflects what is *expected at that tier*, not an accumulation. (Matches the engine data model.)
- **Ambient caption** near the spine narrates the active move ("Pulling Someday → Planned") — the
  only onboarding affordance (P13).

Movement is drag (row → column / tab / spine node) **and** one-click promote (per-row `→ <tier>`).
Dropping a right-column row back on the left demotes it to the source.

> Resolves **P2** (source follows grain), **P11** (move is a visible single-horizon move),
> **P12** (each tier gets a full column), **P13** (model is legible via spine + caption).

## 3. Findings → decisions

### Theme A — Source & layout
- **P2 source follows grain / P12 cramped tiers / P11 move-vs-keep / P13 onboarding** — resolved by
  §2.
- **P1 backlog triage at scale** — the left (source) header carries:
  - **Text search** (always on), **sort menu** defaulting to **Priority (importance desc)**; menu
    also offers due / age (oldest-first) / project / estimate.
  - **Filters:** Project, Has/no-estimate, Importance, Due/overdue.
  - **Multi-select** mode (☑) → floating action bar with **Promote to a tier**, **Quick-estimate**,
    **Archive (won't-do)**. (Bulk reschedule is out; reschedule is a per-task overdue action.)
  - Existing project/document grouping, collapse/expand-all, and file chips are kept.
- **P14 virtualization** — window the source list (render only visible rows); kills the ~54,000px
  full render. Grouping headers remain; rows within virtualize.

### Theme B — Capacity & estimates
- **P5 load signal on every tier** — an **honest hybrid meter** in each destination header:
  solid bar = estimated time toward the tier budget; **hatched segment = "unknown" weight** for
  unestimated tasks, so a tier full of no-est tasks still reads as loaded. Label:
  `<known>h · <n> no-est · / <budget>`. Clicking the hatched zone jumps to estimate those tasks.
  Over-budget turns the bar red. Budgets are config: **day 8h**, **week 40h**,
  **month = working-days × focus-hours**.
- **P4 estimation nudge** — **inline one-tap quick-estimate** on every card: a `+ est ▾` control
  reveals chips (15m / 30m / 45m / 1h / 2h / keyboard custom). Writes via the existing task-patch
  path; the meter updates live. Promoting an unestimated task into **Day** relies on the honest
  meter to nudge (the hatched zone grows) — **no hard block**.

### Theme C — Overdue
- **P3 overdue is actionable** — overdue is an **aimable source** like any tier: the spine's
  `⚠ overdue` node points the left column at the past-due set (cross-cutting, any grain). The node
  turns **hot during Day planning** to pull you there first. Rows show **days-late + origin tier**.
  Per-row actions: **→ Today / forward tier**, **⟳ Reschedule** (pick a new due date → the task
  re-files to the tier its date implies), plus demote / archive. Reschedule is a first-class action
  (the one thing overdue needs that other sources don't).

### Theme D — Movement feedback & commit
- **P11** — resolved by §2 (single-horizon move in a column model).
- **P6 commit confirmation** — a **pre-commit summary** modal: before writing, list the staged
  changes grouped by action (promoted / rescheduled / archived) with their **target files**;
  Commit / Cancel. On write, a **post-commit toast** (`✓ Committed N changes → file(s)`). The commit
  is the only vault-mutating action, so it shows the diff *before* touching disk.

### Theme E — Quick capture
- **P9 parse preview** — under the capture bar, a live **chip strip** confirms the parse
  (`task · est · importance · due · project`) plus a **"↳ lands in <tier>"** line. Unrecognized
  tokens (e.g. `~1hh30m`) are **flagged** ("did you mean `~1h30m`?") and remain in the title instead
  of being silently swallowed.
- **P10 date-driven placement** — **rule A**: a parsed `*date` files the task into the tier its date
  implies; **undated → Someday** (a stray capture must not inflate Today/its capacity). The preview's
  "lands in" line makes placement visible before Enter.

### Theme F — Readability
- **P7 markdown in titles** — render inline markdown for display: `[text](url)` becomes clickable
  **link-text** (opens the URL — preserves provenance); `**bold**`, `` `code` `` likewise. Rendering
  is **display-only**; the canonical task text (used by the inverse-parser / write path) is untouched.
- **P8 file-chip names** — strip the leading Zettel timestamp prefix `^\d{12,14}\s-\s` for display
  (`20240816123018 - Questions for AWS Team` → `Questions for AWS Team`). The deep-link still targets
  the real file.

### Theme G — Onboarding
- **P13** — the **ambient caption** (§2) only. No first-run overlay.

## 4. Architecture / files touched

- `packages/gui/src/components/PipelineStrip.tsx` → **Spine**: clickable nodes (aim columns), lit
  active pair, hot overdue node in Day, ambient caption.
- `packages/gui/src/components/PlanBoard.tsx` → major rewrite: two-column focus+context, anchored
  source (left) + aimable destination with tabs (right), drag + one-click promote, multi-select
  bar, virtualized source list. Drops the three-stacked-bucket grid.
- `packages/gui/src/App.tsx` → state for `sourceTier` (derived from grain) and `aimedTier` (right
  slot); wires spine/tab aiming.
- `packages/gui/src/components/TaskCard.tsx` (or a new list-row) → markdown title render, cleaned
  file chip, inline quick-estimate chips, hover `→ promote`, selection checkbox.
- **New components:** capacity meter (honest hybrid), multi-select action bar, pre-commit summary
  modal, reschedule control, overdue row.
- `packages/gui/src/lib/*` → markdown render helper (display-only), filename-prefix strip helper,
  client-side sort/filter over loaded source, capture parse-preview parser (mirror of the engine
  grammar for *preview only* — server parse remains canonical).
- `packages/api` + `packages/write` → capture placement by date (choose the target periodic note
  from the parsed due date), per-grain capacity budgets on `/api/summary`/config. Quick-estimate and
  reschedule reuse `POST /api/task` (`estMinutes`, `due` patches). Pre-commit summary reads the
  existing staging buffer; commit path is unchanged (still log-only until Phase-2 write-back).

## 5. Open considerations / risks

- **⚠ Periodic-note templates (P10).** Date-routing writes into the target tier's periodic note
  (e.g. the July monthly note, a future weekly note). In Obsidian those notes are normally created
  **from a Template** (Periodic Notes / Templater). If Caius creates a bare note when the target is
  missing, it bypasses the template (wrong frontmatter/structure). Resolve during planning — options:
  (a) honor a configured template path; (b) **append-only with fallback to Someday** when the target
  note doesn't exist; (c) a "pending placement" holding area the user commits from. Lean (b) as the
  safe default, (a) if a template is configured. **Must be decided before P10 ships.**
- **Capacity budgets** — month budget needs a working-days × focus-hours definition + config knob.
- **Markdown render vs write integrity** — rendering must never feed back into the canonical text;
  keep a strict display/source split so the round-trip inverse-parser stays correct.

## 6. Phasing

1. **Quick wins (no layout change):** P7 markdown render, P8 filename strip, P9 capture parse
   preview, P6 pre-commit summary, P14 virtualization. Independent, low-risk, immediate value.
2. **Keystone layout:** §2 two-column focus+context, spine navigator, aimable destination,
   single-horizon, ambient caption, **honest capacity meters (P5)**.
3. **Triage power tools (on the new layout):** search / sort / filters, multi-select bulk actions,
   one-click promote (P1), inline quick-estimate (P4).
4. **Overdue + placement:** overdue as aimable source + reschedule (P3); date-driven capture
   placement + the periodic-note-template resolution (P10).

## 7. Must not regress

The funnel→periodic-note model, provenance on every card (project + source file), the edit modal,
capture grammar consistency, the existing archive/won't-do actions, and Obsidian deep-links.
