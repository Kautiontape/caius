import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { watchVault, type Watcher } from '../src/index.js';
import { DEFAULT_CONFIG } from '@caius/resolve';

let root: string;
let watcher: Watcher | null;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'caius-watch-'));
  mkdirSync(join(root, '10 - Project/Caius'), { recursive: true });
  mkdirSync(join(root, '01 - Inbox'), { recursive: true });
  watcher = null;
});

afterEach(() => {
  watcher?.close();
  rmSync(root, { recursive: true, force: true });
});

/** Resolve once `onChange` fires, or reject after `ms`. */
function waitForChange(ms: number): { promise: Promise<void>; onChange: () => void } {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const timer = setTimeout(() => reject(new Error('timeout')), ms);
  return {
    promise,
    onChange: () => {
      clearTimeout(timer);
      resolve();
    },
  };
}

describe('watchVault (integration)', () => {
  it('fires onChange when an indexed .md file changes', async () => {
    const { promise, onChange } = waitForChange(2000);
    watcher = watchVault(root, DEFAULT_CONFIG, onChange, { debounceMs: 20 });
    // give the OS watcher a beat to attach
    await new Promise((r) => setTimeout(r, 50));
    writeFileSync(join(root, '10 - Project/Caius/tasks.md'), '- [ ] new task\n');
    await expect(promise).resolves.toBeUndefined();
  });

  it('ignores changes to excluded paths', async () => {
    let calls = 0;
    watcher = watchVault(root, DEFAULT_CONFIG, () => calls++, { debounceMs: 20 });
    await new Promise((r) => setTimeout(r, 50));
    writeFileSync(join(root, '01 - Inbox/capture.md'), '- [ ] inbox\n');
    await new Promise((r) => setTimeout(r, 200));
    expect(calls).toBe(0);
  });
});
