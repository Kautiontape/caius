import { useEffect } from 'react';
import type { CommitSummary } from '../lib/commitSummary';

/** Pre-commit confirmation: shows exactly what will be committed and to which
 * tiers before the write. (Planning commit is log-only in Phase 1; this is the
 * confirmation UX and becomes the write preview when write-back lands.) */
export function CommitSummaryModal({
  summary, onConfirm, onCancel,
}: { summary: CommitSummary; onConfirm: () => void | Promise<void>; onCancel: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" data-testid="commit-summary" onClick={onCancel}>
      <div className="w-[min(440px,92vw)] rounded-xl border border-line bg-panel p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-sm font-semibold text-ink">
          Commit {summary.total} change{summary.total === 1 ? '' : 's'}?
        </h2>
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {summary.byTier.map((b) => (
            <span key={b.tier} className="rounded border border-line bg-panel2 px-2 py-1 text-dim">
              {b.count} → <span className="text-ink">{b.tier}</span>
            </span>
          ))}
        </div>
        <ul className="mb-4 max-h-52 overflow-auto text-xs text-dim">
          {summary.rows.map((r, i) => (
            <li key={i} className="flex justify-between gap-3 py-0.5">
              <span className="truncate text-ink">{r.title || '(untitled)'}</span>
              <span className="shrink-0">{r.kind} → {r.toTier}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <button data-testid="commit-cancel" onClick={onCancel}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-dim hover:text-ink">Cancel</button>
          <button data-testid="commit-confirm" onClick={onConfirm}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm text-bg">Commit →</button>
        </div>
      </div>
    </div>
  );
}
