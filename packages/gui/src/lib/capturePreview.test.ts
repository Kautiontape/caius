import { describe, it, expect } from 'vitest';
import { previewCapture } from './capturePreview';

describe('previewCapture', () => {
  it('parses the four trailing tokens and the title', () => {
    const p = previewCapture('Draft Q3 OKRs ~1h30m !! *2026-07-01 :[[Planning]]');
    expect(p.title).toBe('Draft Q3 OKRs');
    expect(p.estMinutes).toBe(90);
    expect(p.importance).toBe(2);
    expect(p.due).toBe('2026-07-01');
    expect(p.project).toBe('Planning');
    expect(p.unparsed).toEqual([]);
  });

  it('flags a malformed estimate instead of swallowing it into the title', () => {
    const p = previewCapture('Call the dentist ~1hh30m');
    expect(p.title).toBe('Call the dentist ~1hh30m');
    expect(p.estMinutes).toBeNull();
    expect(p.unparsed).toEqual(['~1hh30m']);
  });

  it('treats a plain title as just a title', () => {
    expect(previewCapture('Buy milk')).toMatchObject({
      title: 'Buy milk', estMinutes: null, importance: 0, due: null, project: null, unparsed: [],
    });
  });

  it('does not flag trailing markdown or an emoji as a typo', () => {
    expect(previewCapture('Review the *design*').unparsed).toEqual([]);
    expect(previewCapture('Thanks team :)').unparsed).toEqual([]);
  });

  it('parses an importance-only capture to an empty title with no typo flag', () => {
    const p = previewCapture('!!');
    expect(p.title).toBe('');
    expect(p.importance).toBe(2);
    expect(p.unparsed).toEqual([]);
  });
});
