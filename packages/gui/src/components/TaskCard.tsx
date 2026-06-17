import type { ReactNode } from 'react';
import type { UiTask } from '../lib/api';

interface Props {
  task: UiTask;
  staged?: boolean;
  actions?: ReactNode;
}

function estLabel(min: number | null): string {
  if (min == null) return 'no est';
  if (min % 60 === 0) return `~${min / 60}h`;
  if (min > 60) return `~${Math.floor(min / 60)}h${min % 60}m`;
  return `~${min}m`;
}

export function TaskCard({ task, staged, actions }: Props) {
  return (
    <div
      data-testid="task-card"
      data-staged={staged ? 'true' : 'false'}
      className={`rounded-lg border border-line bg-panel2 p-2.5 ${
        task.inProgress ? 'border-l-2 border-l-good' : ''
      } ${staged ? 'opacity-[0.42]' : ''}`}
    >
      <div className="flex items-start gap-2">
        <div className={`flex-1 text-sm ${task.done ? 'line-through text-dim' : 'text-ink'}`}>
          {task.inProgress && <span className="mr-1 text-good">◷</span>}
          {task.text || '(untitled)'}
        </div>
        {actions}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-dim">
        {task.project && <span className="text-accent">{task.project}</span>}
        <span className={task.estMinutes == null ? 'text-warn' : ''}>{estLabel(task.estMinutes)}</span>
        {task.importance > 0 && <span>{'!'.repeat(task.importance)}</span>}
      </div>
    </div>
  );
}
