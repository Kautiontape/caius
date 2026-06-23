import type { SourceFilters, SortKey } from '../lib/sourceFilter';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'priority', label: 'Priority' }, { key: 'due', label: 'Due date' },
  { key: 'estimate', label: 'Estimate' }, { key: 'project', label: 'Project' }, { key: 'title', label: 'A–Z' },
];

interface Props {
  filters: SourceFilters;
  onFilters: (f: SourceFilters) => void;
  sort: SortKey;
  onSort: (k: SortKey) => void;
  projects: string[];
  selectMode: boolean;
  onToggleSelectMode: () => void;
}

export function SourceToolbar({ filters, onFilters, sort, onSort, projects, selectMode, onToggleSelectMode }: Props) {
  const set = (patch: Partial<SourceFilters>) => onFilters({ ...filters, ...patch });
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
      <input data-testid="source-search" value={filters.query} onChange={(e) => set({ query: e.target.value })}
        placeholder="🔍 filter…" className="min-w-32 flex-1 rounded border border-line bg-panel2 px-2 py-1 text-ink placeholder:text-dim" />
      <select data-testid="source-sort" value={sort} onChange={(e) => onSort(e.target.value as SortKey)}
        className="rounded border border-line bg-panel2 px-2 py-1 text-ink">
        {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      <select data-testid="source-project" value={filters.project ?? ''} onChange={(e) => set({ project: e.target.value || null })}
        className="max-w-32 rounded border border-line bg-panel2 px-2 py-1 text-ink">
        <option value="">All projects</option>
        {projects.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <ToggleChip label={filters.estimate === 'none' ? 'no est' : filters.estimate === 'has' ? 'has est' : 'est?'} active={filters.estimate !== 'all'}
        onClick={() => set({ estimate: filters.estimate === 'all' ? 'none' : filters.estimate === 'none' ? 'has' : 'all' })} title="cycle estimate filter" />
      <ToggleChip label={filters.minImportance > 0 ? '!'.repeat(filters.minImportance) : '!?'} active={filters.minImportance > 0}
        onClick={() => set({ minImportance: ((filters.minImportance + 1) % 4) as 0 | 1 | 2 | 3 })} title="cycle min importance" />
      <ToggleChip label={filters.due === 'all' ? 'due?' : filters.due} active={filters.due !== 'all'}
        onClick={() => set({ due: filters.due === 'all' ? 'dated' : filters.due === 'dated' ? 'overdue' : 'all' })} title="cycle due filter" />
      <button data-testid="select-mode" onClick={onToggleSelectMode}
        className={`rounded border px-2 py-1 ${selectMode ? 'border-accent text-accent' : 'border-line text-dim hover:text-ink'}`}>☑ select</button>
    </div>
  );
}

function ToggleChip({ label, active, onClick, title }: { label: string; active: boolean; onClick: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title}
      className={`rounded border px-2 py-1 ${active ? 'border-accent text-accent' : 'border-line text-dim hover:text-ink'}`}>{label}</button>
  );
}
