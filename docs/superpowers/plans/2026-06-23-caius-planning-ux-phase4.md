# Caius Planning UX — Phase 4 (Overdue + Reschedule) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Make overdue (P3) actionable: the funnel spine's `⚠ overdue` node aims the left/source column at the past-due set (cross-cutting, any grain); it goes "hot" during Day planning; overdue rows show days-late and get a first-class **Reschedule** (set a new due date → the task re-files by the next scan) plus the existing promote/archive.

**P10 status (deferred by design):** Date-driven capture *placement* requires writing into the due date's periodic note, which Caius would have to *create* when missing — and Caius cannot run the user's Obsidian note template (an Obsidian-runtime plugin feature). That note-creation policy is a vault decision the user explicitly flagged for review. This phase does NOT change capture placement; P10 is surfaced to the user as a separate decision with a recommendation. (Engine fact confirmed: `resolveHorizon` classifies by note location/period, not the task's `*due` token — so correct placement is fundamentally a write-location problem.)

**Architecture:** A pure `daysLate` date helper (TDD). App gains an `overdueActive` boolean (reset on grain change). The spine's overdue node toggles it. PlanBoard fetches the overdue set (`fetchOverdue`) for the source when active, labels it "⚠ Overdue", and renders cards with a days-late badge + inline reschedule (a `<input type="date">` writing `due` via `postTask`). Verified by tsc + full vitest + build.

**Tech Stack:** React 18 + Vite + Tailwind + @dnd-kit, Vitest. Same commands as prior phases.

---

## File Structure
- `packages/gui/src/lib/dates.ts` (new) + `dates.test.ts` — `daysLate(due, today)`. (Task 1)
- `packages/gui/src/components/TaskCard.tsx` (modify) — optional `daysLate` badge + `onReschedule` date input. (Task 2)
- `packages/gui/src/components/PipelineStrip.tsx` (modify) — overdue node clickable/toggle + hot when day grain or active. (Task 3)
- `packages/gui/src/App.tsx` (modify) — `overdueActive` state + spine/board wiring. (Task 3)
- `packages/gui/src/components/SourceColumn.tsx` (modify) — accept an optional `label` override (for "⚠ Overdue"). (Task 3)
- `packages/gui/src/components/PlanBoard.tsx` (modify) — fetch overdue when active; days-late + reschedule on source cards. (Task 3)

---

## Task 1: `daysLate` date helper (pure, TDD)

Create `packages/gui/src/lib/dates.ts`:
```ts
/** Whole days a due date is past `today` (both ISO YYYY-MM-DD). 0 or negative → not late. */
export function daysLate(due: string | null, today: string): number {
  if (!due) return 0;
  const a = Date.parse(`${due}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  const d = Math.round((b - a) / 86_400_000);
  return d > 0 ? d : 0;
}
```
Tests (`dates.test.ts`): `daysLate('2026-06-20','2026-06-23')===3`; `daysLate('2026-06-23','2026-06-23')===0`; `daysLate('2026-07-01','2026-06-23')===0` (future, not late); `daysLate(null,'2026-06-23')===0`. Steps: failing test → run → implement → pass → tsc → commit `gui: Add daysLate date helper`.

---

## Task 2: TaskCard — days-late badge + inline reschedule

Modify `packages/gui/src/components/TaskCard.tsx`. Add OPTIONAL props (backward-compatible): `daysLate?: number`, `onReschedule?: (date: string) => void`.
- When `daysLate && daysLate > 0`: render a red badge `{daysLate}d late` in the meta row (near importance).
- When `onReschedule`: render an inline `<input type="date" data-testid="reschedule" defaultValue={task.due ?? ''}>` in the meta row; `onChange` → `if (e.target.value) onReschedule(e.target.value)`. Style compact (`rounded border border-line bg-panel px-1 text-[11px]`). Stop click propagation.

Steps: implement → tsc clean → full suite (existing usages unaffected) → commit `gui: Add days-late badge and inline reschedule to TaskCard`.

---

## Task 3: Wire overdue as an aimable source (App + Spine + SourceColumn + PlanBoard)

**PipelineStrip** — add props `overdueActive: boolean`, `onAimOverdue: () => void`. Make the overdue counter a `<button>` that calls `onAimOverdue` (toggle). Style it "hot" (brighter red / ring) when `overdueActive`; also visually emphasize it when the grain is `day` (pass `altitude` already available). The ambient caption, when `overdueActive`, reads `Triaging ⚠ overdue → {BUCKET_LABEL[aimed]}`.

**App.tsx** — add `const [overdueActive, setOverdueActive] = useState(false);`. Reset it on grain change (`onGrain={(a) => { setAltitude(a); setAimedTier(a); setOverdueActive(false); }}`). Pass `overdueActive` + `onAimOverdue={() => setOverdueActive(v => !v)}` to `PipelineStrip`, and `overdueActive` to `PlanBoard`.

**SourceColumn.tsx** — add an optional `label?: string` prop; the header shows `label ?? \`Source · ${GRAIN_LABEL[sourceTier]}\``.

**PlanBoard.tsx** — add prop `overdueActive: boolean`.
- `refresh`: when `overdueActive`, set the source from `fetchOverdue()` instead of `fetchTasksAtGrain(sourceTier)`; add `overdueActive` to the effect deps.
- Pass `label={overdueActive ? '⚠ Overdue' : undefined}` to `SourceColumn`.
- In the source `renderTask`, pass to source cards: `daysLate={daysLate(t.due, today)}` and `onReschedule={(d) => void rescheduleOne(t, d)}`.
- Handler `rescheduleOne(t, date)` → `await postTask({ file: t.file, line: t.line, expectedText: t.text, patch: { due: date } }); refresh();`
- Promote/quick-estimate/select/archive on overdue cards reuse existing handlers unchanged.

Steps: implement → tsc clean → full vitest → build → commit `gui: Overdue as an aimable source with days-late and reschedule`.
Optional smoke: click `⚠ overdue` in the spine → source switches to the past-due set labeled "⚠ Overdue" with days-late badges; set a new date on a card → it re-files on next scan; the node is hot during Day planning.

---

## Self-review checklist
- **Spec coverage:** P3 overdue aimable source (Task 3), hot in Day planning (Task 3), days-late (Tasks 1-2), Reschedule first-class (Tasks 2-3). ✓ P10 deferred + surfaced to user (documented above). ✓
- **Type consistency:** `daysLate` (Task 1) used in TaskCard + PlanBoard; `onReschedule(date:string)` consistent; reschedule reuses `postTask {due}`. ✓
