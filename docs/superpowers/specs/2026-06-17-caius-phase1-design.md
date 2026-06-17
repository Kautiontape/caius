---
title: Caius — Phase 1 Design (read+index+plan service)
status: draft
date: 2026-06-17
supersedes: none
derives_from: TaskEngine-Spec.md (Phase 0 grammar, real name "Caius")
target_vault: /home/shawn/documents/obsidian/Main
---

# Caius — Phase 1 Design

Caius is a Markdown-canonical task system. Tasks live as plain checkboxes inside
existing Obsidian notes. A separate service indexes them into SQLite for fast
querying and a Sunsama-style planning GUI. **Markdown on disk is the single
source of truth; SQLite is a derived index.**

This document is the implementation design for **Phase 1**: a read-only service
that watches files → indexes to SQLite → serves a funnel + daily-planning web
GUI. No write-back. Editing still happens in Obsidian. It builds on the Phase 0
grammar in `TaskEngine-Spec.md`, with the grammar gaps resolved below against the
real vault.

---

## 1. Decisions log (resolved during audit)

The Phase 0 spec was audited against the real vault (`02 - Periodic`,
`10 - Project`, `20 - Area`, … — Johnny-Decimal layout; ~6,143 checkbox lines
across 650 files). Findings and resolutions:

| # | Finding | Decision |
|---|---------|----------|
| D1 | Vault actively uses `[!]`×99, `[?]`×90, `[*]`×66 + long tail — beyond the spec's 5 states. | **Strict 5 states** (`[ ] [/] [x] [-] [>]`). Any other glyph line is **not a task** — not indexed, not flagged. |
| D2 | 151 `[>]` lines are Tasks-plugin "forwarded" markers with **no** `moved:` pointer. | **Tolerate as legacy.** Pointerless `[>]` = non-Caius forward: terminal, non-live, **not flagged**. Only flag a `[>]` whose `moved:` pointer is present-but-broken. |
| D3 | Tags/area "not essential" for this build; area will likely derive from files later. | **Area deferred.** No `area` axis shipped in Phase 1; day-plan is not grouped by area yet. |
| D4 | Vault uses numbered folders, not `Daily/`, `Projects/`, `Areas/`. | Rewrite all config globs for the real layout (§7). |
| D5 | `^id` is used 2,060× as block-ref anchors. Obsidian block ids are **note-scoped**, but Caius treats `^id` as **vault-global** identity. | Global reconciliation, but duplicate-live-`^id` is **informational** (surface both, never auto-pick); explain output shows the collision so the user judges. Caius-generated ids must be vault-unique (Phase 2 concern). |
| D6 | `:[[` override sigil appears only 2× vault-wide, both in non-task contexts. `moved:`/`from:`/`&` unused. | Grammar is effectively collision-free in this vault. Right-to-left trailing-token scan confirmed mandatory. |
| D7 | Tech stack / scope / GUI / parser. | **Full Phase 1**, **TypeScript/Node monorepo**, **hand-written line scanner**, **local web app**. Test against a **git clone of the real vault** in a gitignored dir. |
| D8 | Funnel must follow Marvin; Monthly is one step up; current vs future month differ; past tasks must resurface; Inbox isn't a funnel stage. | **Date-relative horizon.** Periodic notes are classified by the date in their filename vs *now*: current→its level, future→one level broader, past→**`overdue`** lane. Levels: `overdue → today → week → orbit → planning_ahead → someday`; `now` = `[/]` view. **`01 - Inbox` excluded** from indexing. |
| D9 | Workday length is personal. | **`capacity.workday_minutes` is user-configured**; no baked-in default assumed. |

### Phase-0 empirical findings (M1 corpus smoke over the real-vault clone)
Parsing all 2,622 notes / **5,574 tasks** with zero crashes:
- **No task carries a `^id`** (0 of 5,574). The 2,060 `^id` anchors in the vault
  are all on **non-task** blocks (link targets like `… ^tv5bZRxB`). ⇒ D5
  reconciliation is dormant until Caius mints task ids (Phase 2); those existing
  anchors are a **collision hazard** for future id generation (must avoid reuse).
- **Tokens are almost unused today**: 19 estimates, everything else 0 (`from:`/
  `moved:`/`:[[`/`*`/`done:`/trailing-`!` are net-new). The vault is overwhelmingly
  **bare checkboxes** — confirming the "bare `- [ ]` is always valid" core is the
  right bet, and that **horizon-by-location is the highest-value axis** for the
  current vault (most metadata will be derived, not typed).
