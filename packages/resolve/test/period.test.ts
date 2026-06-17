import { describe, it, expect } from 'vitest';
import { classifyPeriod } from '../src/period.js';

// Fixed "now": Wed 2026-06-17, which is ISO week 2026-W25, month 2026-06.
const now = new Date(2026, 5, 17);

describe('classifyPeriod — day granularity (YYYY-MM-DD)', () => {
  it('same day → current', () => {
    expect(classifyPeriod('day', '2026-06-17', now)).toBe('current');
  });
  it('earlier day → past', () => {
    expect(classifyPeriod('day', '2026-06-16', now)).toBe('past');
  });
  it('later day → future', () => {
    expect(classifyPeriod('day', '2026-06-18', now)).toBe('future');
  });
  it('earlier year, later month/day → still past', () => {
    expect(classifyPeriod('day', '2025-12-31', now)).toBe('past');
  });
});

describe('classifyPeriod — month granularity (YYYY-MM)', () => {
  it('same month → current', () => {
    expect(classifyPeriod('month', '2026-06', now)).toBe('current');
  });
  it('earlier month → past', () => {
    expect(classifyPeriod('month', '2026-05', now)).toBe('past');
  });
  it('later month → future', () => {
    expect(classifyPeriod('month', '2026-07', now)).toBe('future');
  });
  it('a daily-style leaf still reads its month', () => {
    // A note misfiled under Monthly but named like a day still classifies by month.
    expect(classifyPeriod('month', '2026-04-30', now)).toBe('past');
  });
});

describe('classifyPeriod — isoweek granularity (GGGG-[W]WW)', () => {
  it('same ISO week → current', () => {
    expect(classifyPeriod('isoweek', '2026-W25', now)).toBe('current');
  });
  it('earlier ISO week → past', () => {
    expect(classifyPeriod('isoweek', '2026-W24', now)).toBe('past');
  });
  it('later ISO week → future', () => {
    expect(classifyPeriod('isoweek', '2026-W26', now)).toBe('future');
  });
  it('prior ISO year → past across the year boundary', () => {
    expect(classifyPeriod('isoweek', '2025-W52', now)).toBe('past');
  });
  it('later ISO year → future', () => {
    expect(classifyPeriod('isoweek', '2027-W01', now)).toBe('future');
  });
});

describe('classifyPeriod — unparseable', () => {
  it('returns null when no date is present in the leaf', () => {
    expect(classifyPeriod('day', 'Weekly Review', now)).toBeNull();
    expect(classifyPeriod('isoweek', 'notes', now)).toBeNull();
    expect(classifyPeriod('month', 'June', now)).toBeNull();
  });
});
