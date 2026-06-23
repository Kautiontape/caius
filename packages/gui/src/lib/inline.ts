export type InlineSeg =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'bold'; text: string }
  | { kind: 'code'; text: string };

// Only allow safe URL schemes in rendered links; anything else (e.g. javascript:) → '#'.
function safeHref(url: string): string {
  return /^(https?|obsidian|mailto):/i.test(url) ? url : '#';
}

// One left-to-right pass: links [t](url), bold **t**, inline code `t`. No nesting.
const PATTERN = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;

export function parseInline(input: string): InlineSeg[] {
  const segs: InlineSeg[] = [];
  let last = 0;
  for (const m of input.matchAll(PATTERN)) {
    const i = m.index ?? 0;
    if (i > last) segs.push({ kind: 'text', text: input.slice(last, i) });
    if (m[1] !== undefined) segs.push({ kind: 'link', text: m[1], href: safeHref(m[2]!) });
    else if (m[3] !== undefined) segs.push({ kind: 'bold', text: m[3] });
    else if (m[4] !== undefined) segs.push({ kind: 'code', text: m[4] });
    last = i + m[0].length;
  }
  if (last < input.length) segs.push({ kind: 'text', text: input.slice(last) });
  return segs;
}
