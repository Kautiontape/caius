import { describe, it, expect } from 'vitest';
import { daysLate } from './dates';

describe('daysLate', () => {
  it('counts whole days a due date is past today', () => {
    expect(daysLate('2026-06-20', '2026-06-23')).toBe(3);
  });
  it('is 0 when due today', () => {
    expect(daysLate('2026-06-23', '2026-06-23')).toBe(0);
  });
  it('is 0 for a future due date', () => {
    expect(daysLate('2026-07-01', '2026-06-23')).toBe(0);
  });
  it('is 0 when there is no due date', () => {
    expect(daysLate(null, '2026-06-23')).toBe(0);
  });
});
