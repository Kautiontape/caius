# Caius Planning UX — Phase 1 (Quick Wins) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four no-layout-change readability/feedback fixes from the user-testing spec — render markdown in titles (P7), clean Zettel filenames (P8), live capture parse preview (P9), and a pre-commit confirmation summary + toast (P6).

**Architecture:** Follow the existing GUI convention — put logic in pure, unit-tested `lib/*` functions and keep components thin (the codebase tests libs, not components). P9 reuses the canonical `scanTokens` parser from `@caius/core` (pure, browser-safe) rather than duplicating the grammar. No engine/API/layout changes in this phase.

**Tech Stack:** React 18 + Vite + Tailwind (`packages/gui`), Vitest. Tests run with `corepack pnpm exec vitest run <path>`. Source aliases (`@caius/*` → `src`) are configured in `vitest.config.ts`.

**Scope note / deferrals:** P14 (virtualization) is deferred to Phase 3 (it should land with the rewritten source list). The capture "↳ lands in <tier>" line is deferred to Phase 4 (it depends on P10 date-placement). The planning commit remains log-only (real disk write-back is the separate Phase-2 roadmap item) — P6 here adds the confirmation UX and reflects the reconcile result honestly.

---

## File Structure

- `packages/gui/src/lib/inline.ts` (new) — `parseInline(text)` → markdown segments. Pure. (P7)
- `packages/gui/src/lib/inline.test.ts` (new) — tests for `parseInline`. (P7)
- `packages/gui/src/components/InlineText.tsx` (new) — thin renderer for segments. (P7)
- `packages/gui/src/lib/grouping.ts` (modify) — add `stripZettelPrefix` + `displayPath`; clean `documentTitle`. (P8)
- `packages/gui/src/lib/grouping.test.ts` (modify) — add prefix/path cases. (P8)
- `packages/gui/src/components/TaskCard.tsx` (modify) — use `InlineText` for title; `displayPath` for chip. (P7, P8)
- `packages/gui/src/lib/capturePreview.ts` (new) — `previewCapture(input)` via `@caius/core` `scanTokens`. (P9)
- `packages/gui/src/lib/capturePreview.test.ts` (new) — preview tests. (P9)
- `packages/gui/package.json` (modify) — add `@caius/core` workspace dep. (P9)
- `packages/gui/src/components/QuickAdd.tsx` (modify) — render the chip strip. (P9)
- `packages/gui/src/lib/commitSummary.ts` (new) — `summarizeBuffer(buffer)`. Pure. (P6)
- `packages/gui/src/lib/commitSummary.test.ts` (new) — summary tests. (P6)
- `packages/gui/src/components/CommitSummaryModal.tsx` (new) — confirm dialog. (P6)
- `packages/gui/src/components/PlanBoard.tsx` (modify) — gate commit on the modal; toast outcome. (P6)
- `packages/gui/src/App.tsx` (modify) — `onCommit` returns the `CommitResult`. (P6)

---

## Task 1: Render markdown in titles (P7)

**Files:**
- Create: `packages/gui/src/lib/inline.ts`
- Test: `packages/gui/src/lib/inline.test.ts`
- Create: `packages/gui/src/components/InlineText.tsx`
- Modify: `packages/gui/src/components/TaskCard.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/gui/src/lib/inline.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseInline } from './inline';

describe('parseInline', () => {
  it('returns one text segment when there is no markdown', () => {
    expect(parseInline('Plain task title')).toEqual([{ kind: 'text', text: 'Plain task title' }]);
  });

  it('extracts a link as display text + href, keeping surrounding text', () => {
    expect(parseInline('Reply to [email](https://x.test/a) about it')).toEqual([
      { kind: 'text', text: 'Reply to ' },
      { kind: 'link', text: 'email', href: 'https://x.test/a' },
      { kind: 'text', text: ' about it' },
    ]);
  });

  it('extracts bold and inline code', () => {
    expect(parseInline('Do **now** with `npm run`')).toEqual([
      { kind: 'text', text: 'Do ' },
      { kind: 'bold', text: 'now' },
      { kind: 'text', text: ' with ' },
      { kind: 'code', text: 'npm run' },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm exec vitest run packages/gui/src/lib/inline.test.ts`
Expected: FAIL — `Failed to resolve import "./inline"` / `parseInline is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/gui/src/lib/inline.ts`:

