import { scanTokens } from '@caius/core';

export interface CapturePreview {
  title: string;
  estMinutes: number | null;
  importance: 0 | 1 | 2 | 3;
  due: string | null;        // YYYY-MM-DD
  project: string | null;
  /** trailing word(s) that look like a token sigil but did not parse (likely typos). */
  unparsed: string[];
}

// A leftover last word that *looks* like an attempted token (matching the capture
// grammar's sigil shapes) but didn't parse — surfaced as a likely typo. Narrow on
// purpose so prose like "*bold*" or ":)" is not flagged.
const LOOKS_LIKE_TOKEN = /^~\d|^\*\d|^:\[\[|^&[A-Za-z]|^!+$/;

/** Preview the canonical parse of a capture line, reusing the engine's trailing-
 * token scanner so the preview always matches what the server will index. */
export function previewCapture(input: string): CapturePreview {
  const { text, tokens } = scanTokens(input.trim());
  const p: CapturePreview = {
    title: text, estMinutes: null, importance: 0, due: null, project: null, unparsed: [],
  };
  for (const t of tokens) {
    if (t.kind === 'estimate') p.estMinutes = t.minutes;
    else if (t.kind === 'importance') p.importance = t.tier;
    else if (t.kind === 'due') p.due = t.date;
    else if (t.kind === 'project') p.project = t.project;
  }
  // Heuristic typo flag: the last word of the leftover title begins with a token
  // sigil but never became a token (e.g. "~1hh30m", "*2026-7-1").
  const lastWord = p.title.split(/\s+/).pop() ?? '';
  if (lastWord !== '' && LOOKS_LIKE_TOKEN.test(lastWord)) p.unparsed.push(lastWord);
  return p;
}
