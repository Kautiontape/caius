export type InlineSeg =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'wikilink'; target: string; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'code'; text: string };

// wikilink [[Target]] / [[Target|Alias]]  |  link [t](url)  |  bold **t**  |  code `t`
const PATTERN = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;

/** Split a task title into inline segments. Hrefs are kept RAW here; scheme policy
 * is applied at render time by resolveHref (which needs the vault). */
export function parseInline(input: string): InlineSeg[] {
  const segs: InlineSeg[] = [];
  let last = 0;
  for (const m of input.matchAll(PATTERN)) {
    const i = m.index ?? 0;
    if (i > last) segs.push({ kind: 'text', text: input.slice(last, i) });
    if (m[1] !== undefined) segs.push({ kind: 'wikilink', target: m[1].trim(), text: (m[2] ?? m[1]).trim() });
    else if (m[3] !== undefined) segs.push({ kind: 'link', text: m[3], href: m[4]! });
    else if (m[5] !== undefined) segs.push({ kind: 'bold', text: m[5] });
    else if (m[6] !== undefined) segs.push({ kind: 'code', text: m[6] });
    last = i + m[0].length;
  }
  if (last < input.length) segs.push({ kind: 'text', text: input.slice(last) });
  return segs;
}

/** Resolve a markdown-link href for display. http/https/mailto pass through as
 * external; obsidian: passes through; other known schemes (javascript:, data:) are
 * blocked to '#'; a scheme-less href is treated as an Obsidian note path and routed
 * through the obsidian:// open handler. */
export function resolveHref(href: string, vault: string): { href: string; external: boolean } {
  if (/^(https?|mailto):/i.test(href)) return { href, external: true };
  if (/^obsidian:/i.test(href)) return { href, external: false };
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { href: '#', external: false };
  const file = href.replace(/\.md$/i, '');
  return { href: `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(file)}`, external: false };
}

/** obsidian:// open link for a wikilink target. */
export function wikiHref(target: string, vault: string): string {
  return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(target)}`;
}
