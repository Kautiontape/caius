import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from '../src/parse-document.js';

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

const suite = existsSync(CORPUS) ? describe : describe.skip;

suite('corpus smoke (real vault clone)', () => {
  test('parses every note without throwing, and reports grammar coverage', () => {
    const files = walk(CORPUS);
    const stats = {
      files: files.length,
      tasks: 0,
      live: 0,
      withId: 0,
      subtasks: 0,
      withNotes: 0,
      byState: {} as Record<string, number>,
      byToken: {} as Record<string, number>,
    };
    const failures: { file: string; err: string }[] = [];

    for (const f of files) {
      let text: string;
      try {
        text = readFileSync(f, 'utf8');
      } catch {
        continue;
      }
      try {
        for (const t of parseDocument(text)) {
          stats.tasks++;
          if (t.live) stats.live++;
          if (t.blockId) stats.withId++;
          if (t.parentLine !== null) stats.subtasks++;
          if (t.notes.length) stats.withNotes++;
          stats.byState[t.state] = (stats.byState[t.state] ?? 0) + 1;
          for (const tok of t.tokens) stats.byToken[tok.kind] = (stats.byToken[tok.kind] ?? 0) + 1;
        }
      } catch (e) {
        failures.push({ file: f.replace(CORPUS, ''), err: String(e) });
      }
    }

    // eslint-disable-next-line no-console
    console.log('CORPUS STATS\n' + JSON.stringify(stats, null, 2));
    if (failures.length) console.log('FAILURES\n' + JSON.stringify(failures.slice(0, 20), null, 2));
    expect(failures).toEqual([]);
  });
});
