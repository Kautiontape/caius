import { RITUALS, GRAIN_LABEL, PREV_GRAIN, PERIOD_LABEL, type Altitude } from '../lib/grains';
import type { UiTask } from '../lib/api';
import type { PendingChange } from '../lib/staging';
import { TaskCard } from './TaskCard';

interface Props {
  altitude: Altitude;
  done: UiTask[];
  open: UiTask[];
  pending: Record<string, PendingChange>;
  onStage: (c: PendingChange) => void;
  onUnstage: (taskId: string) => void;
}

export function ReviewView({ altitude, done, open, pending, onStage, onUnstage }: Props) {
  const ritual = RITUALS[altitude].review;
  const grain = ritual.grain!;
  const back = PREV_GRAIN[grain];
  const nextLabel = PERIOD_LABEL[altitude].next;

  const snap = (t: UiTask) => ({ file: t.file, line: t.line, text: t.text });

  const defer = (t: UiTask) =>
    onStage({ taskId: t.id, fromGrain: grain, toGrain: grain, toBucket: 'next', kind: 'defer', snapshot: snap(t) });
  const rollback = (t: UiTask) =>
    back && onStage({ taskId: t.id, fromGrain: grain, toGrain: back, toBucket: 'this', kind: 'rollback', snapshot: snap(t) });
  const drop = (t: UiTask) =>
    onStage({ taskId: t.id, fromGrain: grain, toGrain: grain, kind: 'drop', snapshot: snap(t) });

  return (
    <section data-testid="review-view" className="flex flex-col gap-4">
      <div>
        <div className="mb-1.5 text-xs uppercase tracking-wide text-dim" data-testid="review-done">Completed ({done.length})</div>
        <div className="flex flex-col gap-1.5">
          {done.map((t) => <TaskCard key={t.id} task={t} showFile />)}
          {done.length === 0 && <div className="text-xs italic text-dim">nothing completed yet</div>}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-xs uppercase tracking-wide text-dim" data-testid="review-open">Still open ({open.length})</div>
        <div className="flex flex-col gap-1.5">
          {open.map((t) => {
            const staged = !!pending[t.id];
            return (
              <TaskCard
                key={t.id}
                task={t}
                showFile
                staged={staged}
                actions={
                  staged ? (
                    <button data-testid="review-unstage" onClick={() => onUnstage(t.id)} className="text-dim hover:text-over text-sm">undo</button>
                  ) : (
                    <div className="flex gap-1 text-xs">
                      <button data-testid="review-defer" onClick={() => defer(t)} className="rounded bg-panel2 px-2 py-0.5 text-accent">defer → {nextLabel}</button>
                      {back && <button data-testid="review-rollback" onClick={() => rollback(t)} className="rounded bg-panel2 px-2 py-0.5 text-dim">↑ {GRAIN_LABEL[back]}</button>}
                      <button data-testid="review-drop" onClick={() => drop(t)} className="rounded bg-panel2 px-2 py-0.5 text-over">drop</button>
                    </div>
                  )
                }
              />
            );
          })}
          {open.length === 0 && <div className="text-xs italic text-dim" data-testid="review-clear">all clear ✓</div>}
        </div>
      </div>
    </section>
  );
}
