import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyTaskUpdate } from '../src/index.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'caius-write-'));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function setup(body: string): string {
  writeFileSync(join(root, 'note.md'), body);
  return join(root, 'note.md');
}

describe('applyTaskUpdate', () => {
  it('toggles state and writes atomically', () => {
    const abs = setup('- [ ] task one\n- [ ] task two\n');
    const r = applyTaskUpdate(root, {
      file: 'note.md',
      line: 0,
      expectedText: 'task one',
      patch: { state: 'done' },
    });
    expect(r.ok).toBe(true);
    expect(readFileSync(abs, 'utf8')).toBe('- [x] task one\n- [ ] task two\n');
  });

  it('returns a conflict and writes nothing when the line changed under you', () => {
    const abs = setup('- [ ] changed already\n');
    const r = applyTaskUpdate(root, {
      file: 'note.md',
      line: 0,
      expectedText: 'old text',
      patch: { state: 'done' },
    });
    expect(r).toMatchObject({ conflict: expect.any(String) });
    expect(readFileSync(abs, 'utf8')).toBe('- [ ] changed already\n');
  });

  it('replaces the contiguous indented note block (description), preserving subtasks', () => {
    const abs = setup('- [ ] parent\n  old note line\n  - [ ] child\n');
    const r = applyTaskUpdate(root, {
      file: 'note.md',
      line: 0,
      expectedText: 'parent',
      patch: { description: 'new note' },
    });
    expect(r.ok).toBe(true);
    expect(readFileSync(abs, 'utf8')).toBe('- [ ] parent\n  new note\n  - [ ] child\n');
  });

  // --- edge cases: add / change / clear each token field ---

  it('adds an estimate token', () => {
    const abs = setup('- [ ] task\n');
    expect(applyTaskUpdate(root, { file: 'note.md', line: 0, expectedText: 'task', patch: { estMinutes: 90 } }).ok).toBe(true);
    expect(readFileSync(abs, 'utf8')).toBe('- [ ] task ~1h30m\n');
  });

  it('changes an existing estimate token', () => {
    const abs = setup('- [ ] task ~30m\n');
    expect(applyTaskUpdate(root, { file: 'note.md', line: 0, expectedText: 'task', patch: { estMinutes: 120 } }).ok).toBe(true);
    expect(readFileSync(abs, 'utf8')).toBe('- [ ] task ~2h\n');
  });

  it('clears an estimate token with null', () => {
    const abs = setup('- [ ] task ~30m\n');
    expect(applyTaskUpdate(root, { file: 'note.md', line: 0, expectedText: 'task', patch: { estMinutes: null } }).ok).toBe(true);
    expect(readFileSync(abs, 'utf8')).toBe('- [ ] task\n');
  });

  it('adds an importance token', () => {
    const abs = setup('- [ ] task\n');
    expect(applyTaskUpdate(root, { file: 'note.md', line: 0, expectedText: 'task', patch: { importance: 2 } }).ok).toBe(true);
    expect(readFileSync(abs, 'utf8')).toBe('- [ ] task !!\n');
  });

  it('clears an importance token with 0', () => {
    const abs = setup('- [ ] task !!!\n');
    expect(applyTaskUpdate(root, { file: 'note.md', line: 0, expectedText: 'task', patch: { importance: 0 } }).ok).toBe(true);
    expect(readFileSync(abs, 'utf8')).toBe('- [ ] task\n');
  });

  it('adds a due token', () => {
    const abs = setup('- [ ] task\n');
    expect(applyTaskUpdate(root, { file: 'note.md', line: 0, expectedText: 'task', patch: { due: '2026-07-01' } }).ok).toBe(true);
    expect(readFileSync(abs, 'utf8')).toBe('- [ ] task *2026-07-01\n');
  });

  it('changes a due token', () => {
    const abs = setup('- [ ] task *2026-01-01\n');
    expect(applyTaskUpdate(root, { file: 'note.md', line: 0, expectedText: 'task', patch: { due: '2026-07-01' } }).ok).toBe(true);
    expect(readFileSync(abs, 'utf8')).toBe('- [ ] task *2026-07-01\n');
  });

  it('clears a due token with null', () => {
    const abs = setup('- [ ] task *2026-01-01\n');
    expect(applyTaskUpdate(root, { file: 'note.md', line: 0, expectedText: 'task', patch: { due: null } }).ok).toBe(true);
    expect(readFileSync(abs, 'utf8')).toBe('- [ ] task\n');
  });

  it('adds a project token', () => {
    const abs = setup('- [ ] task\n');
    expect(applyTaskUpdate(root, { file: 'note.md', line: 0, expectedText: 'task', patch: { project: 'Caius' } }).ok).toBe(true);
    expect(readFileSync(abs, 'utf8')).toBe('- [ ] task :[[Caius]]\n');
  });

  it('clears a project token with null', () => {
    const abs = setup('- [ ] task :[[Caius]]\n');
    expect(applyTaskUpdate(root, { file: 'note.md', line: 0, expectedText: 'task', patch: { project: null } }).ok).toBe(true);
    expect(readFileSync(abs, 'utf8')).toBe('- [ ] task\n');
  });

  it('changes the text, preserving tokens and block id', () => {
    const abs = setup('- [ ] old text ~30m ^abc\n');
    expect(applyTaskUpdate(root, { file: 'note.md', line: 0, expectedText: 'old text', patch: { text: 'new text' } }).ok).toBe(true);
    expect(readFileSync(abs, 'utf8')).toBe('- [ ] new text ~30m ^abc\n');
  });

  it('preserves an unchanged token raw byte-for-byte when toggling state', () => {
    const abs = setup('- [ ] task ~1h ^id\n');
    expect(applyTaskUpdate(root, { file: 'note.md', line: 0, expectedText: 'task', patch: { state: 'in_progress' } }).ok).toBe(true);
    expect(readFileSync(abs, 'utf8')).toBe('- [/] task ~1h ^id\n');
  });

  it('replaces a multi-line description and re-indents', () => {
    const abs = setup('- [ ] parent\n  first old\n  second old\n');
    expect(applyTaskUpdate(root, { file: 'note.md', line: 0, expectedText: 'parent', patch: { description: 'line a\nline b' } }).ok).toBe(true);
    expect(readFileSync(abs, 'utf8')).toBe('- [ ] parent\n  line a\n  line b\n');
  });

  it('adds a description when none existed (no note block to replace)', () => {
    const abs = setup('- [ ] parent\n- [ ] sibling\n');
    expect(applyTaskUpdate(root, { file: 'note.md', line: 0, expectedText: 'parent', patch: { description: 'note' } }).ok).toBe(true);
    expect(readFileSync(abs, 'utf8')).toBe('- [ ] parent\n  note\n- [ ] sibling\n');
  });

  it('returns a conflict when the line is not a task line', () => {
    const abs = setup('just prose\n');
    const r = applyTaskUpdate(root, { file: 'note.md', line: 0, expectedText: 'just prose', patch: { state: 'done' } });
    expect(r).toMatchObject({ conflict: expect.any(String) });
    expect(readFileSync(abs, 'utf8')).toBe('just prose\n');
  });
});
