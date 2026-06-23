import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTaskLine } from '../src/parse-line.js';
import { renderTaskLine } from '../src/render-line.js';
import type { TaskLine } from '../src/types.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CORPUS = join(REPO_ROOT, '.testvault');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '.git') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

/**
 * A structural fingerprint of a parsed line: every semantic field plus each
 * token's typed value (not its `raw`, not object identity). Two lines are the
 * "same task" iff their fingerprints are deeply equal — this is the round-trip
 * invariant the renderer must preserve.
 */
function fingerprint(t: TaskLine) {
  return {
    state: t.state,
    live: t.live,
    text: t.text,
    marker: t.marker,
    indentText: t.indentText,
    blockId: t.blockId,
    tags: t.tags,
    tokens: t.tokens.map((tok) => {
      switch (tok.kind) {
        case 'importance':
          return { kind: tok.kind, tier: tok.tier };
        case 'estimate':
          return { kind: tok.kind, minutes: tok.minutes };
        case 'due':
          return { kind: tok.kind, date: tok.date };
        case 'done':
          return { kind: tok.kind, date: tok.date };
        case 'project':
          return { kind: tok.kind, project: tok.project };
        case 'from':
          return { kind: tok.kind, note: tok.note, blockId: tok.blockId };
        case 'moved':
          return { kind: tok.kind, note: tok.note, blockId: tok.blockId };
        case 'recurrence':
          return { kind: tok.kind, rule: tok.rule };
      }
    }),
  };
}

const suite = existsSync(CORPUS) ? describe : describe.skip;

suite('renderTaskLine corpus round-trip (real vault clone)', () => {
  test('every parsed task line round-trips structurally; well-formed lines are byte-identical', () => {
    const files = walk(CORPUS);
    let lines = 0; // task lines the parser accepted
    let byteIdentical = 0;
    const structuralFailures: { file: string; line: string; rendered: string }[] = [];
    // Lines whose render is not byte-identical but differs ONLY in insignificant
    // whitespace the parser legitimately normalizes (so the typed parse is
    // unchanged). All observed shapes in the corpus share one root cause — the
    // parser collapses the run of `[ \t]` separating the checkbox from the rest,
    // collapses inter-token separators to a single space, and strips trailing
    // whitespace (`trimEnd`); the renderer emits the canonical single space and
    // no trailing space. Observed shapes:
    //   1. `- [x] `   (bare checkbox, trailing space)    → `- [x]`
    //   2. `- [ ]  text` (double space after checkbox)   → `- [ ] text`
    //   3. `- [ ] text ` (trailing space after text)     → `- [ ] text`
    //   4. internal/trailing spaces in TEXT that trimEnd drops
    // (Indent and INTERNAL text spacing are preserved by both parser and
    // renderer, so they are never a source of divergence.) We prove the
    // divergence is whitespace-only by asserting the two strings are equal once
    // ALL whitespace is removed — i.e. no non-whitespace byte changed.
    const whitespaceNormalized: { file: string; line: string; rendered: string }[] = [];
    const stripWs = (s: string) => s.replace(/\s/g, '');

    for (const f of files) {
      let text: string;
      try {
        text = readFileSync(f, 'utf8');
      } catch {
        continue;
      }
      for (const raw of text.split('\n')) {
        const a = parseTaskLine(raw);
        if (!a) continue; // not a (5-state) task line
        lines++;

        const rendered = renderTaskLine(a);

        // 1. Structural round-trip MUST hold for every parsed task line.
        const b = parseTaskLine(rendered);
        if (!b || JSON.stringify(fingerprint(b)) !== JSON.stringify(fingerprint(a))) {
          structuralFailures.push({ file: f.replace(CORPUS, ''), line: raw, rendered });
          continue;
        }

        // 2. Byte-identity for well-formed lines, allowing only whitespace
        //    normalization the parser itself performs.
        if (rendered === raw) {
          byteIdentical++;
        } else if (stripWs(raw) === stripWs(rendered)) {
          whitespaceNormalized.push({ file: f.replace(CORPUS, ''), line: raw, rendered });
        } else {
          // Divergence beyond whitespace — a real, lossy failure.
          structuralFailures.push({ file: f.replace(CORPUS, ''), line: raw, rendered });
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `RENDER ROUND-TRIP: ${lines} task lines exercised, ${byteIdentical} byte-identical, ` +
        `${whitespaceNormalized.length} whitespace-normalized, ${structuralFailures.length} failures`,
    );
    if (structuralFailures.length)
      console.log('FAILURES\n' + JSON.stringify(structuralFailures.slice(0, 20), null, 2));

    // The safety net: zero failures, and we genuinely exercised a real corpus.
    expect(structuralFailures).toEqual([]);
    expect(lines).toBeGreaterThan(0);
    expect(byteIdentical + whitespaceNormalized.length).toBe(lines);
  });
});
