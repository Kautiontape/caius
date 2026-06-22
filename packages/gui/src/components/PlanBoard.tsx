import { useEffect, useState } from 'react';
import { BUCKETS, type Altitude } from '../lib/grains';
import { fetchTasksAtGrain, type UiTask } from '../lib/api';
import { groupSource } from '../lib/grouping';
import type { PendingChange, StagingBuffer } from '../lib/staging';
import type { CommitResult } from '../lib/staging';
import { SourceGroup } from './SourceGroup';
import { HorizonBucket } from './HorizonBucket';
import { TaskCard } from './TaskCard';

interface Props {
  altitude: Altitude;
  capacityMinutes: number;
  buffer: StagingBuffer;
  onStage: (c: PendingChange) => void;
  onUnstage: (taskId: string) => void;
  onCommit: () => void;
  conflicts: CommitResult['conflicts'];
}

export function PlanBoard({ altitude, capacityMinutes, buffer, onStage, onUnstage, onCommit, conflicts }: Props) {
  const [source, setSource] = useState<UiTask[]>([]);
  const [members, setMembers] = useState<Record<string, UiTask[]>>({ month: [], week: [], day: [] });

  useEffect(() => { void fetchTasksAtGrain('someday').then(setSource); }, []);
  useEffect(() => {
    for (const g of BUCKETS) void fetchTasksAtGrain(g, 'this').then((ts) => setMembers((m) => ({ ...m, [g]: ts })));
  }, []);

  const stageInto = (t: UiTask, grain: 'month' | 'week' | 'day') => onStage({
    taskId: t.id, fromGrain: t.grain ?? 'someday', toGrain: grain,
    toBucket: 'this', slot: grain === 'day' ? 'today' : undefined,
    kind: 'promote', snapshot: { file: t.file, line: t.line, text: t.text },
  });

  const stagedFor = (grain: string) => Object.values(buffer).filter((c) => c.toGrain === grain);
  const unstaged = source.filter((t) => !buffer[t.id]);
  const estFor = (tasks: UiTask[]) => tasks.reduce((s, t) => s + (t.estMinutes ?? 0), 0);

  return (
    <section data-testid="plan-board" className="grid grid-cols-[1.4fr_1fr] gap-5 p-5">
      <div className="rounded-lg border border-line bg-panel p-3 shadow-sm" data-testid="source">
        <div className="mb-2 text-xs uppercase tracking-wide text-dim">Source · Someday backlog</div>
        {unstaged.length === 0 && <div className="italic text-dim" data-testid="source-empty">Someday is empty.</div>}
        {groupSource(unstaged).map((group) => (
          <SourceGroup
            key={group.key}
            group={group}
            renderTask={(t) => (
              <TaskCard
                key={t.id}
                task={t}
                showFile
                actions={
                  <div className="flex gap-1">
                    {BUCKETS.map((g) => (
                      <button key={g} onClick={() => stageInto(t, g)} data-testid={`stage-${g}`}
                        className="rounded bg-panel2 px-1.5 py-0.5 text-[11px] text-accent">{g.charAt(0).toUpperCase()}</button>
                    ))}
                  </div>
                }
              />
            )}
          />
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {BUCKETS.map((g) => {
          const staged = stagedFor(g);
          const member = members[g] ?? [];
          const stagedTasks = staged.map((c) => source.find((s) => s.id === c.taskId)).filter((t): t is UiTask => !!t);
          const cards = [
            ...member.map((t) => <TaskCard key={`m-${t.id}`} task={t} showFile />),
            ...stagedTasks.map((t) => <TaskCard key={`s-${t.id}`} task={t} staged showFile
                actions={<button onClick={() => onUnstage(t.id)} className="text-dim hover:text-over text-sm">×</button>} />),
          ];
          return (
            <HorizonBucket
              key={g}
              grain={g}
              emphasized={g === altitude}
              count={member.length + staged.length}
              capacity={g === 'day' ? { estMinutes: estFor([...member, ...stagedTasks]), capacityMinutes } : undefined}
            >
              {cards.length ? cards : <div className="text-xs italic text-dim">empty</div>}
            </HorizonBucket>
          );
        })}
        {conflicts.length > 0 && (
          <div className="rounded border border-over/40 p-2 text-xs text-over" data-testid="board-conflicts">
            {conflicts.length} conflict(s) kept staged.
          </div>
        )}
        <button data-testid="commit-button" disabled={Object.keys(buffer).length === 0} onClick={onCommit}
          className="rounded-lg bg-accent px-3 py-2 text-bg disabled:opacity-40">commit plan</button>
      </div>
    </section>
  );
}