- Structure is real: 1,011 subtasks, 305 tasks with attached notes — the nesting
  parser earns its keep. States: done 3445 · open 1182 · cancelled 767 ·
  tombstone 146 · in_progress 34.

---

## 2. Architecture

TypeScript/Node monorepo. Dependencies flow **downward only**; `core` is pure
(no I/O) and is the unit the future Obsidian plugin will also import, so the
grammar exists exactly once.

```
packages/
  core/     grammar + parser + data model        (pure; no I/O)
  resolve/  horizon/project/area + provenance     (config-driven, explainable)
  index/    SQLite schema + full-vault scan +
            global ^id reconciliation + integrity flags
  watch/    chokidar → incremental re-index
  api/      HTTP/JSON: tasks, funnel, day-plan, explain, flags
  gui/      web SPA: Marvin funnel + Sunsama day-plan
  cli/      `caius scan`, `caius explain <^id>`, `caius serve`
```

### Build order & milestones
- **M1 — `core`**: parser + data model + golden/adversarial fixtures → grammar validated.
- **M2 — `resolve`**: config schema + the three axes + provenance.
- **M3 — `index`**: SQLite schema + full scan + reconciliation + flags.
  ⇒ **`caius scan <vault>`** runs end-to-end: a working **Phase-0 grammar
  validator** over the real-vault clone. First useful artifact; de-risks the
  grammar before any GUI exists.
- **M4 — `watch`**: incremental re-index on file change.
- **M5 — `api`**: read-only query endpoints.
- **M6 — `gui`**: funnel + day-plan + capacity + explain panels.

Phases M1–M3 deliver the Phase-0 deliverable the original spec asked for;
M4–M6 complete Phase 1.

---

## 3. The grammar (concrete — resolves every Phase-0 ambiguity)

### 3.1 Task line recognition
```
^(\s*)([-*+])\s+\[(.)\]\s+(.*)$
   indent  marker   state   rest
```
- **Markers:** `-`, `*`, `+` all accepted. (Ordered `1.` lists are **not** tasks in Phase 1.)
- **State set (strict, D1):** the captured glyph must be one of
  `' '`, `'/'`, `'x'`, `'-'`, `'>'` (case-insensitive `x`/`X`). Any other glyph
  ⇒ **not a task**; the line is ignored as a task. If it is nested under a task,
  it becomes attached **note** content (§3.6), never a task.

| state | glyph | live | terminal | notes |
|-------|-------|------|----------|-------|
| open        | `[ ]` | ✓ | | actionable |
| in-progress | `[/]` | ✓ | | "now" |
| done        | `[x]` | | ✓ | may carry `done:`; absence **allowed** on read |
| cancelled   | `[-]` | | ✓ | |
| tombstone/forward | `[>]` | | ✓ | `moved:` optional (D2) |

### 3.2 Block id (`^id`)
- Charset: `\^[A-Za-z0-9_-]+`.
- Taken as the **trailing** `^token` that is **not inside** `[[…]]` — so a line
  like `… moved:[[2026-06-16#^iam]] ^iam` yields block id `iam`, and the `#^iam`
  inside the wikilink is part of the `moved:` token, not the id.
- Stripped first (before token scanning), via `\s+(\^[A-Za-z0-9_-]+)\s*$`.
- Identity is **vault-global** for reconciliation (D5).

### 3.3 Trailing-token zone — right-to-left scan
The boundary between freeform `TEXT` and tokens is defined operationally:

```
rest := line after "[state] "
strip trailing block id (3.2)
loop:
  try each token pattern, right-anchored, against the current end of `rest`
  (most-specific prefixes first; patterns are bracket-aware)
  if one matches: consume it (+ its leading whitespace), record token, continue
  else: break
TEXT := what remains (trimmed). tokens := recorded, in source order.
```
Consequences (the "whitespace-delimited" rule keeps false positives rare):
- `- [ ] Call mom!` → `!` is glued to a word (no space) ⇒ **stays prose**. Safe.
- `- [ ] Renew passport !` → space-separated trailing `!` ⇒ importance (the
  accepted false-positive shape; rare in practice).
- `- [ ] Buy milk ~2h then eggs` → `~2h` is **mid-line**, not trailing ⇒ prose. Correct.

### 3.4 Token catalog (exact)
Patterns are right-anchored and tried in this order each loop iteration:

