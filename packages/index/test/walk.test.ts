import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walkVault } from '../src/walk.js';
import { DEFAULT_CONFIG } from '@caius/resolve';

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'caius-walk-'));
  const file = (rel: string) => {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, '- [ ] x\n');
  };
  file('10 - Project/Caius/notes.md');
  file('02 - Periodic/Daily/2026/06/2026-06-17.md');
  file('20 - Area/Health.md');
  file('01 - Inbox/capture.md'); // excluded
  file('30 - Resources/paper.md'); // excluded
  file('.obsidian/workspace.json'); // excluded dotdir, non-md
  file('.git/config'); // dotdir, pruned
  file('10 - Project/diagram.png'); // non-md
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('walkVault', () => {
  it('returns only indexed .md files, vault-relative and sorted', () => {
    expect(walkVault(root, DEFAULT_CONFIG)).toEqual([
      '02 - Periodic/Daily/2026/06/2026-06-17.md',
      '10 - Project/Caius/notes.md',
      '20 - Area/Health.md',
    ]);
  });

  it('does not descend into excluded or dot directories', () => {
    const out = walkVault(root, DEFAULT_CONFIG);
    expect(out.some((p) => p.startsWith('01 - Inbox'))).toBe(false);
    expect(out.some((p) => p.startsWith('30 - Resources'))).toBe(false);
    expect(out.some((p) => p.startsWith('.'))).toBe(false);
  });
});
