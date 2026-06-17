import { RITUALS, GRAIN_LABEL, NEXT_GRAIN, type Altitude, type Grain } from '../lib/grains';
import type { UiTask } from '../lib/api';
import type { PendingChange } from '../lib/staging';
import { TaskCard } from './TaskCard';
import { SkipMenu } from './SkipMenu';

interface Props {
  altitude: Altitude;
  source: UiTask[];                 // tasks at the `from` grain
  targetBucket: 'this' | 'next';
  pending: Record<string, PendingChange>;
  onStage: (c: PendingChange) => void;
  onUnstage: (taskId: string) => void;
}

function groupByProject(tasks: UiTask[]): [string, UiTask[]][] {
  const m = new Map<string, UiTask[]>();
  for (const t of tasks) {
    const k = t.project ?? 'no project';
    (m.get(k) ?? m.set(k, []).get(k)!).push(t);
  }
  return [...m.entries()];
}

export function PlanView({ altitude, source, targetBucket, pending, onStage, onUnstage }: Props) {
  const ritual = RITUALS[altitude].plan;
  const from = ritual.from!;
  const defaultTo = NEXT_GRAIN[from]!;

  const stage = (t: UiTask, toGrain: Grain, isSkip: boolean) => {
    const change: PendingChange = {
      taskId: t.id,
      fromGrain: t.grain ?? from,
      toGrain,
      toBucket: targetBucket,
      slot: toGrain === 'day' ? (targetBucket === 'this' ? 'today' : 'tomorrow') : undefined,
      kind: isSkip ? 'skip' : 'promote',
      snapshot: { file: t.file, line: t.line, text: t.text },
    };
    onStage(change);
  };

  return (
    <section data-testid="plan-view" className="flex flex-col gap-4">
      {source.length === 0 && <div className="italic text-dim" data-testid="plan-empty">Nothing in {GRAIN_LABEL[from]}.</div>}
      {groupByProject(source).map(([project, tasks]) => (
        <div key={project}>
          <div className="mb-1.5 text-xs uppercase tracking-wide text-dim">{project}</div>
          <div className="flex flex-col gap-1.5">
            {tasks.map((t) => {
              const staged = !!pending[t.id];
              return (
                <TaskCard
                  key={t.id}
                  task={t}
                  staged={staged}
                  actions={
                    staged ? (
                      <button data-testid="plan-unstage" onClick={() => onUnstage(t.id)} className="text-dim hover:text-over text-sm">undo</button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          data-testid="plan-promote"
                          onClick={() => stage(t, defaultTo, false)}
                          className="rounded bg-panel2 px-2 py-0.5 text-xs text-accent hover:bg-line"
                        >
                          → {GRAIN_LABEL[defaultTo]}
                        </button>
                        <SkipMenu current={from} onPick={(g, isSkip) => stage(t, g, isSkip)} />
                      </div>
                    )
                  }
                />
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
