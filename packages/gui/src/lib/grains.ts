// The single source of truth for grain ↔ Marvin-label ↔ period mapping and the
// ritual table. The four grain strings MUST match @caius/resolve GRAINS
// (asserted by grains.test.ts).

export type Grain = 'someday' | 'month' | 'week' | 'day';
export type Posture = 'plan' | 'review';
export type Altitude = 'month' | 'week' | 'day';

export const GRAIN_LABEL: Record<Grain, string> = {
  someday: 'Someday',
  month: 'Planning Ahead',
  week: 'Orbit',
  day: 'Today',
};

export const PIPELINE: Grain[] = ['someday', 'month', 'week', 'day'];

export const NEXT_GRAIN: Record<Grain, Grain | null> = {
  someday: 'month', month: 'week', week: 'day', day: null,
};
export const PREV_GRAIN: Record<Grain, Grain | null> = {
  someday: null, month: 'someday', week: 'month', day: 'week',
};

/** "this / next" period labels per altitude (both directions use these). */
export const PERIOD_LABEL: Record<Altitude, { this: string; next: string }> = {
  month: { this: 'this month', next: 'next month' },
  week: { this: 'this week', next: 'next week' },
  day: { this: 'today', next: 'tomorrow' },
};

export interface Ritual {
  key: string;
  altitude: Altitude;
  posture: Posture;
  title: string;
  from?: Grain;
  to?: Grain;
  grain?: Grain;
  blurb: string;
}

export const RITUALS: Record<Altitude, Record<Posture, Ritual>> = {
  month: {
    plan: { key: 'month-plan', altitude: 'month', posture: 'plan', title: 'Monthly planning', from: 'someday', to: 'month', blurb: 'what is worth committing to a month' },
    review: { key: 'month-review', altitude: 'month', posture: 'review', title: 'Monthly review', grain: 'month', blurb: 'what slipped — defer or drop' },
  },
  week: {
    plan: { key: 'week-plan', altitude: 'week', posture: 'plan', title: 'Weekly planning', from: 'month', to: 'week', blurb: 'what is actually happening this week' },
    review: { key: 'week-review', altitude: 'week', posture: 'review', title: 'Weekly review', grain: 'week', blurb: 'what slipped — defer or drop' },
  },
  day: {
    plan: { key: 'day-plan', altitude: 'day', posture: 'plan', title: 'Daily planning', from: 'week', to: 'day', blurb: 'do now, or push to tomorrow' },
    review: { key: 'day-review', altitude: 'day', posture: 'review', title: 'Daily shutdown', grain: 'day', blurb: 'close out the day, defer the rest' },
  },
};
