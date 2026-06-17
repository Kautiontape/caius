---
title: TaskEngine — Phase 0 Grammar & Resolution Spec
status: draft
phase: 0 (design, pre-code)
updated: 2026-06-16
---

# TaskEngine — Phase 0 Spec

A Markdown-canonical task system. Tasks live as plain checkboxes inside your
existing notes. A separate service indexes them into SQLite for fast querying
and a Sunsama-style planning GUI; a thin Obsidian companion plugin handles
in-place interaction. **This document defines the grammar and the
resolution rules only — no code.** The point of Phase 0 is to test this
grammar against real notes and break it before anything is built.

## Design principles (the non-negotiables)

1. **Markdown on disk is the single source of truth.** SQLite is a derived
   index, never canonical. The system must work if the service is off (you
   just lose the fast views, not your data).
2. **A bare `- [ ] thing` is always a valid task.** All metadata is optional.
3. **One live line per task, ever.** At most one non-tombstone line per `^id`.
   This is what kills the "thought I checked it off — oh, other copy" bug.
4. **Identity lives in `^id`, not text or path.** Everything else re-derives.
5. **Context is inferred from location by default; explicit tokens override.**
   Minimal typing in the common case.
6. **The service explains itself.** Any derived value (horizon/project/area)
   must be traceable to the rule that produced it.
7. **Native Obsidian glyphs only.** No custom-status CSS dependency, no Unicode
   that's hard to type.

---

## 1. Checkbox states (lifecycle only)

The checkbox holds **one axis: lifecycle**. All are natively supported by
Obsidian and the Tasks plugin (no CSS required).

| Glyph | Meaning        | Live? | Notes |
|-------|----------------|-------|-------|
| `[ ]` | open           | yes   | actionable |
| `[/]` | in progress    | yes   | actionable; "now" in funnel terms |
| `[x]` | done           | no    | terminal; carries `done:DATE` |
| `[-]` | cancelled      | no    | terminal; "fuck it" |
| `[>]` | moved/tombstone| no    | MUST carry a `moved:` pointer |

"Live" = appears in open-task views and the planning pool. Terminal and
tombstone states are excluded from the active pool but remain indexed for
history.

Dropped (resolved during design): `[?]` (conflated importance with
commitment), `[!]` as a checkbox (importance is now a separate axis — see §3).

---

## 2. The task line — anatomy

```
- [state] TEXT  [tokens...]  ^id
```

- `TEXT` is freeform prose. Inline `[[wikilinks]]` in TEXT are **prose
  references only** — they never assign a project.
- `tokens` are optional, whitespace-delimited, and live *after* the text.
- `^id` is the block id, last on the line. Lazy — only present once the task
  has been linked or moved.

A line with no tokens and no id is still a complete, valid task.

---

## 3. Metadata tokens (all optional)

| Token | Example | Meaning |
|-------|---------|---------|
| `^id` | `^iam` | Block identity. Lazy-generated on first link/move. The sole reliable bond across moves. |
| `:[[Project]]` | `:[[Network]]` | **Assign** project explicitly (overrides path inference). Note leading colon. |
| `from:[[Source]]` | `from:[[ZeroedIn Bedrock Migration]]` | Back-link on a live task that was moved. Points to the **original home**, not the previous step. |
| `moved:[[Target#^id]]` | `moved:[[2026-06-16#^iam]]` | Forward pointer on a `[>]` tombstone. Where the live task went. |
| `!`, `!!`, `!!!` | `!!` | Importance. Count of exclamations = tier. Absent = normal. Orthogonal to lifecycle. |
| `~est` | `~2h`, `~30m` | Time estimate. Feeds capacity/realism in planning. |
| `*date` | `*2026-06-20` | Explicit due date. **Rare by design** — most tasks have none. |
| `done:date` | `done:2026-06-16` | Completion date, stamped on `[x]`. |
| `from:` (recurrence) | `from:[[Recurring#^standup]]` | On a spawned recurring instance, points to its template. |

Token recognition rule (deterministic): a token is parsed only when it is
whitespace-delimited and appears in the trailing-metadata zone (after TEXT).
Prose that happens to contain a sigil mid-sentence is not parsed. Rare false
positives are acceptable and preferred over a fragile escaping scheme.

### Importance vs. lifecycle are orthogonal

Because importance left the checkbox, any importance combines with any state:

```
- [/] Ship CouchDB container !!  ^cdb     ← in progress AND critical
- [ ] Maybe try Tauri later               ← open, normal importance
- [ ] Renew passport before expiry !  ^pass ← open, important, no date
```

---

## 4. Nesting: subtasks vs. notes

The parse unit is a **task block**: the task line plus all lines indented
under it, up to the next same-or-shallower task line.

- A nested line **that is itself a checkbox** = a **subtask** (own state, own
  `^id` if ever linked).
- A nested line that is **not** a checkbox (`-` bullet, `>` quote, plain text)
  = a **note** attached to the parent. Never parsed as a task.

