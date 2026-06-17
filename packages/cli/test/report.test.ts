import { describe, it, expect } from 'vitest';
import type { ScanReport } from '@caius/index';
import { formatReport } from '../src/report.js';

const report: ScanReport = {
  fileCount: 42,
  taskCount: 100,
  liveCount: 54,
  byState: { open: 50, in_progress: 4, done: 40, cancelled: 5, tombstone: 1 },
  byHorizon: { overdue: 3, today: 7, someday: 90 },
  funnel: { overdue: 2, today: 6, someday: 46 },
  withProject: 60,
  orphans: 40,
  flagCount: 2,
  byFlag: { invariant_violation: 2 },
};

describe('formatReport', () => {
  it('summarizes files, tasks, and live count', () => {
    const out = formatReport(report, '.testvault');
    expect(out).toContain('.testvault');
    expect(out).toContain('42 files');
    expect(out).toContain('100 tasks');
    expect(out).toContain('54 live');
  });
  it('shows state breakdown', () => {
    const out = formatReport(report, '.testvault');
    expect(out).toContain('open 50');
    expect(out).toContain('in_progress 4');
  });
  it('shows the funnel (live tasks) in funnel order', () => {
    const out = formatReport(report, '.testvault');
    expect(out.indexOf('overdue')).toBeLessThan(out.indexOf('today'));
    expect(out.indexOf('today')).toBeLessThan(out.indexOf('someday'));
    // funnel counts are live-only (today: 6 live, not 7 total)
    expect(out).toContain('today 6');
  });
  it('reports project coverage and flags', () => {
    const out = formatReport(report, '.testvault');
    expect(out).toContain('60');
    expect(out).toContain('orphan');
    expect(out).toContain('invariant_violation 2');
  });
  it('says no integrity flags when clean', () => {
    const clean = { ...report, flagCount: 0, byFlag: {} };
    expect(formatReport(clean, '.testvault')).toContain('No integrity flags');
  });
});
