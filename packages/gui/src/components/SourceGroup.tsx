import type { ReactNode } from 'react';
import type { SourceGroup as Group } from '../lib/grouping';

export function SourceGroup({
  group,
  collapsed,
  onToggle,
  renderTask,
}: {
  group: Group;
  collapsed: boolean;
  onToggle: (key: string) => void;
  renderTask: (t: Group['tasks'][number]) => ReactNode;
}) {
  const icon = group.kind === 'project' ? '\u{1F4C1}' : '\u{1F4C4}';
  return (
    <div data-testid="source-group">
      <button
        onClick={() => onToggle(group.key)}
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
