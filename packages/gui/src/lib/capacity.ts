import type { Altitude } from './grains';

/** Per-tier minute budget, scaled from the day capacity: week = 5 working days,
 * month = 20 working days. Configurable later. */
export function tierBudgetMinutes(grain: Altitude, dayCapacityMin: number): number {
  const factor = grain === 'day' ? 1 : grain === 'week' ? 5 : 20;
  return dayCapacityMin * factor;
}

export interface CapacityMeter {
  knownMin: number;
  noEstCount: number;
  budgetMin: number;
  solidPct: number;
  hatchedPct: number;
  over: boolean;
}

/** Honest hybrid meter: solid = known estimated time vs budget; hatched = a
 * nominal weight per unestimated task, so a tier full of no-est tasks still reads
 * as loaded. solid + hatched never exceed 100%. */
export function capacityMeter(
  tasks: { estMinutes: number | null }[],
  budgetMin: number,
  nominalMin = 30,
): CapacityMeter {
  const knownMin = tasks.reduce((s, t) => s + (t.estMinutes ?? 0), 0);
  const noEstCount = tasks.filter((t) => t.estMinutes == null).length;
  const budget = budgetMin > 0 ? budgetMin : 1;
  const solidPct = Math.min(100, (knownMin / budget) * 100);
  const hatchedPct = Math.min(100 - solidPct, ((noEstCount * nominalMin) / budget) * 100);
  return { knownMin, noEstCount, budgetMin, solidPct, hatchedPct, over: knownMin > budgetMin };
}
