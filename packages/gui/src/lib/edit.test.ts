import { describe, it, expect } from 'vitest';
import { parseEstimate, formatEstimate, buildPatch, type EditFields } from './edit';
import type { UiTask } from './api';

const baseTask = (over: Partial<UiTask> = {}): UiTask => ({
  id: 'f.md\n3',
  file: 'f.md',
  line: 3,
  text: 'Write the report',
  project: null,
  grain: 'someday',
  bucket: null,
  slot: null,
  estMinutes: null,
  importance: 0,
  due: null,
  notes: [],
  inProgress: false,
  done: false,
  ...over,
});

const fieldsFor = (task: UiTask, over: Partial<EditFields> = {}): EditFields => ({
  text: task.text,
  estimate: formatEstimate(task.estMinutes),
  importance: task.importance as 0 | 1 | 2 | 3,
  due: task.due ?? '',
  project: task.project ?? '',
  description: task.notes.join('\n'),
  ...over,
});

describe('parseEstimate', () => {
  it('blank → null (clear)', () => expect(parseEstimate('')).toBeNull());
  it('30m → 30', () => expect(parseEstimate('30m')).toBe(30));
  it('1h → 60', () => expect(parseEstimate('1h')).toBe(60));
  it('1h30m → 90', () => expect(parseEstimate('1h30m')).toBe(90));
  it('bare integer 90 → 90 (minutes)', () => expect(parseEstimate('90')).toBe(90));
  it('abc → invalid', () => expect(parseEstimate('abc')).toBe('invalid'));
});

describe('formatEstimate', () => {
  it('null → ""', () => expect(formatEstimate(null)).toBe(''));
  it('90 → 1h30m', () => expect(formatEstimate(90)).toBe('1h30m'));
  it('60 → 1h', () => expect(formatEstimate(60)).toBe('1h'));
  it('30 → 30m', () => expect(formatEstimate(30)).toBe('30m'));
  it('round-trips canonical inputs', () => {
    for (const m of [null, 30, 60, 90]) expect(parseEstimate(formatEstimate(m))).toBe(m);
  });
});

describe('buildPatch', () => {
  it('returns only the changed field (importance)', () => {
    const t = baseTask();
    const patch = buildPatch(t, fieldsFor(t, { importance: 2 }));
    expect(patch).toEqual({ importance: 2 });
  });

  it('no changes → empty patch', () => {
    const t = baseTask({ estMinutes: 30, importance: 1, project: 'Proj', due: '2026-06-30', notes: ['line'] });
    expect(buildPatch(t, fieldsFor(t))).toEqual({});
  });

  it('clearing due → { due: null }', () => {
    const t = baseTask({ due: '2026-06-30' });
    expect(buildPatch(t, fieldsFor(t, { due: '' }))).toEqual({ due: null });
  });

  it('setting description from empty notes → { description }', () => {
    const t = baseTask({ notes: [] });
    expect(buildPatch(t, fieldsFor(t, { description: 'a note' }))).toEqual({ description: 'a note' });
  });

  it('changing text → { text }', () => {
    const t = baseTask();
    expect(buildPatch(t, fieldsFor(t, { text: 'New title' }))).toEqual({ text: 'New title' });
  });

  it('estimate "invalid" is treated as no change', () => {
    const t = baseTask({ estMinutes: 30 });
    expect(buildPatch(t, fieldsFor(t, { estimate: 'abc' }))).toEqual({});
  });

  it('setting estimate from null → { estMinutes }', () => {
    const t = baseTask({ estMinutes: null });
    expect(buildPatch(t, fieldsFor(t, { estimate: '1h' }))).toEqual({ estMinutes: 60 });
  });

  it('setting project, trims whitespace; blank clears', () => {
    const t = baseTask({ project: 'Old' });
    expect(buildPatch(t, fieldsFor(t, { project: '  New  ' }))).toEqual({ project: 'New' });
    expect(buildPatch(t, fieldsFor(t, { project: '   ' }))).toEqual({ project: null });
  });

  it('combines multiple changed fields', () => {
    const t = baseTask();
    const patch = buildPatch(t, fieldsFor(t, { text: 'X', importance: 3, estimate: '30m' }));
    expect(patch).toEqual({ text: 'X', importance: 3, estMinutes: 30 });
  });
});
