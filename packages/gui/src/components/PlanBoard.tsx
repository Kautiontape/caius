import { useEffect, useState } from 'react';
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, useDraggable,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { type Altitude, type Grain, destTiersForGrain } from '../lib/grains';
import { fetchTasksAtGrain, fetchOverdue, postTask, type UiTask } from '../lib/api';
import { daysLate } from '../lib/dates';
import { tierBudgetMinutes, capacityMeter } from '../lib/capacity';
import { groupSource, type SourceGroup as Group } from '../lib/grouping';
import { filterTasks, sortTasks, EMPTY_FILTERS, type SourceFilters, type SortKey } from '../lib/sourceFilter';
import type { PendingChange, StagingBuffer, CommitResult } from '../lib/staging';
import { summarizeBuffer, type CommitSummary } from '../lib/commitSummary';
import { SourceColumn } from './SourceColumn';
import { DestinationColumn } from './DestinationColumn';
import { SourceToolbar } from './SourceToolbar';
import { SelectionBar } from './SelectionBar';
import { TaskCard } from './TaskCard';
import { EditModal } from './EditModal';
import { QuickAdd } from './QuickAdd';
import { CommitSummaryModal } from './CommitSummaryModal';

interface Props {
  altitude: Altitude;
  sourceTier: Grain;
  aimed: 'month' | 'week' | 'day';
  onAim: (t: 'month' | 'week' | 'day') => void;
  capacityMinutes: number;
  buffer: StagingBuffer;
  onStage: (c: PendingChange) => void;
  onUnstage: (taskId: string) => void;
  onCommit: () => Promise<CommitResult>;
  conflicts: CommitResult['conflicts'];
  overdueActive: boolean;
}

type CardProps = {
  task: UiTask; showFile?: boolean; staged?: boolean;
  onEdit?: () => void; onArchive?: () => void; onPromote?: () => void;
  onQuickEstimate?: (m: number) => void; selectable?: boolean; selected?: boolean; onToggleSelect?: () => void;
  daysLate?: number; onReschedule?: (date: string) => void;
};
function DraggableCard(p: CardProps) {
  const { setNodeRef, listeners, attributes, transform, isDragging } = useDraggable({ id: p.task.id });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : undefined };
  const handle = <button {...listeners} {...attributes} aria-label="drag" className="cursor-grab touch-none select-none text-dim hover:text-ink">⠿</button>;
  return <div ref={setNodeRef} style={style}><TaskCard {...p} dragHandle={handle} /></div>;
}

const COLLAPSED_KEY = 'caius-collapsed';
const loadCollapsed = (): Record<string, boolean> => { try { const r = localStorage.getItem(COLLAPSED_KEY); if (r) return JSON.parse(r) as Record<string, boolean>; } catch { /* ignore */ } return {}; };
const saveCollapsed = (m: Record<string, boolean>) => { try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(m)); } catch { /* ignore */ } };

