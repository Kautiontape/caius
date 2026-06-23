const EST_CHIPS = [15, 30, 45, 60, 120];
const estLabel = (m: number) => (m % 60 === 0 ? `${m / 60}h` : `${m}m`);

interface Props {
  count: number;
  onPromote: () => void;
  onEstimate: (min: number) => void;
  onArchive: () => void;
  onClear: () => void;
}

/** Floating bulk-action bar shown while tasks are multi-selected. */
export function SelectionBar({ count, onPromote, onEstimate, onArchive, onClear }: Props) {
  if (count === 0) return null;
  return (
    <div data-testid="selection-bar"
      className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-accent/40 bg-panel px-4 py-2 text-sm shadow-xl">
      <span className="font-medium text-ink">{count} selected</span>
      <button data-testid="bulk-promote" onClick={onPromote} className="rounded-lg bg-accent px-3 py-1 text-bg">→ Promote</button>
      <span className="flex items-center gap-1 text-xs text-dim">est:
        {EST_CHIPS.map((m) => (
          <button key={m} data-testid={`bulk-est-${m}`} onClick={() => onEstimate(m)} className="rounded border border-line px-1.5 py-0.5 text-ink hover:border-accent">{estLabel(m)}</button>
        ))}
      </span>
      <button data-testid="bulk-archive" onClick={onArchive} className="rounded-lg border border-line px-3 py-1 text-dim hover:text-over">Archive</button>
      <button data-testid="bulk-clear" onClick={onClear} className="text-dim hover:text-ink">✕</button>
    </div>
  );
}
