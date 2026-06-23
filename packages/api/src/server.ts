// Read-only HTTP API + host for the built ritual GUI. Scans the vault into
// memory, re-scans on file changes (debounced), serves /api/* queries, the
// review split, the (Phase-1 log-only) commit, and the static GUI from
// packages/gui/dist (with a build-hint fallback when dist is absent).

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanVault, type ScanResult } from '@caius/index';
import { watchVault, type Watcher } from '@caius/watch';
import { DEFAULT_CONFIG, type Config } from '@caius/resolve';
import type { State } from '@caius/core';
import { funnel, filterTasks, reviewSplit, explain, flagsSummary, focus } from './query.js';
import { reconcileCommit, type CommitChange } from './commit.js';
import { handleTaskUpdate } from './task.js';

export interface ServeOptions {
  root: string;
  port?: number;
  config?: Config;
  now?: Date;
  guiDistDir?: string;
  onRescan?: (result: ScanResult) => void;
}

export interface Server {
  url: string;
  port: number;
  rescan(): void;
  close(): Promise<void>;
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const FALLBACK_HTML = `<!doctype html><meta charset="utf-8"><title>Caius</title>
<body style="font-family:system-ui;background:#0e1116;color:#e6edf3;padding:40px">
<h1>Caius</h1><p>The ritual GUI is not built yet. Run <code>pnpm build</code> (or
<code>pnpm dev:gui</code> for the dev server), then reload.</p></body>`;

function extOf(p: string): string {
  const i = p.lastIndexOf('.');
  return i < 0 ? '' : p.slice(i);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}

export function serveCaius(opts: ServeOptions): Promise<Server> {
  const config = opts.config ?? DEFAULT_CONFIG;
  const now = opts.now ?? new Date();
  const guiDist = opts.guiDistDir ?? fileURLToPath(new URL('../../gui/dist', import.meta.url));
  let result: ScanResult = scanVault(opts.root, config, now);

  const rescan = () => {
    try {
      result = scanVault(opts.root, config, now);
      opts.onRescan?.(result);
    } catch {
      /* keep serving the last good index on a transient read error */
    }
  };
  const watcher: Watcher = watchVault(opts.root, config, rescan, { debounceMs: 300 });

  const json = (res: ServerResponse, body: unknown, status = 200) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const serveStatic = (res: ServerResponse, pathname: string) => {
    const rel = pathname === '/' ? '/index.html' : pathname;
    const abs = guiDist + rel;
    if (existsSync(abs) && statSync(abs).isFile()) {
      res.writeHead(200, { 'content-type': CONTENT_TYPES[extOf(abs)] ?? 'application/octet-stream' });
      res.end(readFileSync(abs));
      return;
    }
    // SPA fallback / build hint.
    const indexAbs = guiDist + '/index.html';
    if (existsSync(indexAbs)) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(readFileSync(indexAbs));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(FALLBACK_HTML);
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const p = url.pathname;
    const q = url.searchParams;

    if (p === '/api/summary')
      return json(res, {
        vault: opts.root,
        report: result.report,
        capacityMinutes: config.capacity.workday_minutes,
        obsidian: config.obsidian,
      });
    if (p === '/api/funnel') return json(res, funnel(result));
    if (p === '/api/focus') return json(res, focus(result, now));
    if (p === '/api/flags') return json(res, flagsSummary(result));
    if (p === '/api/tasks') {
      return json(
        res,
        filterTasks(result, {
          horizon: q.get('horizon') ?? undefined,
          grain: q.get('grain') ?? undefined,
          bucket: q.get('bucket') ?? undefined,
          project: q.get('project') ?? undefined,
          state: (q.get('state') as State | null) ?? undefined,
          live: q.has('live') ? q.get('live') === 'true' : undefined,
        }),
      );
    }
    if (p.startsWith('/api/review/')) {
      const grain = decodeURIComponent(p.slice('/api/review/'.length));
      const period = q.get('period') ?? 'this';
      return json(res, reviewSplit(result, grain, period));
    }
    if (p === '/api/explain') {
      const rowid = q.get('rowid');
      const e = explain(result, {
        rowid: rowid != null ? Number(rowid) : undefined,
        blockId: q.get('blockId') ?? undefined,
      });
      return e ? json(res, e) : json(res, null, 404);
    }
    if (p === '/api/commit' && req.method === 'POST') {
      void readBody(req)
        .then((raw) => {
          let changes: CommitChange[] = [];
          try {
            const parsed = JSON.parse(raw || '{}');
            changes = Array.isArray(parsed.changes) ? parsed.changes : [];
          } catch {
            return json(res, { error: 'invalid JSON body' }, 400);
          }
          const fresh = scanVault(opts.root, config, now); // diff-against-fresh-scan, not replay
          const out = reconcileCommit(fresh, changes);
          // Phase 1: log the intended diff; write nothing.
          console.log(`[caius commit] applied ${out.applied.length}, conflicts ${out.conflicts.length}`);
          for (const c of out.applied) {
            const bucket = c.toBucket ? `/${c.toBucket}` : '';
            const slot = c.slot ? ` [${c.slot}]` : '';
            console.log(`  ${c.kind} ${c.snapshot.file}:${c.snapshot.line + 1} ${c.fromGrain}→${c.toGrain}${bucket}${slot}`);
          }
          return json(res, out);
        })
        .catch((e) => json(res, { error: `commit failed: ${String(e)}` }, 500));
      return;
    }
    if (p === '/api/task' && req.method === 'POST') {
      void readBody(req)
        .then((raw) => {
          const out = handleTaskUpdate(opts.root, config, now, raw);
          // A successful write returns a fresh scan; adopt it immediately so a
          // following GET reflects the change without waiting on the watcher's
          // debounce (the watcher will also fire — harmless/idempotent).
          if (out.fresh) {
            result = out.fresh;
            opts.onRescan?.(result);
          }
          return json(res, out.body, out.status);
        })
        .catch((e) => json(res, { error: `task failed: ${String(e)}` }, 500));
      return;
    }
    if (p.startsWith('/api/')) return json(res, { error: 'not found' }, 404);

    return serveStatic(res, p);
  });

  return new Promise((resolve) => {
    server.listen(opts.port ?? 7777, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : (opts.port ?? 7777);
      resolve({
        url: `http://localhost:${port}`,
        port,
        rescan,
        close: () =>
          new Promise<void>((r) => {
            watcher.close();
            server.close(() => r());
          }),
      });
    });
  });
}
