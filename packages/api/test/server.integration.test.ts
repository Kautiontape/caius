import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveCaius, type Server } from '../src/index.js';

let root: string;
let server: Server;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'caius-srv-'));
  const file = (rel: string, body: string) => {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, body);
  };
  file('10 - Project/Caius/tasks.md', ['- [/] Working on it', '- [ ] Backlog item', '- [x] Done'].join('\n'));
  file('02 - Periodic/Daily/2023/05/2023-05-20.md', '- [ ] Stale overdue task\n');
  server = await serveCaius({ root, port: 0, now: new Date(2026, 5, 17) });
});

afterAll(async () => {
  await server.close();
  rmSync(root, { recursive: true, force: true });
});

const api = (path: string) => fetch(server.url + path).then((r) => r.json());

describe('serveCaius (integration)', () => {
  it('serves an HTML page at / (build fallback when dist is absent)', async () => {
    const res = await fetch(server.url + '/');
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Caius');
  });

  it('GET /api/summary reports the index', async () => {
    const s = await api('/api/summary');
    expect(s.vault).toBe(root);
    expect(s.report.taskCount).toBe(4);
    expect(s.report.liveCount).toBe(3); // 2 in the project note + 1 overdue daily task
  });

  it('GET /api/summary includes capacityMinutes', async () => {
    const s = await api('/api/summary');
    expect(s.capacityMinutes).toBe(480);
  });

  it('GET /api/funnel returns live lanes + a now lane', async () => {
    const f = await api('/api/funnel');
    expect(f.now.map((t: { text: string }) => t.text)).toEqual(['Working on it']);
    const overdue = f.lanes.find((l: { horizon: string }) => l.horizon === 'overdue');
    expect(overdue.count).toBe(1);
    expect(typeof f.byGrain).toBe('object');
  });

  it('GET /api/explain returns provenance by rowid', async () => {
    const tasks = await api('/api/tasks?live=true');
    const overdue = tasks.find((t: { text: string }) => t.text === 'Stale overdue task');
    const e = await api('/api/explain?rowid=' + overdue.rowid);
    const horizon = e.derivations.find((d: { axis: string }) => d.axis === 'horizon');
    expect(horizon.value).toBe('overdue');
    expect(horizon.source).toContain('2023-05-20');
  });

  it('GET /api/flags returns an array', async () => {
    expect(Array.isArray(await api('/api/flags'))).toBe(true);
  });
});