```ts
export type InlineSeg =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'bold'; text: string }
  | { kind: 'code'; text: string };

// One left-to-right pass: links [t](url), bold **t**, inline code `t`. No nesting.
const PATTERN = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;

export function parseInline(input: string): InlineSeg[] {
  const segs: InlineSeg[] = [];
  let last = 0;
  for (const m of input.matchAll(PATTERN)) {
    const i = m.index ?? 0;
    if (i > last) segs.push({ kind: 'text', text: input.slice(last, i) });
    if (m[1] !== undefined) segs.push({ kind: 'link', text: m[1], href: m[2]! });
    else if (m[3] !== undefined) segs.push({ kind: 'bold', text: m[3] });
    else if (m[4] !== undefined) segs.push({ kind: 'code', text: m[4] });
    last = i + m[0].length;
  }
  if (last < input.length) segs.push({ kind: 'text', text: input.slice(last) });
  return segs;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm exec vitest run packages/gui/src/lib/inline.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Create the thin renderer component**

Create `packages/gui/src/components/InlineText.tsx`:

```tsx
import { Fragment } from 'react';
import { parseInline } from '../lib/inline';

/** Render a task title with inline markdown (links / bold / code). Display only —
 * the canonical task text is never mutated. */
export function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((s, i) => {
        if (s.kind === 'link')
          return (
            <a
              key={i}
              href={s.href}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-accent underline decoration-dotted hover:opacity-80"
            >
              {s.text}
            </a>
          );
        if (s.kind === 'bold') return <strong key={i}>{s.text}</strong>;
        if (s.kind === 'code')
          return <code key={i} className="rounded bg-panel px-1 text-[0.92em]">{s.text}</code>;
        return <Fragment key={i}>{s.text}</Fragment>;
      })}
    </>
  );
}
```

- [ ] **Step 6: Use it in TaskCard**

In `packages/gui/src/components/TaskCard.tsx`, add the import after the existing imports (near line 3):

```tsx
import { InlineText } from './InlineText';
```

Then replace the title expression (currently `{task.text || '(untitled)'}` inside the title `<div>`, around line 36) with:

```tsx
{task.text ? <InlineText text={task.text} /> : '(untitled)'}
```

- [ ] **Step 7: Verify the build type-checks**

Run: `corepack pnpm --filter @caius/gui exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/gui/src/lib/inline.ts packages/gui/src/lib/inline.test.ts \
  packages/gui/src/components/InlineText.tsx packages/gui/src/components/TaskCard.tsx
