import { describe, it, expect } from 'vitest';
import { parseInline } from './inline';

describe('parseInline', () => {
  it('returns one text segment when there is no markdown', () => {
    expect(parseInline('Plain task title')).toEqual([{ kind: 'text', text: 'Plain task title' }]);
  });

  it('extracts a link as display text + href, keeping surrounding text', () => {
    expect(parseInline('Reply to [email](https://x.test/a) about it')).toEqual([
      { kind: 'text', text: 'Reply to ' },
      { kind: 'link', text: 'email', href: 'https://x.test/a' },
      { kind: 'text', text: ' about it' },
    ]);
  });

  it('extracts bold and inline code', () => {
    expect(parseInline('Do **now** with `npm run`')).toEqual([
      { kind: 'text', text: 'Do ' },
      { kind: 'bold', text: 'now' },
      { kind: 'text', text: ' with ' },
      { kind: 'code', text: 'npm run' },
    ]);
  });
});