```
- [ ] Build the SQLite watcher  ^watch
    - [ ] Decide on FS-event library          ← subtask (own identity)
    - [ ] Handle rename events                 ← subtask
    - this is just a note, freeform context    ← note, not a task
    > see the parser notes before starting     ← note
```

**Parent completion rule:** completing a parent completes all its children.
A parent cannot be `[x]` while a child is open — the action cascades.

---

## 5. Context resolution (the inference engine)

Three independent axes, each resolved by a precedence chain. **Explicit always
beats inferred.** All values are *derived* — never written into the task line
except the explicit overrides — so reorganizing your vault or editing config
re-derives everything automatically, with `^id` held stable.

### Project
```
explicit :[[X]] on the line
  → else from:[[X]] backref (a moved task keeps its origin project)
  → else path-inferred (see config project_mapping)
  → else null  (orphan — first-class, not an error)
```

### Horizon (the funnel position)
```
the note the LIVE task currently lives in
  → mapped via config horizon_mapping (first match wins)
  → else default horizon
```
Horizon is **where the live line physically is**. Promotion up the funnel =
moving the live line to a more-precise note (project → week → today). This is
identical to the Marvin funnel: backburner/someday → master → week → today →
now (`[/]`). Location *is* the funnel level.

### Area (work / personal — drives day-plan grouping)
```
the task's project's area
  → else path-inferred area
  → else default_area
```

---

## 6. Movement: promote, tombstone, roll-forward

Moving a task is a **single command** (plugin hotkey / GUI action) — never
hand-authored. The six manual steps (copy, edit, link, navigate, paste, mark)
are exactly what the tool automates. If you are hand-writing tombstones, the
tool has failed.

**Promote "Write Bedrock IAM policy doc" from its project to today:**

Before — `Projects/ZeroedIn Bedrock Migration.md`:
```
- [ ] Write Bedrock IAM policy doc !! ~2h  ^iam
```

After the move, the home holds a tombstone:
```
- [>] Write Bedrock IAM policy doc  moved:[[2026-06-16#^iam]]  ^iam
```

And `Daily/2026-06-16.md` holds the live task:
```
- [ ] Write Bedrock IAM policy doc !! ~2h  from:[[ZeroedIn Bedrock Migration]]  ^iam
```

Invariants:
- Same `^id` on both lines. The id is the bond; `from:`/`moved:` are
  human-readable decoration. If a pointer is missing or dangling, the service
  **flags it** rather than silently fixing.
- Exactly one live line (`^iam` is `[>]` at home, `[ ]` in today). One-live-line
  invariant preserved.
- `from:` points to the **original home**, never the intermediate step, so
  chains never grow.

