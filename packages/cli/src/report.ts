// Human-readable scan report for the `caius scan` CLI.

import type { ScanReport } from '@caius/index';
import type { State } from '@caius/core';

const STATE_ORDER: State[] = ['open', 'in_progress', 'done', 'cancelled', 'tombstone'];
const HORIZON_ORDER = ['overdue', 'today', 'week', 'orbit', 'planning_ahead', 'someday'];

function orderedHorizons(byHorizon: Record<string, number>): string[] {
  const known = HORIZON_ORDER.filter((h) => h in byHorizon);
  const extra = Object.keys(byHorizon)
    .filter((h) => !HORIZON_ORDER.includes(h))
    .sort();
  return [...known, ...extra];
}

export function formatReport(report: ScanReport, vault: string): string {
  const lines: string[] = [];
  lines.push(`Caius scan — ${vault}`);
  lines.push(`  ${report.fileCount} files · ${report.taskCount} tasks (${report.liveCount} live)`);

  const states = STATE_ORDER.map((s) => `${s} ${report.byState[s]}`).join(', ');
  lines.push(`  States:   ${states}`);

  const funnel = orderedHorizons(report.funnel)
    .map((h) => `${h} ${report.funnel[h]}`)
    .join(', ');
  lines.push(`  Funnel:   ${funnel || '(none)'}   [live tasks]`);

  lines.push(`  Projects: ${report.withProject} with project, ${report.orphans} orphan`);

  if (report.flagCount === 0) {
    lines.push(`  Flags:    No integrity flags ✓`);
  } else {
    const flags = Object.entries(report.byFlag)
      .sort()
      .map(([k, n]) => `${k} ${n}`)
      .join(', ');
    lines.push(`  Flags:    ${report.flagCount} (${flags})`);
  }

  return lines.join('\n');
}
