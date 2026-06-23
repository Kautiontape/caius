import { useContext, useState, type ReactNode } from 'react';
import type { UiTask } from '../lib/api';
import { ObsidianContext, obsidianHref } from '../lib/obsidian';
import { displayPath } from '../lib/grouping';
import { InlineText } from './InlineText';

interface Props {
  task: UiTask;
  staged?: boolean;
  actions?: ReactNode;
  showFile?: boolean;
  dragHandle?: ReactNode;
  onEdit?: () => void;
  onArchive?: () => void;
  onPromote?: () => void;
  onQuickEstimate?: (min: number) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  daysLate?: number;
  onReschedule?: (date: string) => void;
}

function estLabel(min: number | null): string {
  if (min == null) return 'no est';
  if (min % 60 === 0) return `~${min / 60}h`;
  if (min > 60) return `~${Math.floor(min / 60)}h${min % 60}m`;
  return `~${min}m`;
}

const EST_CHIPS = [15, 30, 45, 60, 120];
const chipLabel = (m: number) => (m % 60 === 0 ? `${m / 60}h` : `${m}m`);

export function TaskCard({ task, staged, actions, showFile, dragHandle, onEdit, onArchive, onPromote, onQuickEstimate, selectable, selected, onToggleSelect, daysLate, onReschedule }: Props) {
  const obsidian = useContext(ObsidianContext);
  const [estOpen, setEstOpen] = useState(false);
  return (
    <div
      data-testid="task-card"
      data-staged={staged ? 'true' : 'false'}
      className={`group rounded-lg border border-line bg-panel2 p-2.5 ${task.inProgress ? 'border-l-2 border-l-good' : ''} ${staged ? 'opacity-[0.42]' : ''} ${selected ? 'ring-1 ring-accent' : ''}`}
    >
      <div className="flex items-start gap-2">
        {selectable && (
          <input type="checkbox" data-testid="select-task" checked={!!selected} onChange={onToggleSelect} className="mt-0.5 accent-accent" />
        )}
        {dragHandle}
        <div className={`flex-1 text-sm ${task.done ? 'line-through text-dim' : 'text-ink'}`}>
          {task.inProgress && <span className="mr-1 text-good">◷</span>}
          {task.text ? <InlineText text={task.text} /> : '(untitled)'}
        </div>
        {actions}
        {onPromote && (
          <button data-testid="promote-task" title="Promote" onClick={(e) => { e.stopPropagation(); onPromote(); }}
            className="text-sm text-dim opacity-0 hover:text-good group-hover:opacity-100">→</button>
        )}
        {onEdit && (
          <button data-testid="edit-open" onClick={(e) => { e.stopPropagation(); onEdit(); }} className="text-sm text-dim hover:text-accent">✎</button>
        )}
        {onArchive && (
          <button data-testid="archive-task" title="Archive (won't do)" onClick={(e) => { e.stopPropagation(); onArchive(); }} className="text-sm text-dim hover:text-over">🗃</button>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-dim">
        {task.project && <span className="text-accent">{task.project}</span>}
        {onQuickEstimate ? (
          <span className="inline-flex items-center gap-1">
            <button data-testid="quick-est" onClick={(e) => { e.stopPropagation(); setEstOpen((o) => !o); }}
              className={`underline decoration-dotted ${task.estMinutes == null ? 'text-warn' : ''}`}>{estLabel(task.estMinutes)} ▾</button>
            {estOpen && EST_CHIPS.map((m) => (
              <button key={m} data-testid={`est-chip-${m}`} onClick={(e) => { e.stopPropagation(); onQuickEstimate(m); setEstOpen(false); }}
                className="rounded border border-line px-1.5 py-0.5 text-ink hover:border-accent">{chipLabel(m)}</button>
            ))}
          </span>
        ) : (
          <span className={task.estMinutes == null ? 'text-warn' : ''}>{estLabel(task.estMinutes)}</span>
        )}
        {task.importance > 0 && <span>{'!'.repeat(task.importance)}</span>}
        {daysLate != null && daysLate > 0 && <span data-testid="days-late" className="font-medium text-over">{daysLate}d late</span>}
        {onReschedule && (
          <input
            type="date"
            data-testid="reschedule"
            defaultValue={task.due ?? ''}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { if (e.target.value) onReschedule(e.target.value); }}
            className="rounded border border-line bg-panel px-1 text-[11px] text-ink"
          />
        )}
        {showFile && !task.project && (
          <a href={obsidianHref(obsidian.vault, task.file, task.line, obsidian.advancedUri)} data-testid="file-chip"
            className="rounded border border-line bg-panel px-1.5 text-[11px] text-dim hover:text-accent" onClick={(e) => e.stopPropagation()}>
            {displayPath(task.file)}
          </a>
        )}
      </div>
    </div>
  );
}
