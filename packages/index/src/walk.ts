// Recursive vault walk. Returns vault-relative POSIX paths of indexable `.md`
// files, pruning dot-directories and anything matched by `roles.excluded` (§7).

import { readdirSync } from 'node:fs';
import { isExcluded, type Config } from '@caius/resolve';

export function walkVault(root: string, config: Config): string[] {
  const out: string[] = [];

  const visit = (relDir: string) => {
    const absDir = relDir ? `${root}/${relDir}` : root;
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue; // .git, .obsidian, .trash, …
        if (isExcluded(`${rel}/`, config)) continue; // pruned excluded folder
        visit(rel);
      } else if (entry.isFile()) {
        if (!entry.name.toLowerCase().endsWith('.md')) continue;
        if (isExcluded(rel, config)) continue;
        out.push(rel);
      }
    }
  };

  visit('');
  out.sort();
  return out;
}
