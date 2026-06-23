import { describe, it, expect } from 'vitest';
import { parseTaskLine } from '../src/parse-line.js';
import { renderTaskLine } from '../src/render-line.js';

const round = (line: string) => renderTaskLine(parseTaskLine(line)!);

describe('renderTaskLine', () => {
  it('byte-identical for unchanged well-formed lines', () => {
    for (const line of [
      '- [ ] plain task',
      '  - [/] in progress ~30m',
      '* [x] done with project :[[Caius]]',
      '+ [-] cancelled !! *2026-07-01',
      '- [ ] with anchor ^abc123',
    ])
      expect(round(line)).toBe(line);
  });

  it('renders changed state via the glyph map', () => {
    const t = parseTaskLine('- [ ] task')!;
    expect(renderTaskLine({ ...t, state: 'done' })).toBe('- [x] task');
  });
});