git commit -m "gui: Render inline markdown (links/bold/code) in task titles"
```

---

## Task 2: Clean Zettel filenames (P8)

**Files:**
- Modify: `packages/gui/src/lib/grouping.ts`
- Modify: `packages/gui/src/lib/grouping.test.ts`
- Modify: `packages/gui/src/components/TaskCard.tsx`

- [ ] **Step 1: Write the failing test**

In `packages/gui/src/lib/grouping.test.ts`, first extend the existing import (currently `import { documentTitle, groupSource } from './grouping';`) to:

```ts
import { documentTitle, groupSource, stripZettelPrefix, displayPath } from './grouping';
```

Then append this block to the file:

```ts
describe('stripZettelPrefix / displayPath', () => {
  it('strips a 12–14 digit timestamp id prefix', () => {
    expect(stripZettelPrefix('20240816123018 - Questions for AWS Team')).toBe('Questions for AWS Team');
  });

  it('leaves names without a timestamp prefix untouched', () => {
    expect(stripZettelPrefix('Project Priorities')).toBe('Project Priorities');
  });

  it('documentTitle drops folder, extension, and timestamp prefix', () => {
    expect(documentTitle('10 - Project/Foo/20240816123018 - Questions for AWS Team.md'))
      .toBe('Questions for AWS Team');
  });

  it('displayPath keeps the folder but cleans the basename', () => {
    expect(displayPath('10 - Project/Foo/20240816123018 - Questions for AWS Team.md'))
      .toBe('10 - Project/Foo/Questions for AWS Team');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm exec vitest run packages/gui/src/lib/grouping.test.ts`
Expected: FAIL — `stripZettelPrefix is not a function` / `displayPath is not a function`.

- [ ] **Step 3: Write the implementation**

In `packages/gui/src/lib/grouping.ts`, add the helper above `documentTitle` and update `documentTitle`, then add `displayPath`:

```ts
/** Strip a leading Obsidian Zettelkasten timestamp id ("20240816123018 - ") from a
 * display name. Matches 12–14 leading digits followed by " - ". */
export function stripZettelPrefix(name: string): string {
  return name.replace(/^\d{12,14} - /, '');
}

export function documentTitle(file: string): string {
  const base = file.split('/').pop() ?? file;
  return stripZettelPrefix(base.replace(/\.md$/i, ''));
}

/** A file path cleaned for display: keep the folder path, strip the timestamp
 * prefix and the .md extension from the basename. The raw path is still used for
 * the Obsidian deep-link. */
export function displayPath(file: string): string {
  const parts = file.split('/');
  const base = stripZettelPrefix((parts.pop() ?? file).replace(/\.md$/i, ''));
  return [...parts, base].join('/');
}
```

(The existing `documentTitle` already computes `base.replace(/\.md$/i, '')`; the change wraps it in `stripZettelPrefix`. Replace the old function body.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm exec vitest run packages/gui/src/lib/grouping.test.ts`
Expected: PASS (existing cases + 4 new).

- [ ] **Step 5: Use displayPath in the file chip**

In `packages/gui/src/components/TaskCard.tsx`, add to the existing import from `../lib/grouping` (or add a new import line if none exists):

```tsx
import { displayPath } from '../lib/grouping';
```

Then in the file-chip `<a>` (around line 64–71), replace the chip's visible text `{task.file}` with `{displayPath(task.file)}`. Leave the `href={obsidianHref(obsidian.vault, task.file, ...)}` argument as the raw `task.file` (the link must target the real path).

- [ ] **Step 6: Verify the build type-checks**

Run: `corepack pnpm --filter @caius/gui exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/gui/src/lib/grouping.ts packages/gui/src/lib/grouping.test.ts \
  packages/gui/src/components/TaskCard.tsx
git commit -m "gui: Strip Zettel timestamp prefix from displayed filenames"
```

---

## Task 3: Live capture parse preview (P9)

**Files:**
- Modify: `packages/gui/package.json`
- Create: `packages/gui/src/lib/capturePreview.ts`
- Test: `packages/gui/src/lib/capturePreview.test.ts`
- Modify: `packages/gui/src/components/QuickAdd.tsx`

- [ ] **Step 1: Add `@caius/core` as a workspace dependency**

In `packages/gui/package.json`, add to `"dependencies"` (alphabetical, before `@dnd-kit/core`):

```json
"@caius/core": "workspace:*",
```

Then install + ensure core is built (vitest resolves `@caius/core` → src via `vitest.config.ts`; the production Vite build resolves it to `packages/core/dist` via the workspace symlink, so core must be built):

Run: `corepack pnpm install`
Run: `corepack pnpm -w exec tsc -b packages/core`
Expected: install succeeds; `packages/core/dist/index.js` and `index.d.ts` exist.

- [ ] **Step 2: Write the failing test**

Create `packages/gui/src/lib/capturePreview.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { previewCapture } from './capturePreview';

describe('previewCapture', () => {
  it('parses the four trailing tokens and the title', () => {
    const p = previewCapture('Draft Q3 OKRs ~1h30m !! *2026-07-01 :[[Planning]]');
    expect(p.title).toBe('Draft Q3 OKRs');
    expect(p.estMinutes).toBe(90);
    expect(p.importance).toBe(2);
    expect(p.due).toBe('2026-07-01');
    expect(p.project).toBe('Planning');
    expect(p.unparsed).toEqual([]);
  });

  it('flags a malformed estimate instead of swallowing it into the title', () => {
    const p = previewCapture('Call the dentist ~1hh30m');
    expect(p.title).toBe('Call the dentist ~1hh30m');
    expect(p.estMinutes).toBeNull();
    expect(p.unparsed).toEqual(['~1hh30m']);
  });

  it('treats a plain title as just a title', () => {
    expect(previewCapture('Buy milk')).toMatchObject({
      title: 'Buy milk', estMinutes: null, importance: 0, due: null, project: null, unparsed: [],
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `corepack pnpm exec vitest run packages/gui/src/lib/capturePreview.test.ts`
Expected: FAIL — cannot resolve `./capturePreview`.

- [ ] **Step 4: Write the implementation**

Create `packages/gui/src/lib/capturePreview.ts`:

```ts
import { scanTokens } from '@caius/core';

export interface CapturePreview {
  title: string;
  estMinutes: number | null;
  importance: 0 | 1 | 2 | 3;
  due: string | null;        // YYYY-MM-DD
  project: string | null;
  /** trailing word(s) that look like a token sigil but did not parse (likely typos). */
  unparsed: string[];
}

const SIGIL = /^[~!*&:]/;

/** Preview the canonical parse of a capture line, reusing the engine's trailing-
 * token scanner so the preview always matches what the server will index. */
export function previewCapture(input: string): CapturePreview {
  const { text, tokens } = scanTokens(input.trim());
  const p: CapturePreview = {
    title: text, estMinutes: null, importance: 0, due: null, project: null, unparsed: [],
  };
  for (const t of tokens) {
    if (t.kind === 'estimate') p.estMinutes = t.minutes;
    else if (t.kind === 'importance') p.importance = t.tier;
    else if (t.kind === 'due') p.due = t.date;
    else if (t.kind === 'project') p.project = t.project;
  }
  // Heuristic typo flag: the last word of the leftover title begins with a token
  // sigil but never became a token (e.g. "~1hh30m", "*2026-7-1").
  const lastWord = p.title.split(/\s+/).pop() ?? '';
  if (lastWord !== '' && SIGIL.test(lastWord)) p.unparsed.push(lastWord);
  return p;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `corepack pnpm exec vitest run packages/gui/src/lib/capturePreview.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 6: Render the preview chips in QuickAdd**

In `packages/gui/src/components/QuickAdd.tsx`, add the import:

```tsx
import { previewCapture } from '../lib/capturePreview';
```

Inside the component, after the existing `const [error, ...]` hooks, derive the preview:

```tsx
const trimmed = text.trim();
const preview = trimmed ? previewCapture(text) : null;
const hasTokens = !!preview && (preview.estMinutes != null || preview.importance > 0 || preview.due != null || preview.project != null || preview.unparsed.length > 0);
```

Then, inside the returned JSX, immediately after the `<input ... />` element (and before the existing `{error && ...}` block), add the chip strip. NOTE: do not add a "lands in" line — placement (P10) is Phase 4.

```tsx
{preview && hasTokens && (
  <div data-testid="capture-preview" className="flex flex-wrap items-center gap-1.5 px-1 text-[11px]">
    <span className="rounded border border-line bg-panel2 px-1.5 py-0.5 text-ink">{preview.title || '(no title yet)'}</span>
    {preview.estMinutes != null && (
      <span className="rounded border border-line px-1.5 py-0.5 text-good">~{preview.estMinutes}m</span>
    )}
    {preview.importance > 0 && (
      <span className="rounded border border-line px-1.5 py-0.5 text-warn">{'!'.repeat(preview.importance)}</span>
    )}
    {preview.due && (
      <span className="rounded border border-line px-1.5 py-0.5 text-accent">due {preview.due}</span>
    )}
    {preview.project && (
      <span className="rounded border border-line px-1.5 py-0.5 text-accent">{preview.project}</span>
    )}
    {preview.unparsed.map((u) => (
      <span key={u} data-testid="capture-unparsed" className="rounded border border-over/50 px-1.5 py-0.5 text-over">
        “{u}” isn’t a valid token — it’ll stay in the title
      </span>
    ))}
  </div>
)}
```

- [ ] **Step 7: Verify the build type-checks and the full suite is green**

Run: `corepack pnpm --filter @caius/gui exec tsc --noEmit`
Run: `corepack pnpm exec vitest run`
Expected: no type errors; all tests pass (no regressions).

- [ ] **Step 8: Commit**

```bash
git add packages/gui/package.json pnpm-lock.yaml \
  packages/gui/src/lib/capturePreview.ts packages/gui/src/lib/capturePreview.test.ts \
  packages/gui/src/components/QuickAdd.tsx
git commit -m "gui: Live capture parse preview (reuses core scanTokens) with typo flagging"
```

---

## Task 4: Pre-commit summary + toast (P6)

**Files:**
- Create: `packages/gui/src/lib/commitSummary.ts`
- Test: `packages/gui/src/lib/commitSummary.test.ts`
- Create: `packages/gui/src/components/CommitSummaryModal.tsx`
- Modify: `packages/gui/src/components/PlanBoard.tsx`
- Modify: `packages/gui/src/App.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/gui/src/lib/commitSummary.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { summarizeBuffer } from './commitSummary';
import type { StagingBuffer, PendingChange } from './staging';

const change = (id: string, toGrain: PendingChange['toGrain'], text: string): PendingChange => ({
  taskId: id, fromGrain: 'someday', toGrain, kind: 'promote',
  snapshot: { file: 'f.md', line: 1, text },
});

describe('summarizeBuffer', () => {
  it('counts changes and groups them by destination tier', () => {
    const buf: StagingBuffer = {
      a: change('a', 'month', 'Hire designer'),
      b: change('b', 'month', 'Finish draft'),
      c: change('c', 'week', 'Send emails'),
    };
    const s = summarizeBuffer(buf);
    expect(s.total).toBe(3);
    expect(s.byTier).toEqual([{ tier: 'Planned', count: 2 }, { tier: 'Orbit', count: 1 }]);
    expect(s.rows[0]).toEqual({ title: 'Hire designer', toTier: 'Planned', kind: 'promote' });
  });

  it('is empty for an empty buffer', () => {
    expect(summarizeBuffer({})).toEqual({ total: 0, rows: [], byTier: [] });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm exec vitest run packages/gui/src/lib/commitSummary.test.ts`
Expected: FAIL — cannot resolve `./commitSummary`.

- [ ] **Step 3: Write the implementation**

Create `packages/gui/src/lib/commitSummary.ts`:

```ts
import type { StagingBuffer, PendingChange } from './staging';
import { BUCKET_LABEL } from './grains';

export interface CommitSummary {
  total: number;
  rows: { title: string; toTier: string; kind: PendingChange['kind'] }[];
  byTier: { tier: string; count: number }[];
}

const tierLabel = (g: PendingChange['toGrain']): string =>
  g === 'someday' ? 'Someday' : BUCKET_LABEL[g];

/** Summarize a staging buffer for the pre-commit confirmation: a flat row list
 * plus per-destination-tier counts (insertion order preserved). Pure. */
export function summarizeBuffer(buffer: StagingBuffer): CommitSummary {
  const changes = Object.values(buffer);
  const rows = changes.map((c) => ({ title: c.snapshot.text, toTier: tierLabel(c.toGrain), kind: c.kind }));
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.toTier, (counts.get(r.toTier) ?? 0) + 1);
  const byTier = [...counts.entries()].map(([tier, count]) => ({ tier, count }));
  return { total: changes.length, rows, byTier };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm exec vitest run packages/gui/src/lib/commitSummary.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 5: Create the confirmation modal**

Create `packages/gui/src/components/CommitSummaryModal.tsx`:

```tsx
import type { CommitSummary } from '../lib/commitSummary';

/** Pre-commit confirmation: shows exactly what will be committed and to which
 * tiers before the write. (Planning commit is log-only in Phase 1; this is the
 * confirmation UX and becomes the write preview when write-back lands.) */
export function CommitSummaryModal({
  summary, onConfirm, onCancel,
}: { summary: CommitSummary; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" data-testid="commit-summary">
      <div className="w-[min(440px,92vw)] rounded-xl border border-line bg-panel p-5 shadow-xl">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          Commit {summary.total} change{summary.total === 1 ? '' : 's'}?
        </h2>
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {summary.byTier.map((b) => (
            <span key={b.tier} className="rounded border border-line bg-panel2 px-2 py-1 text-dim">
              {b.count} → <span className="text-ink">{b.tier}</span>
            </span>
          ))}
        </div>
        <ul className="mb-4 max-h-52 overflow-auto text-xs text-dim">
          {summary.rows.map((r, i) => (
            <li key={i} className="flex justify-between gap-3 py-0.5">
              <span className="truncate text-ink">{r.title || '(untitled)'}</span>
              <span className="shrink-0">{r.kind} → {r.toTier}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <button data-testid="commit-cancel" onClick={onCancel}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-dim hover:text-ink">Cancel</button>
          <button data-testid="commit-confirm" onClick={onConfirm}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm text-bg">Commit →</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Make App.onCommit return the result**

In `packages/gui/src/App.tsx`:

1. The `onCommit` function (around line 44) currently returns `Promise<void>`. Make it return the `CommitResult`. Change its final lines from:

```tsx
    void fetchFunnel().then(setFunnel);
  };
```

to:

```tsx
    void fetchFunnel().then(setFunnel);
    return res;
  };
```

2. Update the `PlanBoard` prop wiring (around line 85) from `onCommit={() => void onCommit()}` to:

```tsx
              onCommit={onCommit}
```

- [ ] **Step 7: Gate the commit on the modal and toast the outcome in PlanBoard**

In `packages/gui/src/components/PlanBoard.tsx`:

1. Update imports — add:

```tsx
import { summarizeBuffer } from '../lib/commitSummary';
import { CommitSummaryModal } from './CommitSummaryModal';
```

2. Change the `onCommit` prop type in the `Props` interface (around line 30) from `onCommit: () => void;` to:

```tsx
  onCommit: () => Promise<CommitResult>;
```

(`CommitResult` is already imported from `../lib/staging` at the top of the file.)

3. Add UI state near the other `useState` hooks (around line 77):

```tsx
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
```

4. Replace the commit button's handler. The current button (around line 233) is:

```tsx
          <button data-testid="commit-button" disabled={Object.keys(buffer).length === 0} onClick={onCommit}
            className="rounded-lg bg-accent px-3 py-2 text-bg disabled:opacity-40">commit plan</button>
```

Change `onClick={onCommit}` to `onClick={() => setConfirming(true)}`.

5. Add the modal + toast just before the closing `</section>` (right after the `{editing && <EditModal ... />}` line, around line 236):

```tsx
        {confirming && (
          <CommitSummaryModal
            summary={summarizeBuffer(buffer)}
            onCancel={() => setConfirming(false)}
            onConfirm={async () => {
              setConfirming(false);
              const res = await onCommit();
              const msg = `✓ Committed ${res.applied.length} change${res.applied.length === 1 ? '' : 's'}`
                + (res.conflicts.length ? ` · ${res.conflicts.length} conflict(s) kept` : '');
              setToast(msg);
              setTimeout(() => setToast(null), 2600);
            }}
          />
        )}
        {toast && (
          <div data-testid="commit-toast"
            className="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-lg border border-good/40 bg-panel px-4 py-2 text-sm text-good shadow-lg">
            {toast}
          </div>
        )}
```

- [ ] **Step 8: Verify the build type-checks and the full suite is green**

Run: `corepack pnpm --filter @caius/gui exec tsc --noEmit`
Run: `corepack pnpm exec vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/gui/src/lib/commitSummary.ts packages/gui/src/lib/commitSummary.test.ts \
  packages/gui/src/components/CommitSummaryModal.tsx \
  packages/gui/src/components/PlanBoard.tsx packages/gui/src/App.tsx
git commit -m "gui: Pre-commit summary confirmation + outcome toast"
```

---

## Final verification

- [ ] **Run the whole suite + GUI build**

Run: `corepack pnpm exec vitest run`
Expected: all tests pass (276 prior + the new lib tests).

Run: `corepack pnpm --filter @caius/gui build`
Expected: `tsc --noEmit` clean and `vite build` emits `packages/gui/dist` with no resolution errors for `@caius/core`.

- [ ] **Manual smoke (optional, needs a running server)**

Run: `corepack pnpm build && corepack pnpm caius serve .testvault --port 7777`
Check: a card with a markdown-link title renders a clickable link; a document group / file chip shows no timestamp prefix; typing `Foo ~1h30m !! *2026-07-01 :[[Planning]]` in the capture bar shows the chip strip, and `Foo ~1hh30m` shows the typo warning; clicking **commit plan** opens the summary, and confirming shows the toast.

---

## Self-review notes

- **Spec coverage (Phase 1 subset):** P7 → Task 1; P8 → Task 2; P9 (preview + typo flag, sans "lands in") → Task 3; P6 → Task 4. P14 and the "lands in" line are explicitly deferred (see scope note).
- **Type consistency:** `previewCapture` reads `t.minutes` / `t.tier` / `t.date` / `t.project` matching `@caius/core` token `make()` outputs; `summarizeBuffer` uses `PendingChange.toGrain` + `BUCKET_LABEL` (keys `month|week|day`) with a `someday` guard; `onCommit` is `() => Promise<CommitResult>` consistently in `App.tsx` and `PlanBoard` Props.
- **No placeholders:** every code step ships complete code.