| token | pattern (anchored at end of `rest`) | parse |
|-------|-------------------------------------|-------|
| moved (fwd ptr) | `\s+moved:\[\[[^\]]+#\^[A-Za-z0-9_-]+\]\]$` | target note + `#^id` |
| from (backref)  | `\s+from:\[\[[^\]]+\]\]$` | origin note (may include `#^id`) |
| project override| `\s+:\[\[[^\]]+\]\]$` | project name (bracket-aware; multi-word OK) |
| recurrence (P2) | `\s+&[A-Za-z]+$` | recurrence keyword (parsed, inert in P1) |
| estimate        | `\s+~(\d+h\d+m|\d+h|\d+m)$` | → minutes |
| due date        | `\s+\*(\d{4}-\d{2}-\d{2})$` | ISO date |
| done date       | `\s+done:(\d{4}-\d{2}-\d{2})$` | ISO date |
| importance      | `\s+(!{1,3})$` | tier = count |

Notes:
- **Bracket-aware:** `:[[Multi Word Project]]` and `moved:[[…]]` may contain
  internal spaces; the pattern consumes back to `[[`. The naive "last
  whitespace field" approach is **wrong** and must not be used.
- `:\[\[` is tried **after** `moved:`/`from:` so it never mis-captures their tails.
- **Estimate grammar (canonical):** `~2h`, `~30m`, `~1h30m`. (`~1.5h` is **not**
  supported in Phase 1; if seen, it fails to match and falls to TEXT.) Convert to
  minutes for capacity.
- `from:` is **overloaded** (move-backref vs recurrence-template). Disambiguated
  by whether the target file is in `roles.templates` (§7). In Phase 1 no file is
  a template, so all `from:` are treated as move-backrefs.

### 3.5 Tags (D3 — area deferred)
Inline `#tag` tokens anywhere on the task line are still **collected** into
`Task.tags` (cheap, useful later), but **no `area` axis is derived from them in
Phase 1**. Area resolution is deferred entirely (likely file-derived later).

### 3.6 Nesting — subtask vs note
The parse unit is a **task block**: the task line plus all lines indented under
it, up to the next same-or-shallower task line.
- **Indentation = column count**, tabs expanded with `indent.tab_width`
  (config, default 4). Stack-based: a child has strictly greater column indent
  than its parent. Robust to the vault's mixed tab/space indentation.
- A nested line that **is itself a task** (matches §3.1 with a 5-set state) ⇒
  **subtask** (own state, own optional `^id`).
- Any other nested non-blank line (`-`/`*`/`+` bullet without a valid task
  checkbox, `>` quote, plain text, or a checkbox with a non-5-set glyph) ⇒
  **note** attached to the nearest ancestor task. Never a task.
- **Parent completion** (read-only fact in P1): surfaced but not enforced;
  cascade is a Phase 2 write action.

---

## 4. Data model (`core`)

```ts
type State = 'open' | 'in_progress' | 'done' | 'cancelled' | 'tombstone';

interface Task {
  // identity / location
  blockId: string | null;      // ^id without caret; null if none
  file: string;                // vault-relative path
  line: number;                // 0-based line of the task line
  // parse
  state: State;
  live: boolean;               // open | in_progress
  text: string;                // freeform TEXT (post right-scan)
  tokens: Token[];             // raw + typed, in source order
  importance: 0 | 1 | 2 | 3;
  estMinutes: number | null;
  due: string | null;          // ISO
  done: string | null;         // ISO
  projectOverride: string | null;  // from :[[X]]
  from: Ref | null;            // origin note (+ optional #^id)
  moved: Ref | null;           // forward pointer (note + #^id)
  tags: string[];
  // structure
  parentBlockKey: string | null;   // (file,line) key of parent task, if nested
  // derived (filled by resolve)
  horizon?: Derived; project?: Derived; area?: Derived;
  // notes attached under this task
  notes: string[];
}

interface Derived { value: string | null; rule: string; source: string; }
interface Ref { note: string; blockId: string | null; raw: string; }
interface Token { kind: string; raw: string; }
```
`Derived` carries **provenance** (the rule that fired + its source) — required
for explainability, not optional.

---

## 5. Resolution engine (`resolve`)

Two shipped axes (project, horizon); **explicit beats inferred**; every result
records the rule that produced it. **Area is deferred** (D3) — not resolved.

**Project**
```
:[[X]] on the line
  → else from:[[X]] origin's project (moved task keeps origin project)
  → else path-inferred via project_mapping
  → else null  (orphan — first-class, not an error)
```

