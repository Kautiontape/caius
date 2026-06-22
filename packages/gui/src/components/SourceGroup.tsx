import { useState, type ReactNode } from 'react';
import type { SourceGroup as Group } from '../lib/grouping';

const KEY = (k: string) => `caius-collapsed:${k}`;

export function SourceGroup({ group, renderTask }: { group: Group; renderTask: (t: Group['tasks'][number]) => ReactNode }) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY(group.key)) === '1'; } catch { return false; }
  });
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(KEY(group.key), next ? '1' : '0'); } catch { /* ignore */ }
  };
  const icon = group.kind === 'project' ? '\u{1F4C1}' : '\u{1F4C4}';
  return (
    <div data-testid="source-group">
      <button
        onClick={toggle}
        data-testid={`group-toggle-${group.key}`}
        className="mb-1.5 flex w-full items-center gap-1 text-xs uppercase tracking-wide text-dim"
      >
        <span>{collapsed ? '▸' : '▾'}</span><span>{icon}</span><span>{group.title}</span>
        <span className="ml-1 normal-case">({group.tasks.length})</span>
      </button>
      {!collapsed && <div className="mb-3 flex flex-col gap-1.5">{group.tasks.map(renderTask)}</div>}
    </div>
  );
}
