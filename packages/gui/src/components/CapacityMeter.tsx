import type { CapacityMeter as Meter } from '../lib/capacity';

const h = (min: number) => (min % 60 === 0 ? `${min / 60}h` : `${Math.floor(min / 60)}h${min % 60}m`);

/** Honest capacity bar: solid = estimated time, hatched = "unknown" weight for
 * unestimated tasks. The label leads with the no-est count — that's the signal. */
export function CapacityMeter({ meter }: { meter: Meter }) {
  return (
    <div data-testid="capacity-meter" className="flex items-center gap-2 text-[11px]">
      <span className={meter.over ? 'text-over' : 'text-good'}>
        {h(meter.knownMin)} known{meter.noEstCount > 0 && <span className="text-warn"> · {meter.noEstCount} no-est</span>} / {h(meter.budgetMin)}
      </span>
      <span className="relative h-1.5 w-24 overflow-hidden rounded-full bg-panel2">
        <span className={`absolute inset-y-0 left-0 ${meter.over ? 'bg-over' : 'bg-good'}`} style={{ width: `${meter.solidPct}%` }} />
        <span className="absolute inset-y-0" style={{ left: `${meter.solidPct}%`, width: `${meter.hatchedPct}%`, backgroundImage: 'repeating-linear-gradient(45deg, var(--warn) 0 3px, transparent 3px 6px)', opacity: 0.7 }} />
      </span>
    </div>
  );
}