**Horizon (date-relative, D8).** First matching `horizon_mapping` rule wins.
A static rule maps a folder straight to a level (Projects/Areas → `someday`).
A **periodic** rule carries a `date` format; the resolver parses the period out
of the note's filename, compares it to *now* at that granularity, and picks:

```
period vs now    Daily          Weekly         Monthly
  current     →  today          week           orbit
  future      →  week           orbit          planning_ahead   (one level broader)
  past        →  overdue        overdue        overdue
```
`now` is not a stored horizon — it is a derived view = live tasks in state
`in_progress` (`[/]`), surfaced regardless of location. Funnel display order:
`overdue · today · week · orbit · planning_ahead · someday` (+ a `now` lane).
Every horizon records provenance, e.g. *"orbit (Monthly rule, current month
2026-06)"*.

---

## 6. Indexer (`index`) + SQLite schema

Full-vault scan builds the derived index. Identity reconciliation is **global by
`^id`**, run after all files are parsed.

```sql
CREATE TABLE files (
  path TEXT PRIMARY KEY, mtime INTEGER, hash TEXT, scanned_at INTEGER
);
CREATE TABLE tasks (
  rowid INTEGER PRIMARY KEY,
  block_id TEXT,                 -- nullable
  file TEXT, line INTEGER,
  state TEXT, live INTEGER,
  text TEXT, importance INTEGER,
  est_minutes INTEGER, due TEXT, done TEXT,
  project TEXT, horizon TEXT, area TEXT,
  parent_rowid INTEGER
);
CREATE TABLE derivations (   -- explainability provenance
  task_rowid INTEGER, axis TEXT, value TEXT, rule TEXT, source TEXT
);
CREATE TABLE tokens (task_rowid INTEGER, kind TEXT, raw TEXT);
CREATE TABLE flags  (task_rowid INTEGER, kind TEXT, detail TEXT, severity TEXT);
CREATE INDEX tasks_block_id ON tasks(block_id);
CREATE INDEX tasks_horizon  ON tasks(horizon, live);
```

### Reconciliation & integrity checks
- **Group live tasks by `block_id`.** ≥2 live lines sharing an id ⇒
  `invariant_violation` flag, **informational**, both surfaced (never auto-pick).
  Note (D5): legacy note-scoped ids can collide benignly — explain output shows
  both so the user judges.
- `[>]` with a present-but-**broken** `moved:` (target `#^id` not found) ⇒
  `broken_pointer`. Pointerless `[>]` ⇒ **no flag** (D2).
- `moved:`/`from:` whose target **note** doesn't exist ⇒ `dangling_ref` (warn).
- Reconciliation is **always by `^id`**, never text or path.

Non-task glyph lines (D1) and emoji/Dataview metadata produce **no flags** —
they are simply unparsed (emoji/Dataview become prose; non-5-set glyphs aren't
tasks).

---

## 7. Configuration (concrete, this vault)

```yaml
indent:
  tab_width: 4

capacity:
  workday_minutes: 480           # user-configurable; day-plan realism check (D9)

horizon_mapping:                 # first match wins
  # periodic rules: classify by the date in the filename vs *now* (D8)
  - match: "02 - Periodic/Daily/**/*.md"
    date: "YYYY-MM-DD"           # parsed from leaf filename; compared per-day
    by_date: { current: today, future: week,           past: overdue }
  - match: "02 - Periodic/Weekly/**/*.md"
    date: "GGGG-[W]WW"           # compared per-ISO-week
    by_date: { current: week,  future: orbit,          past: overdue }
  - match: "02 - Periodic/Monthly/**/*.md"
    date: "YYYY-MM"              # compared per-month
    by_date: { current: orbit, future: planning_ahead, past: overdue }
  # static rules
  - { match: "10 - Project/**/*.md", horizon: someday }
  - { match: "20 - Area/**/*.md",    horizon: someday }
  default: someday

project_mapping:
  - { match: "10 - Project/*/**/*.md", project: "{seg1}" }  # 1st seg after prefix
  - { match: "10 - Project/*.md",      project: "{filename}" }

# area_mapping: deferred (D3) — no area axis in Phase 1

targets:                         # Phase 2 (move destinations); defined now
  today: "02 - Periodic/Daily/{date:YYYY}/{date:MM}/{date:YYYY-MM-DD}.md"
  week:  "02 - Periodic/Weekly/{date:YYYY}/{date:GGGG-[W]WW}.md"

roles:
  templates: []                  # recurrence is Phase 2
  excluded:
    - "01 - Inbox/**"            # capture zone — skipped from indexing (D8)
    - "30 - Resources/**"
    - "80 - Archive/**"
    - "90 - Maintenance/**"
    - "91 - Testing/**"
    - "95 - System/**"
    - "99 - Scripts/**"
    - "99 - Templates/**"
    - ".obsidian/**"
    - ".trash/**"
```

