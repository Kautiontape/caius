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
| D3 | Spec's `area` axis = work/personal; vault `20 - Area/` = PARA topics (different concept). | **Area is tag-driven only.** No path inference, no default. Area present iff a configured tag is on the task; absent otherwise. |
| D4 | Vault uses numbered folders, not `Daily/`, `Projects/`, `Areas/`. | Rewrite all config globs for the real layout (§7). |
| D5 | `^id` is used 2,060× as block-ref anchors. Obsidian block ids are **note-scoped**, but Caius treats `^id` as **vault-global** identity. | Global reconciliation, but duplicate-live-`^id` is **informational** (surface both, never auto-pick); explain output shows the collision so the user judges. Caius-generated ids must be vault-unique (Phase 2 concern). |
| D6 | `:[[` override sigil appears only 2× vault-wide, both in non-task contexts. `moved:`/`from:`/`&` unused. | Grammar is effectively collision-free in this vault. Right-to-left trailing-token scan confirmed mandatory. |
| D7 | Tech stack / scope / GUI / parser. | **Full Phase 1**, **TypeScript/Node monorepo**, **hand-written line scanner**, **local web app**. Test against a **git clone of the real vault** in a gitignored dir. |

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
Consequences (accepted false positives, per Phase 0):
- `- [ ] Call mom!` → importance `!` (trailing `!` parses). Accepted.
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

### 3.5 Tags (area source, D3)
Inline `#tag` tokens anywhere on the task line are collected. Area resolves from
the **first** tag matching a configured `area_mapping.tags` entry; else area is
absent. (Phase 1 reads inline tags on the task line only; frontmatter/note-level
tag inheritance is deferred.)

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

Three independent axes, each a precedence chain; **explicit beats inferred**;
every result records the rule that produced it.

**Project**
```
:[[X]] on the line
  → else from:[[X]] origin's project (moved task keeps origin project)
  → else path-inferred via project_mapping
  → else null  (orphan — first-class, not an error)
```
**Horizon** = where the **live** line physically is, mapped via `horizon_mapping`
(first match wins) → else `default`.

**Area** (D3, tag-driven)
```
first task tag matching area_mapping.tags
  → else null   (no path inference, no default)
```

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

horizon_mapping:                # first match wins
  - { match: "02 - Periodic/Daily/**/*.md",   horizon: today }
  - { match: "02 - Periodic/Weekly/**/*.md",  horizon: week }
  - { match: "02 - Periodic/Monthly/**/*.md", horizon: month }   # added level
  - { match: "01 - Inbox/**/*.md",            horizon: inbox }
  - { match: "10 - Project/**/*.md",          horizon: someday }
  - { match: "20 - Area/**/*.md",             horizon: someday }
  default: someday

project_mapping:
  - { match: "10 - Project/*/**/*.md", project: "{seg1}" }  # 1st seg after prefix
  - { match: "10 - Project/*.md",      project: "{filename}" }

area_mapping:                   # tag-driven only (D3)
  tags: { "#work": work, "#personal": personal }   # absent if no tag

targets:                        # Phase 2 (move destinations); defined now
  today: "02 - Periodic/Daily/{date:YYYY}/{date:MM}/{date:YYYY-MM-DD}.md"
  week:  "02 - Periodic/Weekly/{date:YYYY}/{date:GGGG-[W]WW}.md"

roles:
  templates: []                                  # recurrence is Phase 2
  excluded:
    - "80 - Archive/**"
    - "99 - Templates/**"
    - "95 - System/**"
    - ".obsidian/**"
    - ".trash/**"
```

**Glob semantics:** vault-relative POSIX paths; `*` = one segment, `**` =
any depth; case-sensitive; first match wins. **Capture tokens:** `{seg1}` = first
path segment after the matched literal prefix; `{filename}` = leaf without `.md`;
`{folder}` = immediate parent dir name; `{date:…}` uses date-fns tokens (incl.
ISO `GGGG`/`WW`). Config is **non-destructive**: changing it re-derives on next
scan; Markdown lines and `^id` never change.

### Funnel order
`inbox → someday → month → week → today → now ([/])`. `month` and `inbox` are
additions to the spec's funnel to cover the vault's Monthly periodics and Inbox.
(Confirm during review.)

---

## 8. Watcher (`watch`)
chokidar watches the vault root (honoring `roles.excluded`). On change: re-parse
the touched file, update its `tasks`/`tokens`/`flags`/`derivations` rows, then
re-run **global reconciliation** (cheap: a grouped query over `block_id`).
Debounced to coalesce editor save bursts.

## 9. API (`api`, read-only)
- `GET /tasks?horizon=&project=&area=&live=&state=` — filtered list.
- `GET /funnel` — counts per horizon (+ `now` = in_progress).
- `GET /day-plan?date=YYYY-MM-DD` — that day's live tasks, grouped by area tag,
  with capacity: `sum(est_minutes)` vs `capacity.available_minutes`; unestimated
  tasks listed for an estimate prompt.
- `GET /explain/:blockId` — provenance for horizon/project/area + importance.
- `GET /flags` — integrity issues, grouped by kind/severity.

## 10. GUI (`gui`, local web app)
`caius serve` → `http://localhost:7777`. Read-only (editing stays in Obsidian).
- **Funnel** column view (inbox…now) with counts.
- **Day-plan**: today's live tasks grouped by area tag; **capacity bar**
  (estimated vs available); source label via `from:`; unestimated → prompt chip.
- **Explain** panel: click a task → why this horizon/project/area.
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
- `&` recurrence tokens are parsed but inert.
- Frontmatter/note-level tag inheritance for area — deferred.
- `~1.5h` fractional estimates — unsupported for now.

### Open items to confirm in review
1. `month` and `inbox` as funnel levels (vs folding Monthly/Inbox into someday).
2. Area-tag vocabulary (`#work`/`#personal` or others) — defaults to empty until set.
3. Capacity `available_minutes` default (e.g. 6h work day).
4. Whether `30 - Resources`, `90 - Maintenance`, `91 - Testing`, `99 - Scripts`
   should be excluded or indexed as `someday` (currently: indexed via `default`).
