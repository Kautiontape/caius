import { describe, it, expect } from 'vitest';
import { tierBudgetMinutes, capacityMeter } from './capacity';

describe('tierBudgetMinutes', () => {
  it('scales the day capacity to week (×5) and month (×20)', () => {
    expect(tierBudgetMinutes('day', 480)).toBe(480);
    expect(tierBudgetMinutes('week', 480)).toBe(2400);
    expect(tierBudgetMinutes('month', 480)).toBe(9600);
  });
});

describe('capacityMeter', () => {
  it('is empty for no tasks', () => {
    expect(capacityMeter([], 480)).toEqual({
      knownMin: 0, noEstCount: 0, budgetMin: 480, solidPct: 0, hatchedPct: 0, over: false,
    });
  });

  it('splits known time (solid) from unestimated weight (hatched)', () => {
    const tasks = [{ estMinutes: 120 }, { estMinutes: 60 }, { estMinutes: null }, { estMinutes: null }];
    const m = capacityMeter(tasks, 480, 30);
    expect(m.knownMin).toBe(180);
    expect(m.noEstCount).toBe(2);
    expect(m.solidPct).toBeCloseTo(37.5);
    expect(m.hatchedPct).toBeCloseTo(12.5);
    expect(m.over).toBe(false);
  });

  it('caps solid at 100% and flags over-budget', () => {
    const m = capacityMeter([{ estMinutes: 600 }], 480);
    expect(m.solidPct).toBe(100);
    expect(m.hatchedPct).toBe(0);
    expect(m.over).toBe(true);
  });
});
