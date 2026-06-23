import { useEffect, useState } from 'react';
import { shutdown } from '../lib/api';

interface Props {
  active: { estMinutes: number | null }[];
}

/** Live shutdown banner computed off the BROWSER clock: Σ estimates over the active
 * list → "≈ {h}h {m}m left → shutdown by {clock}", plus a "+N unestimated" note.
 * Re-renders once a minute so the "shutdown by" clock doesn't freeze at mount. */
export function ShutdownBar({ active }: Props) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const { remainingMin, unestimated, earliest } = shutdown(active, new Date());
  const h = Math.floor(remainingMin / 60);
  const m = remainingMin % 60;
  const clock = earliest.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <div
      data-testid="shutdown-bar"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel p-3 text-sm"
    >
      <span className="text-ink">
        ≈ <span className="text-accent">{h}h {m}m</span> left → shutdown by{' '}
        <span className="text-good">{clock}</span>
      </span>
      {unestimated > 0 && (
        <span data-testid="shutdown-unestimated" className="text-over">+{unestimated} unestimated</span>
      )}
    </div>
  );
}
