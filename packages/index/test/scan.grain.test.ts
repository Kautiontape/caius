import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanVault } from '../src/scan.js';
import { DEFAULT_CONFIG } from '@caius/resolve';

describe('scanVault — grain/bucket on tasks', () => {
  it('tags a current daily task day/this and a project task someday/null', () => {
    const root = mkdtempSync(join(tmpdir(), 'caius-grain-'));
    try {
      const file = (rel: string, body: string) => {
        const abs = join(root, rel);
        mkdirSync(join(abs, '..'), { recursive: true });
        writeFileSync(abs, body);
      };
      file('02 - Periodic/Daily/2026/06/2026-06-17.md', '- [ ] today task\n');
      file('10 - Project/Caius/notes.md', '- [ ] someday task\n');
      const r = scanVault(root, DEFAULT_CONFIG, new Date(2026, 5, 17));
      const today = r.tasks.find((t) => t.text === 'today task')!;
      const someday = r.tasks.find((t) => t.text === 'someday task')!;
      expect([today.grain, today.bucket]).toEqual(['day', 'this']);
      expect([someday.grain, someday.bucket]).toEqual(['someday', null]);
      expect(today.derivations.some((d) => d.axis === 'grain')).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
