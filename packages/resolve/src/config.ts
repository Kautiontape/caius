// Resolution config (§7). Baked defaults for the real vault; a JSON override
// file may be supplied later. Glob semantics live in ./glob.ts.

export interface PeriodicHorizonRule {
  match: string;
  /** date-fns-style format token; granularity is inferred (D/W/M). */
  date: string;
  by_date: { current: string; future: string; past: string };
}

export interface StaticHorizonRule {
  match: string;
  horizon: string;
}

export type HorizonRule = PeriodicHorizonRule | StaticHorizonRule;

export function isPeriodicRule(r: HorizonRule): r is PeriodicHorizonRule {
  return 'date' in r;
}

export interface ProjectRule {
  match: string;
  /** literal, or a capture token: {seg1} | {filename} | {folder}. */
  project: string;
}

export interface Config {
  indent: { tab_width: number };
  capacity: { workday_minutes: number };
  horizon_mapping: HorizonRule[];
  horizon_default: string;
  project_mapping: ProjectRule[];
  excluded: string[];
  obsidian: { vault: string; advancedUri: boolean };
}

/** The concrete §7 configuration for `/home/shawn/documents/obsidian/Main`. */
export const DEFAULT_CONFIG: Config = {
  indent: { tab_width: 4 },
  capacity: { workday_minutes: 480 },
  horizon_mapping: [
    {
      match: '02 - Periodic/Daily/**/*.md',
      date: 'YYYY-MM-DD',
      by_date: { current: 'today', future: 'week', past: 'overdue' },
    },
    {
      match: '02 - Periodic/Weekly/**/*.md',
      date: 'GGGG-[W]WW',
      by_date: { current: 'week', future: 'orbit', past: 'overdue' },
    },
    {
      match: '02 - Periodic/Monthly/**/*.md',
      date: 'YYYY-MM',
      by_date: { current: 'orbit', future: 'planning_ahead', past: 'overdue' },
    },
    { match: '10 - Project/**/*.md', horizon: 'someday' },
    { match: '20 - Area/**/*.md', horizon: 'someday' },
  ],
  horizon_default: 'someday',
  project_mapping: [
    { match: '10 - Project/*/**/*.md', project: '{seg1}' },
    { match: '10 - Project/*.md', project: '{filename}' },
  ],
  obsidian: { vault: 'Main', advancedUri: false },
  excluded: [
    '01 - Inbox/**',
    '30 - Resources/**',
    '80 - Archive/**',
    '90 - Maintenance/**',
    '91 - Testing/**',
    '95 - System/**',
    '99 - Scripts/**',
    '99 - Templates/**',
    '.obsidian/**',
    '.trash/**',
  ],
};
