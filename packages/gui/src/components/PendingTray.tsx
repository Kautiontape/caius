import { GRAIN_LABEL } from '../lib/grains';
import type { PendingChange } from '../lib/staging';

interface Props {
  changes: PendingChange[];
  commitLabel: string;                 // e.g. "commit daily planning"
  conflicts?: { taskId: string; reason: string }[];
  onUnstage: (taskId: string) => void;
  onCommit: () => void;
}

export function PendingTray({ changes, commitLabel, conflicts = [], onUnstage, onCommit }: Props) {
  return (
    <aside className="rounded-lg border border-line bg-panel p-3 shadow-sm" data-testid="pending-tray">
      <div className="mb-2 text-xs uppercase tracking-wide text-dim">Staging buffer</div>
      {changes.length === 0 ? (
        <div className="text-sm italic text-dim" data-testid="tray-empty">staging buffer empty</div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {changes.map((c) => (
            <li key={c.taskId} data-testid="tray-row" className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate">
                <span className="text-dim">{c.snapshot.text}</span>{' '}
                <span className={c.kind === 'drop' ? 'text-over' : 'text-ink'}>
                  {c.kind === 'drop'
                    ? 'drop'
                    : `${GRAIN_LABEL[c.fromGrain]} → ${GRAIN_LABEL[c.toGrain]}${c.toBucket ? ` (${c.toBucket})` : ''}`}
                </span>{' '}
                {c.kind === 'skip' && <span className="text-warn text-xs">(skip)</span>}
              </span>
              <button data-testid="tray-undo" onClick={() => onUnstage(c.taskId)} className="text-dim hover:text-over">×</button>
            </li>
          ))}
        </ul>
      )}

      {conflicts.length > 0 && (
        <div className="mt-2 rounded border border-over/40 p-2 text-xs text-over" data-testid="tray-conflicts">
          {conflicts.length} conflict(s) kept staged:
          <ul className="mt-1 list-disc pl-4">
            {conflicts.map((c) => <li key={c.taskId}>{c.reason}</li>)}
          </ul>
        </div>
      )}

      <button
        data-testid="commit-button"
        disabled={changes.length === 0}
        onClick={onCommit}
        className="mt-3 w-full rounded-lg bg-accent px-3 py-2 text-bg disabled:opacity-40"
      >
        {commitLabel}
      </button>
    </aside>
  );
}
