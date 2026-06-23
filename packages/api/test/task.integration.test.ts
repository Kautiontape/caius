import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveCaius, type Server } from '../src/index.js';

let root: string;
let server: Server;

const REL = '10 - Project/Caius/tasks.md';

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'caius-task-'));
  const file = (rel: string, body: string) => {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, body);
  };
  file(REL, ['- [/] Working on it', '- [ ] Backlog item', '- [x] Done'].join('\n'));
  server = await serveCaius({ root, port: 0, now: new Date(2026, 5, 17) });
});

afterAll(async () => {
  await server.close();
  rmSync(root, { recursive: true, force: true });
});

const postTask = (body: unknown) =>
  fetch(server.url + '/api/task', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/task (integration)', () => {
  it('toggles a real line in place, writes the file, and returns the updated task', async () => {
    // 'Backlog item' is `- [ ]` at line index 1.
    const res = await postTask({
      file: REL,
      line: 1,
      expectedText: 'Backlog item',
      patch: { state: 'done' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.task).not.toBeNull();
    expect(body.task.state).toBe('done');

    // The file on disk reflects the toggle.
    const onDisk = readFileSync(join(root, REL), 'utf8');
    expect(onDisk.split('\n')[1]).toBe('- [x] Backlog item');
  });

  it('returns 409 and leaves the file unchanged on a stale expectedText', async () => {
    const before = readFileSync(join(root, REL), 'utf8');
    const res = await postTask({
      file: REL,
      line: 1,
      expectedText: 'WRONG TEXT',
      patch: { state: 'open' },
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(typeof body.conflict).toBe('string');

    const after = readFileSync(join(root, REL), 'utf8');
    expect(after).toBe(before); // byte-for-byte unchanged
  });

  it('returns 400 on a malformed body (line is not a number)', async () => {
    const res = await postTask({
      file: REL,
      line: 'NaN',
      expectedText: 'x',
      patch: {},
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 and writes nothing on a bad-typed patch field', async () => {
    const before = readFileSync(join(root, REL), 'utf8');
    // Line index 0 is `- [/] Working on it` — a real live line.
    const res = await postTask({
      file: REL,
      line: 0,
      expectedText: 'Working on it',
      patch: { estMinutes: 'thirty' },
    });
    expect(res.status).toBe(400);

    const after = readFileSync(join(root, REL), 'utf8');
    expect(after).toBe(before); // byte-for-byte unchanged — no `~NaNm` written
    expect(after).not.toContain('NaN');
  });

  it('returns 409 when the target file does not exist', async () => {
    const res = await postTask({
      file: 'does/not/exist.md',
      line: 0,
      expectedText: 'x',
      patch: { state: 'done' },
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(typeof body.conflict).toBe('string');
  });
});

const postCapture = (body: unknown) =>
  fetch(server.url + '/api/capture', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/capture (integration)', () => {
  it('appends a new open task to the given note and returns ok', async () => {
    const note = '01 - Inbox/capture.md';
    const res = await postCapture({ text: 'captured task ~20m', note });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const onDisk = readFileSync(join(root, note), 'utf8');
    expect(onDisk).toContain('- [ ] captured task ~20m');
  });

  it('returns 400 on empty capture text', async () => {
    const res = await postCapture({ text: '   ' });
    expect(res.status).toBe(400);
  });
});
