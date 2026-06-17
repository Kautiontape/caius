import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanVault } from '../src/scan.js';
import { DEFAULT_CONFIG } from '@caius/resolve';
import type { ScanResult } from '../src/scan.js';

const now = new Date(2026, 5, 17); // 2026-06-17, current Daily period
let root: string;
let result: ScanResult;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'caius-scan-'));
  const file = (rel: string, body: string) => {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, body);
  };
  file(
    '10 - Project/Caius/tasks.md',
    ['- [ ] Build scanner ^dup', '\t- [ ] subtask', '- [/] In progress now', '- [x] Done thing done:2026-06-01', ''].join('\n'),
  );
  file('02 - Periodic/Daily/2026/06/2026-06-17.md', ['- [ ] Today task ^dup', '- [-] Cancelled', ''].join('\n'));
  file('01 - Inbox/skip.md', '- [ ] should be excluded\n');
  result = scanVault(root, DEFAULT_CONFIG, now);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

const find = (text: string) => result.tasks.find((t) => t.text === text)!;

describe('scanVault — coverage', () => {
  it('indexes tasks from included files, skips excluded', () => {
    expect(result.report.taskCount).toBe(6);
    expect(result.tasks.some((t) => t.text === 'should be excluded')).toBe(false);
  });
  it('counts states', () => {
    expect(result.report.byState.open).toBe(3);
    expect(result.report.byState.in_progress).toBe(1);
    expect(result.report.byState.done).toBe(1);
    expect(result.report.byState.cancelled).toBe(1);
  });
});

describe('scanVault — resolution wired in', () => {
  it('Daily task resolves to today horizon, orphan project', () => {
    const t = find('Today task');
    expect(t.horizon).toBe('today');
    expect(t.project).toBeNull();
  });
  it('Project task resolves to someday horizon, Caius project', () => {
    const t = find('Build scanner');
    expect(t.horizon).toBe('someday');
    expect(t.project).toBe('Caius');
  });
  it('records derivation provenance per axis', () => {
    const t = find('Today task');
    expect(t.derivations.some((d) => d.axis === 'horizon' && d.source.length > 0)).toBe(true);
  });
});

describe('scanVault — structure', () => {
  it('links a subtask to its parent rowid', () => {
    const parent = find('Build scanner');
    const child = find('subtask');
    expect(child.parentRowid).toBe(parent.rowid);
  });
});

describe('scanVault — reconciliation', () => {
  it('flags two live tasks sharing one ^id as invariant_violation', () => {
    const flags = result.flags.filter((f) => f.kind === 'invariant_violation');
    expect(flags.length).toBe(2);
  });
});
