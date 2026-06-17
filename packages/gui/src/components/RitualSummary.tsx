import type { Altitude } from '../lib/grains';

interface Props {
  altitude: Altitude;
  doneCount: number;
  openCount: number;
  stagedCount: number;
  completedMinutes?: number;
  capacityMinutes?: number;
}

/** Reserved slot — counts only in Phase 1; narrative summary is deferred (spec §9). */
export function RitualSummary({ altitude, doneCount, openCount, stagedCount, completedMinutes, capacityMinutes }: Props) {
  return (
    <div className="rounded-lg border border-line bg-panel p-3 text-sm" data-testid="ritual-summary">
      <span className="text-ink">{doneCount} done</span>
      <span className="text-dim"> · </span>
      <span className="text-ink">{openCount} open</span>
      <span className="text-dim"> · </span>
      <span className="text-ink">{stagedCount} staged</span>
      {altitude === 'day' && completedMinutes != null && capacityMinutes != null && (
        <>
          <span className="text-dim"> · </span>
          <span className="text-ink">{completedMinutes}m / {capacityMinutes}m completed</span>
        </>
      )}
    </div>
  );
}
