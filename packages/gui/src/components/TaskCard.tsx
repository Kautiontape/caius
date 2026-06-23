import { useContext, type ReactNode } from 'react';
import type { UiTask } from '../lib/api';
import { ObsidianContext, obsidianHref } from '../lib/obsidian';

interface Props {
  task: UiTask;
  staged?: boolean;
  actions?: ReactNode;
  showFile?: boolean;
  dragHandle?: ReactNode;
  onEdit?: () => void;
}

function estLabel(min: number | null): string {
  if (min == null) return 'no est';
  if (min % 60 === 0) return `~${min / 60}h`;
  if (min > 60) return `~${Math.floor(min / 60)}h${min % 60}m`;
  return `~${min}m`;
}

export function TaskCard({ task, staged, actions, showFile, dragHandle, onEdit }: Props) {
  const obsidian = useContext(ObsidianContext);
  return (
    <div
      data-testid="task-card"
      data-staged={staged ? 'true' : 'false'}
      className={`rounded-lg border border-line bg-panel2 p-2.5 ${
        task.inProgress ? 'border-l-2 border-l-good' : ''
      } ${staged ? 'opacity-[0.42]' : ''}`}
    >
      <div className="flex items-start gap-2">
        {dragHandle}
        <div className={`flex-1 text-sm ${task.done ? 'line-through text-dim' : 'text-ink'}`}>
          {task.inProgress && <span className="mr-1 text-good">◷</span>}
          {task.text || '(untitled)'}
        </div>
        {actions}
        {onEdit && (
          <button
            data-testid="edit-open"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="text-dim hover:text-accent text-sm"
          >
            ✎
          </button>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-dim">
        {task.project && <span className="text-accent">{task.project}</span>}
        <span className={task.estMinutes == null ? 'text-warn' : ''}>{estLabel(task.estMinutes)}</span>
        {task.importance > 0 && <span>{'!'.repeat(task.importance)}</span>}
        {showFile && !task.project && (
          <a
            href={obsidianHref(obsidian.vault, task.file, task.line, obsidian.advancedUri)}
            data-testid="file-chip"
            className="rounded border border-line bg-panel px-1.5 text-[11px] text-dim hover:text-accent"
            onClick={(e) => e.stopPropagation()}
          >
            {task.file}
          </a>
        )}
      </div>
    </div>
  );
}
