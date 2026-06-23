import { type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { GRAIN_LABEL, type Grain } from '../lib/grains';
import type { SourceGroup as Group } from '../lib/grouping';
import { SourceGroup } from './SourceGroup';

interface Props {
  sourceTier: Grain;
  groups: Group[];
  toolbar?: ReactNode;
  collapsed: Record<string, boolean>;
  anyExpanded: boolean;
  onToggle: (key: string) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onArchiveAll: (group: Group) => void;
  renderTask: (t: Group['tasks'][number]) => ReactNode;
}

/** Anchored left column: the grain's source tier as collapsible groups (already
 * filtered/sorted by the caller). Droppable — dropping a staged card here un-stages it. */
export function SourceColumn({ sourceTier, groups, toolbar, collapsed, anyExpanded, onToggle, onCollapseAll, onExpandAll, onArchiveAll, renderTask }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'source' });
  return (
    <div ref={setNodeRef} data-testid="source" className={`flex flex-col rounded-lg border bg-panel p-3 shadow-sm transition-all ${isOver ? 'border-accent ring-2 ring-accent/50' : 'border-line'}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-dim">Source · {GRAIN_LABEL[sourceTier]}</span>
        {groups.length > 0 && (
          <button data-testid="collapse-all" onClick={anyExpanded ? onCollapseAll : onExpandAll} className="text-xs text-dim hover:text-ink">{anyExpanded ? 'Collapse all' : 'Expand all'}</button>
        )}
      </div>
      {toolbar}
      {groups.length === 0 && <div data-testid="source-empty" className="italic text-dim">No matching tasks.</div>}
      <div className="overflow-auto">
        {groups.map((group) => (
          <SourceGroup key={group.key} group={group} collapsed={collapsed[group.key] !== false} onToggle={onToggle} onArchiveAll={onArchiveAll} renderTask={renderTask} />
        ))}
      </div>
    </div>
  );
}
