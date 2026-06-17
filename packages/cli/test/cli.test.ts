import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, runScan } from '../src/cli.js';

describe('parseArgs', () => {
  it('parses the scan command with a vault path', () => {
    const r = parseArgs(['scan', '.testvault']);
    expect(r).toMatchObject({ command: 'scan', vault: '.testvault' });
  });
  it('honors --db override', () => {
    const r = parseArgs(['scan', 'v', '--db', 'out.db']);
    expect(r).toMatchObject({ command: 'scan', vault: 'v', db: 'out.db' });
  });
  it('errors with no command', () => {
    expect(parseArgs([])).toHaveProperty('error');
  });
  it('errors on an unknown command', () => {
    expect(parseArgs(['frobnicate', 'v'])).toHaveProperty('error');
  });
  it('errors when scan has no vault', () => {
    expect(parseArgs(['scan'])).toHaveProperty('error');
  });
});

describe('runScan', () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'caius-cli-'));
    const abs = join(root, '10 - Project/Caius/tasks.md');
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, '- [ ] Ship it\n- [x] Did a thing\n');
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('scans a vault, writes the db, and reports', () => {
    const db = join(root, 'caius.db');
    const { output, exitCode } = runScan({ vault: root, db }, new Date(2026, 5, 17));
    expect(exitCode).toBe(0);
    expect(output).toContain('2 tasks');
    expect(existsSync(db)).toBe(true);
  });

  it('fails cleanly when the vault does not exist', () => {
    const { output, exitCode } = runScan({ vault: join(root, 'nope'), db: join(root, 'x.db') });
    expect(exitCode).toBe(2);
    expect(output.toLowerCase()).toContain('not found');
  });
});