export function PlanBoard({ altitude, sourceTier, aimed, onAim, capacityMinutes, buffer, onStage, onUnstage, onCommit, conflicts, overdueActive }: Props) {
  const [source, setSource] = useState<UiTask[]>([]);
  const [members, setMembers] = useState<UiTask[]>([]);
  const [dragging, setDragging] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);
  const [editing, setEditing] = useState<UiTask | null>(null);
  const [confirmSummary, setConfirmSummary] = useState<CommitSummary | null>(null);
  const [committing, setCommitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [filters, setFilters] = useState<SourceFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>('priority');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const refresh = () => {
    void (overdueActive ? fetchOverdue() : fetchTasksAtGrain(sourceTier)).then(setSource);
    void fetchTasksAtGrain(aimed, 'this').then(setMembers);
  };
  useEffect(refresh, [sourceTier, aimed, overdueActive]);
  useEffect(() => { setSelected(new Set()); }, [sourceTier, overdueActive]);

  const archive = (t: UiTask) => postTask({ file: t.file, line: t.line, expectedText: t.text, patch: { state: 'cancelled' } });
  const archiveOne = async (t: UiTask) => { await archive(t); refresh(); };
  const archiveAll = async (group: Group) => {
    if (!window.confirm(`Archive all ${group.tasks.length} task(s) in "${group.title}" as won't-do?`)) return;
    for (const t of group.tasks) await archive(t);
    refresh();
  };

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));
  const toggleGroup = (key: string) => setCollapsed((prev) => { const next = { ...prev, [key]: !(prev[key] !== false) }; saveCollapsed(next); return next; });

  const byId = new Map<string, UiTask>();
  for (const t of source) byId.set(t.id, t);
  for (const t of members) byId.set(t.id, t);
  for (const c of Object.values(buffer)) {
    if (!byId.has(c.taskId)) {
      byId.set(c.taskId, { id: c.taskId, file: c.snapshot.file, line: c.snapshot.line, text: c.snapshot.text, project: null, grain: c.fromGrain, bucket: null, slot: null, estMinutes: null, importance: 0, due: null, notes: [], inProgress: false, done: false });
    }
  }

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(false);
    const taskId = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    if (!over) return;
    if (over === 'source') { onUnstage(taskId); return; }
    let tier: 'month' | 'week' | 'day' | null = null;
    if (over.startsWith('bucket:')) tier = over.replace('bucket:', '') as 'month' | 'week' | 'day';
    else if (over.startsWith('tab:')) tier = over.replace('tab:', '') as 'month' | 'week' | 'day';
    if (!tier) return;
    const task = byId.get(taskId);
    const snapshot = task ? { file: task.file, line: task.line, text: task.text } : buffer[taskId]?.snapshot;
    if (!snapshot) return;
    onStage({ taskId, fromGrain: task?.grain ?? sourceTier, toGrain: tier, toBucket: 'this', slot: tier === 'day' ? 'today' : undefined, kind: 'promote', snapshot });
  };

  const promoteOne = (t: UiTask) => onStage({ taskId: t.id, fromGrain: t.grain ?? sourceTier, toGrain: aimed, toBucket: 'this', slot: aimed === 'day' ? 'today' : undefined, kind: 'promote', snapshot: { file: t.file, line: t.line, text: t.text } });
  const estimateOne = async (t: UiTask, min: number) => { await postTask({ file: t.file, line: t.line, expectedText: t.text, patch: { estMinutes: min } }); refresh(); };
  const rescheduleOne = async (t: UiTask, date: string) => { await postTask({ file: t.file, line: t.line, expectedText: t.text, patch: { due: date } }); refresh(); };

  const unstaged = source.filter((t) => !buffer[t.id]);
  const stagedTasks = Object.values(buffer).filter((c) => c.toGrain === aimed).map((c) => byId.get(c.taskId)).filter((t): t is UiTask => !!t);
  const meter = capacityMeter([...members, ...stagedTasks], tierBudgetMinutes(aimed, capacityMinutes));

  const today = new Date().toISOString().slice(0, 10);
  const filtered = filterTasks(unstaged, filters, today);
  const sortedGroups = groupSource(filtered).map((g) => ({ ...g, tasks: sortTasks(g.tasks, sort) }));
  const projects = [...new Set(unstaged.map((t) => t.project).filter((p): p is string => !!p))].sort();

  const toggleSel = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearSel = () => setSelected(new Set());
  const selectedTasks = () => source.filter((t) => selected.has(t.id));
  const bulkPromote = () => { for (const t of selectedTasks()) promoteOne(t); clearSel(); };
  const bulkEstimate = async (min: number) => { for (const t of selectedTasks()) await postTask({ file: t.file, line: t.line, expectedText: t.text, patch: { estMinutes: min } }); clearSel(); refresh(); };
  const bulkArchive = async () => { if (!window.confirm(`Archive ${selected.size} selected task(s) as won't-do?`)) return; for (const t of selectedTasks()) await archive(t); clearSel(); refresh(); };

  const anyExpanded = Object.values(collapsed).some((v) => v === false);
  const setAll = (val: boolean) => { const next: Record<string, boolean> = {}; for (const t of unstaged) next[t.project ? `project:${t.project}` : `doc:${t.file}`] = val; saveCollapsed(next); setCollapsed(next); };

  const cards = [
    ...members.map((t) => <DraggableCard key={`m-${t.id}`} task={t} showFile onEdit={() => setEditing(t)} onArchive={() => void archiveOne(t)} />),
    ...stagedTasks.map((t) => <DraggableCard key={`s-${t.id}`} task={t} staged showFile onEdit={() => setEditing(t)} />),
  ];

  return (
    <>
      <div className="px-5 pt-5"><QuickAdd onCaptured={refresh} /></div>
      <DndContext sensors={sensors} onDragStart={() => setDragging(true)} onDragEnd={onDragEnd}>
        <section data-testid="plan-board" className="grid grid-cols-[1.4fr_1fr] gap-5 px-5 pb-5 pt-3">
          <SourceColumn
            sourceTier={sourceTier}
            label={overdueActive ? '⚠ Overdue' : undefined}
            groups={sortedGroups}
            toolbar={<SourceToolbar filters={filters} onFilters={setFilters} sort={sort} onSort={setSort} projects={projects} selectMode={selectMode} onToggleSelectMode={() => { setSelectMode((m) => !m); clearSel(); }} />}
            collapsed={collapsed}
            anyExpanded={anyExpanded}
            onToggle={toggleGroup}
            onCollapseAll={() => setAll(true)}
            onExpandAll={() => setAll(false)}
            onArchiveAll={archiveAll}
            renderTask={(t) => (
              <DraggableCard key={`${t.id}:${t.due ?? ''}`} task={t} showFile
                onEdit={() => setEditing(t)} onArchive={() => void archiveOne(t)}
                onPromote={() => promoteOne(t)} onQuickEstimate={(m) => void estimateOne(t, m)}
                selectable={selectMode} selected={selected.has(t.id)} onToggleSelect={() => toggleSel(t.id)}
                daysLate={daysLate(t.due, today)} onReschedule={(d) => void rescheduleOne(t, d)} />
            )}
          />
          <div className="flex flex-col gap-3">
            <DestinationColumn aimed={aimed} tabs={destTiersForGrain(altitude)} isDefault={aimed === altitude} onAim={onAim} meter={meter} count={members.length + stagedTasks.length} dragging={dragging}>
              {cards.length ? cards : <div className="text-xs italic text-dim">empty</div>}
            </DestinationColumn>
            {conflicts.length > 0 && (
              <div className="rounded border border-over/40 p-2 text-xs text-over" data-testid="board-conflicts">{conflicts.length} conflict(s) kept staged.</div>
            )}
            <button data-testid="commit-button" disabled={Object.keys(buffer).length === 0 || committing}
              onClick={() => setConfirmSummary(summarizeBuffer(buffer))}
              className="rounded-lg bg-accent px-3 py-2 text-bg disabled:opacity-40">commit plan</button>
          </div>
          {editing && <EditModal task={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
          {selectMode && <SelectionBar count={selected.size} onPromote={bulkPromote} onEstimate={(m) => void bulkEstimate(m)} onArchive={() => void bulkArchive()} onClear={clearSel} />}
          {confirmSummary && (
            <CommitSummaryModal
              summary={confirmSummary}
              onCancel={() => setConfirmSummary(null)}
              onConfirm={async () => {
                setConfirmSummary(null); setCommitting(true);
                try {
                  const res = await onCommit();
                  setToast({ msg: `✓ Committed ${res.applied.length} change${res.applied.length === 1 ? '' : 's'}` + (res.conflicts.length ? ` · ${res.conflicts.length} conflict(s) kept` : ''), ok: true });
                } catch { setToast({ msg: '⚠ Commit failed — check the server and try again.', ok: false }); }
                finally { setCommitting(false); setTimeout(() => setToast(null), 3000); }
              }}
            />
          )}
          {toast && (
            <div data-testid="commit-toast" className={`fixed bottom-5 left-1/2 -translate-x-1/2 rounded-lg border bg-panel px-4 py-2 text-sm shadow-lg ${toast.ok ? 'border-good/40 text-good' : 'border-over/40 text-over'}`}>{toast.msg}</div>
          )}
        </section>
      </DndContext>
    </>
  );
}
