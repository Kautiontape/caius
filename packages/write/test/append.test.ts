import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendTask } from '../src/index.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'caius-append-'));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('appendTask', () => {
  it('appends a new open task line to an existing note, preserving inline tokens', () => {
    writeFileSync(join(root, 'inbox.md'), '# Inbox\n');
    const r = appendTask(root, { note: 'inbox.md', text: 'buy milk ~15m' });
    expect(r).toEqual({ ok: true });
    expect(readFileSync(join(root, 'inbox.md'), 'utf8')).toBe('# Inbox\n- [ ] buy milk ~15m\n');
  });

  it('creates a missing note and its parent dirs', () => {
    expect(existsSync(join(root, 'sub/new.md'))).toBe(false);
    appendTask(root, { note: 'sub/new.md', text: 'first task' });
    const content = readFileSync(join(root, 'sub/new.md'), 'utf8');
    expect(content).toContain('- [ ] first task');
    expect(content).toBe('- [ ] first task\n');
  });

  it('inserts a separating newline when the note does not end in one', () => {
    writeFileSync(join(root, 'note.md'), 'last line no newline');
    appendTask(root, { note: 'note.md', text: 'X' });
    expect(readFileSync(join(root, 'note.md'), 'utf8')).toBe('last line no newline\n- [ ] X\n');
  });

  it('trims surrounding whitespace from the task text', () => {
    writeFileSync(join(root, 'note.md'), '');
    appendTask(root, { note: 'note.md', text: '  spaced task  ' });
    expect(readFileSync(join(root, 'note.md'), 'utf8')).toBe('- [ ] spaced task\n');
  });
});
