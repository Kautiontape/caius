import { describe, it, expect } from 'vitest';
import { parseInline, resolveHref } from './inline';

describe('parseInline', () => {
  it('returns one text segment when there is no markdown', () => {
    expect(parseInline('Plain task title')).toEqual([{ kind: 'text', text: 'Plain task title' }]);
  });
  it('extracts a link as display text + raw href', () => {
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
  it('extracts a wikilink with and without an alias', () => {
    expect(parseInline('See [[Project Notes]]')).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'wikilink', target: 'Project Notes', text: 'Project Notes' },
    ]);
    expect(parseInline('See [[Project Notes|the notes]]')).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'wikilink', target: 'Project Notes', text: 'the notes' },
    ]);
  });
  it('returns an empty array for empty input', () => {
    expect(parseInline('')).toEqual([]);
  });
  it('passes an unclosed delimiter through as plain text', () => {
    expect(parseInline('half **bold')).toEqual([{ kind: 'text', text: 'half **bold' }]);
  });
});

describe('resolveHref', () => {
  it('passes external schemes through', () => {
    expect(resolveHref('https://x.test/a', 'Main')).toEqual({ href: 'https://x.test/a', external: true });
    expect(resolveHref('mailto:a@b.c', 'Main')).toEqual({ href: 'mailto:a@b.c', external: true });
  });
  it('routes a scheme-less note path through obsidian://', () => {
    expect(resolveHref('Some Note.md', 'Main')).toEqual({ href: 'obsidian://open?vault=Main&file=Some%20Note', external: false });
  });
  it('blocks dangerous schemes', () => {
    expect(resolveHref('javascript:alert(1)', 'Main')).toEqual({ href: '#', external: false });
  });
});
