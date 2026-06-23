import { describe, it, expect } from 'vitest';
import { shutdown } from './api';

describe('shutdown', () => {
  it('earliest = now + Σ estimates; counts unestimated', () => {
    const now = new Date('2026-06-22T14:00:00');
    const r = shutdown([{ estMinutes: 30 }, { estMinutes: 45 }, { estMinutes: null }], now);
    expect(r.remainingMin).toBe(75);
    expect(r.unestimated).toBe(1);
    expect(r.earliest.getHours()).toBe(15);
    expect(r.earliest.getMinutes()).toBe(15);
  });
});
