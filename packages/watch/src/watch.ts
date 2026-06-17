// Vault watcher (M4). Node's recursive fs.watch fires on any change under the
// vault; we filter to indexable `.md` paths and debounce a coalesced callback.
// A full re-scan on change is cheap (~130ms over the real vault), so the
// callback re-scans rather than patching individual rows — simpler and robust.

import { watch } from 'node:fs';
import { isExcluded, type Config } from '@caius/resolve';
import { debounce } from './debounce.js';

export interface Watcher {
  close(): void;
}

export interface WatchOptions {
  debounceMs?: number;
}

export function watchVault(
  root: string,
  config: Config,
  onChange: () => void,
  opts: WatchOptions = {},
): Watcher {
  const trigger = debounce(onChange, opts.debounceMs ?? 200);
  const fsWatcher = watch(root, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    const rel = filename.toString().replaceAll('\\', '/');
    if (!rel.toLowerCase().endsWith('.md')) return;
    if (isExcluded(rel, config)) return;
    trigger();
  });
  return {
    close() {
      fsWatcher.close();
      trigger.cancel();
    },
  };
}
