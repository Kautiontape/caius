import type { UiTask } from '../lib/api';
import type { PendingChange } from '../lib/staging';
import { TaskCard } from './TaskCard';

interface Props {
  source: UiTask[];                  // Orbit (week grain, this week) — the source
  capacityMinutes: number;
  pending: Record<string, PendingChange>;
  onStage: (c: PendingChange) => void;
  onUnstage: (taskId: string) => void;
}

export function DayPlanView({ source, capacityMinutes, pending, onStage, onUnstage }: Props) {
  const slotted = (slot: 'today' | 'tomorrow') =>
    Object.values(pending).filter((c) => c.toGrain === 'day' && c.slot === slot);

  const estFor = (changes: PendingChange[]) =>
    changes.reduce((sum, c) => {
      const t = source.find((s) => s.id === c.taskId);
      return sum + (t?.estMinutes ?? 0);
    }, 0);

  const stageTo = (t: UiTask, slot: 'today' | 'tomorrow') =>
    onStage({
      taskId: t.id,
      fromGrain: 'week',
      toGrain: 'day',
      toBucket: slot === 'today' ? 'this' : 'next',
      slot,
      kind: 'promote',
      snapshot: { file: t.file, line: t.line, text: t.text },
    });

  const column = (title: string, slot: 'today' | 'tomorrow') => {
    const changes = slotted(slot);
    const est = estFor(changes);
    const over = est > capacityMinutes;
    return (
      <div className="flex-1 rounded-lg border border-line bg-panel p-3" data-testid={`day-col-${slot}`}>
        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-dim">
          <span>{title}</span>
          <span data-testid={`cap-${slot}`} className={over ? 'text-over' : ''}>{est}/{capacityMinutes}m</span>
        </div>
        <div className={`mt-1 h-2 rounded-full bg-panel2`}>
          <div className={`h-full rounded-full ${over ? 'bg-over' : 'bg-good'}`} style={{ width: `${capacityMinutes ? Math.min(100, Math.round((100 * est) / capacityMinutes)) : 0}%` }} />
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          {changes.map((c) => {
            const t = source.find((s) => s.id === c.taskId);
            if (!t) return null;
            return <TaskCard key={c.taskId} task={t} actions={<button data-testid="day-unstage" onClick={() => onUnstage(c.taskId)} className="text-dim hover:text-over text-sm">×</button>} />;
          })}
          {changes.length === 0 && <div className="text-xs italic text-dim">empty</div>}
        </div>
      </div>
    );
  };

  return (
    <section data-testid="day-plan-view" className="flex gap-4">
      <div className="flex-1 rounded-lg border border-line bg-panel p-3" data-testid="day-col-source">
        <div className="text-xs uppercase tracking-wide text-dim">Orbit (this week)</div>
        <div className="mt-2 flex flex-col gap-1.5">
          {source.filter((t) => !pending[t.id]).map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              actions={
                <div className="flex gap-1">
                  <button data-testid="slot-today" onClick={() => stageTo(t, 'today')} className="rounded bg-panel2 px-2 py-0.5 text-xs text-accent">today</button>
                  <button data-testid="slot-tomorrow" onClick={() => stageTo(t, 'tomorrow')} className="rounded bg-panel2 px-2 py-0.5 text-xs text-dim">tomorrow</button>
                </div>
              }
            />
          ))}
          {source.every((t) => pending[t.id]) && source.length > 0 && <div className="text-xs italic text-dim">all slotted</div>}
          {source.length === 0 && <div className="text-xs italic text-dim" data-testid="day-source-empty">Orbit is empty.</div>}
        </div>
      </div>
      {column('Today', 'today')}
      {column('Tomorrow', 'tomorrow')}
    </section>
  );
}
