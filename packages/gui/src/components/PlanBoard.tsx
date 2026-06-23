import { useEffect, useState, type ReactNode } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { BUCKETS, type Altitude, type Grain } from '../lib/grains';
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

/** A draggable TaskCard: a grip handle activates the drag; the card follows the pointer. */
function DraggableCard({ task, showFile, staged }: { task: UiTask; showFile?: boolean; staged?: boolean }) {
  const { setNodeRef, listeners, attributes, transform, isDragging } = useDraggable({ id: task.id });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : undefined,
  };
  const handle = (
    <button
      {...listeners}
      {...attributes}
      aria-label="drag"
      className="cursor-grab touch-none select-none text-dim hover:text-ink"
    >
      ⠿
    </button>
  );
  return (
    <div ref={setNodeRef} style={style}>
      <TaskCard task={task} showFile={showFile} staged={staged} dragHandle={handle} />
    </div>
  );
}

export function PlanBoard({ altitude, capacityMinutes, buffer, onStage, onUnstage, onCommit, conflicts }: Props) {
  const [source, setSource] = useState<UiTask[]>([]);
  const [members, setMembers] = useState<Record<string, UiTask[]>>({ month: [], week: [], day: [] });
  const [dragging, setDragging] = useState(false);

  useEffect(() => { void fetchTasksAtGrain('someday').then(setSource); }, []);
  useEffect(() => {
    for (const g of BUCKETS) void fetchTasksAtGrain(g, 'this').then((ts) => setMembers((m) => ({ ...m, [g]: ts })));
  }, []);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

  // Combined lookup: a card dragged bucket→bucket is a member, not in `source`.
  const byId = new Map<string, UiTask>();
  for (const t of source) byId.set(t.id, t);
  for (const g of BUCKETS) for (const t of members[g] ?? []) byId.set(t.id, t);

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(false);
    const taskId = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    if (!over) return;

    if (over === 'source') { onUnstage(taskId); return; } // drop back to backlog = un-stage

    const grain = over.replace('bucket:', '') as 'month' | 'week' | 'day';
    const slot = grain === 'day' ? ('today' as const) : undefined;
    const task = byId.get(taskId);
    if (task) {
      onStage({
        taskId, fromGrain: task.grain ?? 'someday', toGrain: grain,
        toBucket: 'this', slot, kind: 'promote',
        snapshot: { file: task.file, line: task.line, text: task.text },
      });
      return;
    }
    // Fall back to an already-staged change's snapshot (e.g. re-staging a staged card).
    const existing = buffer[taskId];
    if (existing) {
      onStage({ ...existing, toGrain: grain, toBucket: 'this', slot });
    }
  };

  const stagedFor = (grain: Grain) => Object.values(buffer).filter((c) => c.toGrain === grain);
  const unstaged = source.filter((t) => !buffer[t.id]);
  const estFor = (tasks: UiTask[]) => tasks.reduce((s, t) => s + (t.estMinutes ?? 0), 0);

  return (
    <DndContext sensors={sensors} onDragStart={() => setDragging(true)} onDragEnd={onDragEnd}>
      <section data-testid="plan-board" className="grid grid-cols-[1.4fr_1fr] gap-5 p-5">
        <SourceDroppable>
          <div className="mb-2 text-xs uppercase tracking-wide text-dim">Source · Someday backlog</div>
          {unstaged.length === 0 && <div className="italic text-dim" data-testid="source-empty">Someday is empty.</div>}
          {groupSource(unstaged).map((group) => (
            <SourceGroup
              key={group.key}
              group={group}
              renderTask={(t) => <DraggableCard key={t.id} task={t} showFile />}
            />
          ))}
        </SourceDroppable>

        <div className="flex flex-col gap-3">
          {BUCKETS.map((g) => {
            const staged = stagedFor(g);
            const member = members[g] ?? [];
            // Resolve staged cards from the combined source∪members lookup, so cards staged
            // from a bucket (not just Someday) still render with their text.
            const stagedTasks = staged
              .map((c) => byId.get(c.taskId))
              .filter((t): t is UiTask => !!t);
            const cards = [
              ...member.map((t) => <TaskCard key={`m-${t.id}`} task={t} showFile />),
              ...stagedTasks.map((t) => (
                <DraggableCard key={`s-${t.id}`} task={t} staged showFile />
              )),
            ];
            return (
              <BucketDroppable key={g} grain={g}>
                <HorizonBucket
                  grain={g}
                  emphasized={g === altitude}
                  count={member.length + staged.length}
                  dropActive={dragging}
                  capacity={g === 'day' ? { estMinutes: estFor([...member, ...stagedTasks]), capacityMinutes } : undefined}
                >
                  {cards.length ? cards : <div className="text-xs italic text-dim">empty</div>}
                </HorizonBucket>
              </BucketDroppable>
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
    </DndContext>
  );
}

/** The Source container is a drop target: dropping a staged card here un-stages it. */
function SourceDroppable({ children }: { children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'source' });
  return (
    <div
      ref={setNodeRef}
      data-testid="source"
      className={`rounded-lg border bg-panel p-3 shadow-sm transition-all ${
        isOver ? 'border-accent ring-2 ring-accent/50' : 'border-line'
      }`}
    >
      {children}
    </div>
  );
}

/** Wraps a HorizonBucket so it's a `bucket:<grain>` drop target during a drag. */
function BucketDroppable({ grain, children }: { grain: 'month' | 'week' | 'day'; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `bucket:${grain}` });
  return <div ref={setNodeRef}>{children}</div>;
}
