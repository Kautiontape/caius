import { useRef, type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GRAIN_LABEL, type Grain } from '../lib/grains';
import type { SourceGroup as Group } from '../lib/grouping';
import type { UiTask } from '../lib/api';

type Row = { kind: 'header'; group: Group } | { kind: 'task'; task: UiTask };

interface Props {
  sourceTier: Grain;
  sourceTabs: Grain[];
  onAimSource: (t: Grain) => void;
  label?: string;
  groups: Group[];
  toolbar?: ReactNode;
  collapsed: Record<string, boolean>;
  anyExpanded: boolean;
  onToggle: (key: string) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onArchiveAll: (group: Group) => void;
  renderTask: (t: UiTask) => ReactNode;
}

/** Anchored left column. The header/toolbar are static; the grouped task list is
 * virtualized (padding-spacer pattern) so a huge backlog renders only visible rows
 * while drag-and-drop still works (no per-row transforms). The whole column is the
 * 'source' drop target (drop a staged card here to un-stage). */
export function SourceColumn({ sourceTier, sourceTabs, onAimSource, label, groups, toolbar, collapsed, anyExpanded, onToggle, onCollapseAll, onExpandAll, onArchiveAll, renderTask }: Props) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: 'source' });
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const rows: Row[] = [];
  for (const group of groups) {
    rows.push({ kind: 'header', group });
    if (collapsed[group.key] === false) for (const task of group.tasks) rows.push({ kind: 'task', task });
  }

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i]!.kind === 'header' ? 30 : 66),
    overscan: 14,
    getItemKey: (i) => { const r = rows[i]!; return r.kind === 'header' ? `h:${r.group.key}` : `t:${r.task.id}`; },
  });

  const items = virtualizer.getVirtualItems();
  const padTop = items.length ? items[0]!.start : 0;
  const padBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1]!.end : 0;

  return (
    <div ref={setDropRef} data-testid="source"
      className={`flex max-h-[calc(100vh-170px)] flex-col rounded-lg border bg-panel p-3 shadow-sm transition-all ${isOver ? 'border-accent ring-2 ring-accent/50' : 'border-line'}`}>
      <div className="mb-2 flex items-center justify-between">
        {label ? (
          <span className="text-xs uppercase tracking-wide text-dim">{label}</span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-dim">Source</span>
            {sourceTabs.length > 1 ? (
              <div className="flex rounded-full bg-panel2 p-0.5 text-[11px]" data-testid="source-tabs">
                {sourceTabs.map((t) => (
                  <button key={t} data-testid={`source-tab-${t}`} onClick={() => onAimSource(t)}
                    className={`rounded-full px-2.5 py-0.5 ${t === sourceTier ? 'bg-accent text-bg' : 'text-dim hover:text-ink'}`}>{GRAIN_LABEL[t]}</button>
                ))}
              </div>
            ) : (
              <span className="text-xs uppercase tracking-wide text-dim">· {GRAIN_LABEL[sourceTier]}</span>
            )}
          </div>
        )}
        {groups.length > 0 && (
          <button data-testid="collapse-all" onClick={anyExpanded ? onCollapseAll : onExpandAll} className="text-xs text-dim hover:text-ink">{anyExpanded ? 'Collapse all' : 'Expand all'}</button>
        )}
      </div>
      {toolbar}
      {groups.length === 0 && <div data-testid="source-empty" className="italic text-dim">No matching tasks.</div>}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div style={{ paddingTop: padTop, paddingBottom: padBottom }}>
          {items.map((vi) => {
            const row = rows[vi.index]!;
            return (
              <div key={vi.key} data-index={vi.index} ref={virtualizer.measureElement}>
                {row.kind === 'header'
                  ? <GroupHeader group={row.group} collapsed={collapsed[row.group.key] !== false} onToggle={onToggle} onArchiveAll={onArchiveAll} />
                  : <div className="pb-1.5">{renderTask(row.task)}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GroupHeader({ group, collapsed, onToggle, onArchiveAll }: { group: Group; collapsed: boolean; onToggle: (key: string) => void; onArchiveAll: (group: Group) => void }) {
  const icon = group.kind === 'project' ? '\u{1F4C1}' : '\u{1F4C4}';
  return (
    <div data-testid="source-group" className="flex w-full items-center gap-1 py-1 text-xs uppercase tracking-wide text-dim">
      <button onClick={() => onToggle(group.key)} data-testid={`group-toggle-${group.key}`} className="flex flex-1 items-center gap-1 text-left">
        <span>{collapsed ? '▸' : '▾'}</span><span>{icon}</span><span>{group.title}</span>
        <span className="ml-1 normal-case">({group.tasks.length})</span>
      </button>
      {group.tasks.length > 0 && (
        <button data-testid={`group-archive-${group.key}`} title={`Archive all ${group.tasks.length} (won't do)`} onClick={() => onArchiveAll(group)} className="normal-case text-dim hover:text-over">🗑 all</button>
      )}
    </div>
  );
}