**Roll-forward (end of day):** incomplete `[ ]` tasks in today's note **stay
put** — no auto-move churn. The next planning ritual re-pulls what you still
want. Because `from:` still points to the original home (not yesterday's note),
re-pulling does not lengthen the chain. This matches Sunsama/Marvin: incomplete
work *re-surfaces* for a deliberate re-decision rather than silently migrating.

---

## 7. Recurrence

Templates live in a **designated file** (e.g. `Recurring.md`), which the
indexer treats as templates-only and **non-live** (never appears in the task
pool). No special checkbox state needed.

```
# Recurring.md
- [ ] Daily standup notes  &daily  ^standup
- [ ] Weekly review  &weekly  ^wreview
- [ ] Pay mortgage  &monthly  ^mortgage
```

On the relevant roll-forward, the service **spawns a concrete live instance**
into the target note with a back-reference to the template:

```
# Daily/2026-06-16.md
- [ ] Daily standup notes  from:[[Recurring#^standup]]  ^standup-0616
```

The instance is a normal live task. Completing it informs the template's
history and prevents duplicate spawns for that period. The template line itself
is never actionable.

`&` recurrence vocabulary (Phase 2 detail): `&daily`, `&weekly`, `&monthly`,
`&<weekday>` (e.g. `&mon`), with room to extend.

---

## 8. Configuration

All path→meaning resolution is config-driven. Ships with a sane default that
matches a conventional vault; you customize only where yours diverges.
**Configurable ≠ requires-configuration-to-function.**

```yaml
# horizon: first match wins; default catches everything else
horizon_mapping:
  - match: "Daily/*.md"        # MUST match your Periodic Notes format
    horizon: today
  - match: "Weekly/*.md"
    horizon: week
  - match: "Backburner.md"
    horizon: backburner
  - match: "Projects/**/*.md"
    horizon: someday
  - match: "Areas/**/*.md"
    horizon: someday
  default: someday

# project: capture tokens ({folder}, {filename}) extract the name from the path
project_mapping:
  - match: "Projects/*/*.md"
    project: "{folder}"
  - match: "Projects/*.md"
    project: "{filename}"

# area: drives work/personal grouping in the daily plan
area_mapping:
  - match: "Areas/Work/**"
    area: work
  - match: "Projects/ZeroedIn*/**"
    area: work
  - match: "Areas/Personal/**"
    area: personal
  default_area: personal

# where moves land. {date:...} MUST match your Periodic Notes naming exactly,
# or promoted tasks land in the wrong file.
targets:
  today:     "Daily/{date:YYYY-MM-DD}.md"
  week:      "Weekly/{date:GGGG-[W]WW}.md"

# special behavior beyond defaults
roles:
  templates: ["Recurring.md"]              # never live; spawn instances
  excluded:  ["Archive/**", "Templates/**"] # indexer ignores; keeps index fast,
                                            # prevents archive-resurrection churn
```

### Config change semantics
Because horizon/project/area are **derived**, changing a mapping (or
reorganizing the vault) re-resolves all affected tasks on the next scan. The
Markdown task lines do not change. `^id` stays stable. Config is
non-destructive by construction.

### Explainability (required, not optional)
The service must answer "why is this task here?" e.g.:
```
^iam
  horizon = today    (live line in Daily/2026-06-16.md → rule #1 "Daily/*.md")
  project = ZeroedIn Bedrock Migration   (from: backref)
  area    = work     (project area via "Projects/ZeroedIn*" rule)
  importance = !! 
```
Without this, a flexible mapping becomes an opaque debugging session.

---

## 9. Integrity checks (the service's job)

- A `[>]` tombstone with no `moved:` pointer → **malformed**, flag.
- A `moved:` pointing to a missing/dead `^id` → **broken pointer**, flag.
- Two live (non-`[>]`) lines sharing an `^id` → **invariant violation**, flag
  and surface both for the user to resolve (never auto-pick a winner).
- Reconciliation is always by `^id`, never by text or path. This is what makes
  the archive-folder-resurrection problem tractable: identity survives moves.

---

## 10. Worked scenario — daily planning

Goal: surface a personal important-but-not-urgent task alongside work tasks for
a realistic day plan. (Marvin funnel + Sunsama ritual.)

Homes before planning:

`Areas/Personal.md`
```
- [ ] Renew passport before expiry !  ^pass
- [ ] Research baby gate options
```
`Projects/ZeroedIn Bedrock Migration.md`
```
- [ ] Write Bedrock IAM policy doc !! ~2h  ^iam
- [/] Test Claude Code enterprise rollout ~1h  ^cc
- [ ] Email David re: UniFi for the demo room  ^uni
```
`Daily/2026-06-16.md` (an orphan captured directly here)
```
- [ ] Finish insurance reimbursement form ~45m !  ^ins
```

Morning ritual: pull chosen tasks into today. After planning,
`Daily/2026-06-16.md`:
```
## Today
- [ ] Finish insurance reimbursement form ~45m !  ^ins
- [ ] Write Bedrock IAM policy doc !! ~2h  from:[[ZeroedIn Bedrock Migration]]  ^iam
- [/] Test Claude Code enterprise rollout ~1h  from:[[ZeroedIn Bedrock Migration]]  ^cc
- [ ] Renew passport before expiry !  from:[[Personal]]  ^pass
```
Homes now hold tombstones for the pulled tasks; `^uni` and "baby gate" stay
home at `someday`.

What the planner shows:
- **One unified day-plan** mixing work + personal, source-labeled via `from:`,
  groupable by area — the Sunsama cross-source view.
- **Capacity check:** `~45m + ~2h + ~1h = 3h45m` of estimated work vs. your
  available hours → the realism warning. `^pass` is unestimated → planner
  prompts for an estimate or flags it.
- The **personal important task** entered the day only because you chose it
  (Marvin: pull from pool, not deadline-forced), and now sits next to work.

---

## Open questions for Phase 0 testing

Test this grammar against ~12 real tasks from your vault and check:

1. Do the importance tiers (`!`/`!!`/`!!!`) map to distinctions you actually
   make, or is it really just two tiers?
2. Does the `:[[X]]` project-override ever collide with how you write prose
   links in practice?
3. Are there capture locations not covered by the horizon_mapping that would
   hit `default: someday` when you'd want otherwise?
4. Does "incomplete tasks stay put" feel right after a real day, or do you want
   a visible "carried over" marker on re-pull?
5. Any task shape in your real notes that doesn't fit this grammar at all?
   (Those are the valuable breakages.)

---

## Phasing (for reference)

- **Phase 0 (this doc):** freeze grammar + config, test against real notes.
- **Phase 1:** read-only service — watch files → SQLite → fast funnel + daily
  planning GUI. Editing still happens in Obsidian. No write-back risk.
- **Phase 2:** write-back — promote/move/tombstone command, roll-forward,
  recurrence expansion. The companion plugin makes pointers/moves a one-gesture
  action inside Obsidian.

Architectural rule held throughout: the service reads/writes **files**, never
talks to Obsidian or to the sync layer (LiveSync/Syncthing) directly. "Obsidian
is open on the same box" is incidental in Phase 1; migrating to a headless host
is then just running it elsewhere.
