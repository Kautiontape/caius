import { describe, it, expect } from 'vitest';
import { GRAINS } from '@caius/resolve';
import { PIPELINE, GRAIN_LABEL, NEXT_GRAIN, PREV_GRAIN, RITUALS } from './grains';

describe('grains — engine parity', () => {
  it('PIPELINE order equals the engine GRAINS', () => {
    expect(PIPELINE).toEqual([...GRAINS]);
  });
  it('every grain has a Marvin label', () => {
    for (const g of PIPELINE) expect(GRAIN_LABEL[g]).toBeTruthy();
  });
});

describe('grains — ladder', () => {
  it('NEXT and PREV are inverse along the pipeline', () => {
    expect(NEXT_GRAIN.someday).toBe('month');
    expect(NEXT_GRAIN.day).toBeNull();
    expect(PREV_GRAIN.day).toBe('week');
    expect(PREV_GRAIN.someday).toBeNull();
  });
});

describe('grains — rituals', () => {
  it('exposes plan + review at all three altitudes', () => {
    for (const alt of ['month', 'week', 'day'] as const) {
      expect(RITUALS[alt].plan.posture).toBe('plan');
      expect(RITUALS[alt].review.posture).toBe('review');
    }
    expect(RITUALS.day.review.title).toBe('Daily shutdown');
    expect(RITUALS.day.plan.from).toBe('week');
    expect(RITUALS.day.plan.to).toBe('day');
  });
});