**Glob semantics:** vault-relative POSIX paths; `*` = one segment, `**` =
any depth; case-sensitive; first match wins. **Capture tokens:** `{seg1}` = first
path segment after the matched literal prefix; `{filename}` = leaf without `.md`;
`{folder}` = immediate parent dir name; `{date:…}` uses date-fns tokens (incl.
ISO `GGGG`/`WW`). A periodic rule's `date` is matched against the note's leaf
filename to recover the period, then compared to *now* at that rule's granularity
(day / ISO-week / month) to pick `current`/`future`/`past`. Config is
**non-destructive**: changing it re-derives on next scan; Markdown lines and
`^id` never change.

### Funnel order
`overdue → today → week → orbit → planning_ahead → someday`, with a cross-cutting
`now` lane = live `[/]` in-progress tasks (any location). `orbit`/`planning_ahead`
are the Marvin "this month / planning ahead" levels; `overdue` collects live
tasks stranded in any past periodic note; `01 - Inbox` is excluded entirely.

---

## 8. Watcher (`watch`)
chokidar watches the vault root (honoring `roles.excluded`). On change: re-parse
the touched file, update its `tasks`/`tokens`/`flags`/`derivations` rows, then
re-run **global reconciliation** (cheap: a grouped query over `block_id`).
Debounced to coalesce editor save bursts.

## 9. API (`api`, read-only)
- `GET /tasks?horizon=&project=&live=&state=` — filtered list.
- `GET /funnel` — counts per horizon (`overdue…someday`) + the `now` lane.
- `GET /day-plan?date=YYYY-MM-DD` — that day's live tasks (grouped by project,
  area deferred), with capacity: `sum(est_minutes)` vs `capacity.workday_minutes`;
  unestimated tasks listed for an estimate prompt.
- `GET /explain/:blockId` — provenance for horizon/project + importance.
- `GET /flags` — integrity issues, grouped by kind/severity.

## 10. GUI (`gui`, local web app)
`caius serve` → `http://localhost:7777`. Read-only (editing stays in Obsidian).
- **Funnel** column view with counts: `now`, `overdue`, `today`, `week`,
  `orbit`, `planning_ahead`, `someday`. The `overdue` lane is visually marked.
- **Day-plan**: today's live tasks (grouped by project for now; area deferred);
  **capacity bar** (estimated vs `workday_minutes`); source label via `from:`;
  unestimated → prompt chip.
- **Explain** panel: click a task → why this horizon/project.
- **Flags** panel: integrity issues.

---

## 11. Test strategy
- **Unit (golden + adversarial fixtures):** every spec example + breakage cases:
  URLs/times/code-spans in TEXT, multi-word `:[[ ]]`/`moved:` tokens, the
  double-`^iam` move line, trailing-`!` false positive, mixed tab/space nesting,
  subtask-vs-note, non-5-set glyph children, `[x]` without `done:`.
- **Integration:** `caius scan` over a **git clone of the real vault** in a
  gitignored dir (`./.testvault/` via `git clone /home/shawn/documents/obsidian/Main`),
  read-only. Assert: no crashes; produce report; track parse coverage + flag
  counts as a regression baseline. Refresh by re-clone (original never touched).
- **Performance:** cold scan of 650 files / ~6.1k tasks within a target
  (initial budget: < 2s) using `better-sqlite3` (sync) + a single transaction.

---

## 12. Non-goals (Phase 1) / deferred
- **No write-back of any kind** — no promote/move/tombstone, no roll-forward, no
  recurrence expansion, no parent-completion cascade. All **Phase 2**.
- **No Obsidian plugin** — Phase 2 (will import `core`).
- **No `area` axis** (D3) — tags are still collected, but area is unresolved and
  the day-plan is grouped by project for now.
- `&` recurrence tokens are parsed but inert.
- `~1.5h` fractional estimates — unsupported for now.

### Open items to confirm in review
1. **Future near-term notes:** the explicit rule is future-Monthly → `planning_ahead`.
   I generalized future-Daily → `week` and future-Weekly → `orbit` ("one level
   broader"). Confirm, or should future Daily/Weekly behave differently (rare case).
2. **`now` lane:** treated as a derived view over `[/]` in-progress tasks rather
   than a stored horizon. Confirm that's the intended Marvin "now".
