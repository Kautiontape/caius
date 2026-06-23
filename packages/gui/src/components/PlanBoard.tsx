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
import { fetchTasksAtGrain, postTask, type UiTask } from '../lib/api';
import { groupSource, type SourceGroup as Group } from '../lib/grouping';
import type { PendingChange, StagingBuffer } from '../lib/staging';
import type { CommitResult } from '../lib/staging';
import { SourceGroup } from './SourceGroup';
import { HorizonBucket } from './HorizonBucket';
import { TaskCard } from './TaskCard';
import { EditModal } from './EditModal';
import { QuickAdd } from './QuickAdd';
import { summarizeBuffer } from '../lib/commitSummary';
import { CommitSummaryModal } from './CommitSummaryModal';

interface Props {
  altitude: Altitude;
  capacityMinutes: number;
  buffer: StagingBuffer;
  onStage: (c: PendingChange) => void;
  onUnstage: (taskId: string) => void;
  onCommit: () => Promise<CommitResult>;
  conflicts: CommitResult['conflicts'];
}

/** A draggable TaskCard: a grip handle activates the drag; the card follows the pointer. */
function DraggableCard({ task, showFile, staged, onEdit, onArchive }: { task: UiTask; showFile?: boolean; staged?: boolean; onEdit?: () => void; onArchive?: () => void }) {
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
      <TaskCard task={task} showFile={showFile} staged={staged} dragHandle={handle} onEdit={onEdit} onArchive={onArchive} />
    </div>
  );
}

const COLLAPSED_KEY = 'caius-collapsed';

function loadCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch { /* ignore */ }
  return {};
}

function saveCollapsed(map: Record<string, boolean>) {
  try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

export function PlanBoard({ altitude, capacityMinutes, buffer, onStage, onUnstage, onCommit, conflicts }: Props) {
  const [source, setSource] = useState<UiTask[]>([]);
  const [members, setMembers] = useState<Record<string, UiTask[]>>({ month: [], week: [], day: [] });
  const [dragging, setDragging] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);
  const [editing, setEditing] = useState<UiTask | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = () => {
    void fetchTasksAtGrain('someday').then(setSource);
    for (const g of BUCKETS) void fetchTasksAtGrain(g, 'this').then((ts) => setMembers((m) => ({ ...m, [g]: ts })));
  };
  useEffect(() => { refresh(); }, []);

  // Archive = mark a task won't-do ([-] cancelled) via the in-place write endpoint.
  const archive = (t: UiTask) =>
    postTask({ file: t.file, line: t.line, expectedText: t.text, patch: { state: 'cancelled' } });
  const archiveOne = async (t: UiTask) => { await archive(t); refresh(); };
  // Archive-all is SEQUENTIAL: tasks in one document group share a file, and the
  // write reconciles by re-reading that file each time — parallel writes to the
  // same file would clobber each other. Cancelling leaves text/line stable, so
  // each task's expectedText still matches after the prior archive.
  const archiveAll = async (group: Group) => {
    if (!window.confirm(`Archive all ${group.tasks.length} task(s) in "${group.title}" as won't-do?`)) return;
    for (const t of group.tasks) await archive(t);
    refresh();
  };

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      // missing or true → collapsed; false → expanded. First toggle expands.
      const wasCollapsed = prev[key] !== false;
      const next = { ...prev, [key]: !wasCollapsed };
      saveCollapsed(next);
      return next;
    });
  };

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

    if (!over.startsWith('bucket:')) return;
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

  const sourceGroups = groupSource(unstaged);
  const anyExpanded = sourceGroups.some((g) => collapsed[g.key] === false);

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    for (const g of sourceGroups) next[g.key] = true;
    saveCollapsed(next);
    setCollapsed(next);
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    for (const g of sourceGroups) next[g.key] = false;
    saveCollapsed(next);
    setCollapsed(next);
  };

  return (
    <>
      <div className="px-5 pt-5">
        <QuickAdd onCaptured={refresh} />
      </div>
      <DndContext sensors={sensors} onDragStart={() => setDragging(true)} onDragEnd={onDragEnd}>
        <section data-testid="plan-board" className="grid grid-cols-[1.4fr_1fr] gap-5 px-5 pb-5 pt-3">
        <SourceDroppable>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-dim">Source · Someday backlog</span>
            {sourceGroups.length > 0 && (
              <button
                data-testid="collapse-all"
                onClick={anyExpanded ? collapseAll : expandAll}
                className="text-xs text-dim hover:text-ink"
              >
                {anyExpanded ? 'Collapse all' : 'Expand all'}
              </button>
            )}
          </div>
          {unstaged.length === 0 && <div className="italic text-dim" data-testid="source-empty">Someday is empty.</div>}
          {sourceGroups.map((group) => (
            <SourceGroup
              key={group.key}
              group={group}
              collapsed={collapsed[group.key] !== false}
              onToggle={toggleGroup}
              onArchiveAll={archiveAll}
              renderTask={(t) => (
                <DraggableCard key={t.id} task={t} showFile onEdit={() => setEditing(t)} onArchive={() => void archiveOne(t)} />
              )}
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
              ...member.map((t) => <DraggableCard key={`m-${t.id}`} task={t} showFile onEdit={() => setEditing(t)} onArchive={() => void archiveOne(t)} />),
              ...stagedTasks.map((t) => (
                <DraggableCard key={`s-${t.id}`} task={t} staged showFile onEdit={() => setEditing(t)} />
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
          <button data-testid="commit-button" disabled={Object.keys(buffer).length === 0} onClick={() => setConfirming(true)}
            className="rounded-lg bg-accent px-3 py-2 text-bg disabled:opacity-40">commit plan</button>
        </div>
        {editing && <EditModal task={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
        {confirming && (
          <CommitSummaryModal
            summary={summarizeBuffer(buffer)}
            onCancel={() => setConfirming(false)}
            onConfirm={async () => {
              setConfirming(false);
              const res = await onCommit();
              const msg = `✓ Committed ${res.applied.length} change${res.applied.length === 1 ? '' : 's'}`
                + (res.conflicts.length ? ` · ${res.conflicts.length} conflict(s) kept` : '');
              setToast(msg);
              setTimeout(() => setToast(null), 2600);
            }}
          />
        )}
        {toast && (
          <div data-testid="commit-toast"
            className="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-lg border border-good/40 bg-panel px-4 py-2 text-sm text-good shadow-lg">
            {toast}
          </div>
        )}
        </section>
      </DndContext>
    </>
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
