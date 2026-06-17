// Horizon axis (§5, D8). Date-relative: periodic notes classify by the date in
// their filename vs *now*; static rules map a folder straight to a level.
// First matching rule wins.

import { matchGlob } from './glob.js';
import { type Config, isPeriodicRule } from './config.js';
import { classifyPeriod, granularityForFormat, type PeriodRelation } from './period.js';
import { type Derived } from './types.js';

const RELATION_WORD: Record<PeriodRelation, string> = {
  current: 'current',
  future: 'future',
  past: 'past',
};

/** Friendly rule label, e.g. "02 - Periodic/Daily/**" → "Daily". */
function periodicLabel(match: string): string {
  const m = match.match(/Periodic\/([^/]+)/);
  return m ? m[1]! : match;
}

function leafOf(file: string): string {
  const base = file.slice(file.lastIndexOf('/') + 1);
  return base.replace(/\.md$/i, '');
}

/** Resolve the horizon for a file at a given moment. Always returns a value. */
export function resolveHorizon(file: string, now: Date, config: Config): Derived {
  for (const rule of config.horizon_mapping) {
    if (!matchGlob(rule.match, file)) continue;

    if (isPeriodicRule(rule)) {
      const granularity = granularityForFormat(rule.date);
      if (!granularity) continue;
      const leaf = leafOf(file);
      const relation = classifyPeriod(granularity, leaf, now);
      if (!relation) continue; // glob matched but no parseable period → fall through
      const label = periodicLabel(rule.match);
      const unit = granularity === 'isoweek' ? 'week' : granularity;
      return {
        value: rule.by_date[relation],
        rule: `${label} periodic rule (${RELATION_WORD[relation]} → ${rule.by_date[relation]})`,
        source: `${RELATION_WORD[relation]} ${unit} ${leaf} vs now`,
      };
    }

    return {
      value: rule.horizon,
      rule: `static rule ${rule.match}`,
      source: `path matches ${rule.match}`,
    };
  }

  return {
    value: config.horizon_default,
    rule: 'default',
    source: 'no horizon rule matched',
  };
}
