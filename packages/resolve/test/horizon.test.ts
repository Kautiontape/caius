import { describe, it, expect } from 'vitest';
import { resolveHorizon } from '../src/horizon.js';
import { DEFAULT_CONFIG } from '../src/config.js';

const now = new Date(2026, 5, 17); // Wed 2026-06-17, ISO 2026-W25, month 2026-06
const h = (file: string) => resolveHorizon(file, now, DEFAULT_CONFIG);

describe('resolveHorizon — Daily periodic', () => {
  it('current day → today', () => {
    expect(h('02 - Periodic/Daily/2026/06/2026-06-17.md').value).toBe('today');
  });
  it('past day → overdue', () => {
    expect(h('02 - Periodic/Daily/2026/06/2026-06-10.md').value).toBe('overdue');
  });
  it('future day → week', () => {
    expect(h('02 - Periodic/Daily/2026/06/2026-06-20.md').value).toBe('week');
  });
});

describe('resolveHorizon — Weekly periodic', () => {
  it('current week → week', () => {
    expect(h('02 - Periodic/Weekly/2026/2026-W25.md').value).toBe('week');
  });
  it('future week → orbit', () => {
    expect(h('02 - Periodic/Weekly/2026/2026-W30.md').value).toBe('orbit');
  });
  it('past week → overdue', () => {
    expect(h('02 - Periodic/Weekly/2026/2026-W10.md').value).toBe('overdue');
  });
});

describe('resolveHorizon — Monthly periodic', () => {
  it('current month → orbit', () => {
    expect(h('02 - Periodic/Monthly/2026/2026-06.md').value).toBe('orbit');
  });
  it('future month → planning_ahead', () => {
    expect(h('02 - Periodic/Monthly/2026/2026-09.md').value).toBe('planning_ahead');
  });
  it('past month → overdue', () => {
    expect(h('02 - Periodic/Monthly/2026/2026-01.md').value).toBe('overdue');
  });
});

describe('resolveHorizon — static + default', () => {
  it('project note → someday', () => {
    expect(h('10 - Project/Caius/notes.md').value).toBe('someday');
  });
  it('area note → someday', () => {
    expect(h('20 - Area/Health.md').value).toBe('someday');
  });
  it('unmapped location → default someday', () => {
    expect(h('02 - Periodic/Yearly/2026.md').value).toBe('someday');
  });
  it('periodic glob match but unparseable leaf falls through to default', () => {
    expect(h('02 - Periodic/Daily/scratchpad.md').value).toBe('someday');
  });
});

describe('resolveHorizon — provenance', () => {
  it('records a rule and source for explainability', () => {
    const d = h('02 - Periodic/Monthly/2026/2026-06.md');
    expect(d.value).toBe('orbit');
    expect(d.rule).toBeTruthy();
    expect(d.source).toContain('2026-06');
  });
});
