// Read-only HTTP server (M5) + GUI host (M6). Scans the vault into memory,
// re-scans on file changes (debounced), and serves the funnel/day-plan/explain
// /flags queries plus the single-page GUI.

import { createServer, type ServerResponse } from 'node:http';
import { scanVault, type ScanResult } from '@caius/index';
import { watchVault, type Watcher } from '@caius/watch';
import { DEFAULT_CONFIG, type Config } from '@caius/resolve';
import type { State } from '@caius/core';
import { funnel, filterTasks, dayPlan, explain, flagsSummary } from './query.js';
import { INDEX_HTML } from './gui.js';

export interface ServeOptions {
  root: string;
  port?: number;
  config?: Config;
  now?: Date;
  onRescan?: (result: ScanResult) => void;
}

export interface Server {
  url: string;
  port: number;
  rescan(): void;
  close(): Promise<void>;
}

export function serveCaius(opts: ServeOptions): Promise<Server> {
  const config = opts.config ?? DEFAULT_CONFIG;
  const now = opts.now ?? new Date();
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

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const p = url.pathname;
    const q = url.searchParams;

    if (p === '/' || p === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(INDEX_HTML);
      return;
    }
    if (p === '/api/summary') return json(res, { vault: opts.root, report: result.report });
    if (p === '/api/funnel') return json(res, funnel(result));
    if (p === '/api/flags') return json(res, flagsSummary(result));
    if (p === '/api/day-plan') return json(res, dayPlan(result, now, config.capacity.workday_minutes));
    if (p === '/api/tasks') {
      return json(
        res,
        filterTasks(result, {
          horizon: q.get('horizon') ?? undefined,
          project: q.get('project') ?? undefined,
          state: (q.get('state') as State | null) ?? undefined,
          live: q.has('live') ? q.get('live') === 'true' : undefined,
        }),
      );
    }
    if (p === '/api/explain') {
      const rowid = q.get('rowid');
      const e = explain(result, {
        rowid: rowid != null ? Number(rowid) : undefined,
        blockId: q.get('blockId') ?? undefined,
      });
      return e ? json(res, e) : json(res, null, 404);
    }
    return json(res, { error: 'not found' }, 404);
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
