import { Fragment, useContext } from 'react';
import { parseInline, resolveHref, wikiHref } from '../lib/inline';
import { ObsidianContext } from '../lib/obsidian';

/** Render a task title with inline markdown (links / wikilinks / bold / code).
 * Display only; canonical task text is untouched. Non-external links and wikilinks
 * open via the obsidian:// handler. */
export function InlineText({ text }: { text: string }) {
  const { vault } = useContext(ObsidianContext);
  const linkCls = 'text-accent underline decoration-dotted hover:opacity-80';
  return (
    <>
      {parseInline(text).map((s, i) => {
        if (s.kind === 'link') {
          const { href, external } = resolveHref(s.href, vault);
          return (
            <a key={i} href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
              onClick={(e) => e.stopPropagation()} className={linkCls}>{s.text}</a>
          );
        }
        if (s.kind === 'wikilink') {
          return (
            <a key={i} href={wikiHref(s.target, vault)} onClick={(e) => e.stopPropagation()} className={linkCls}>{s.text}</a>
          );
        }
        if (s.kind === 'bold') return <strong key={i}>{s.text}</strong>;
        if (s.kind === 'code') return <code key={i} className="rounded bg-panel px-1 text-[0.92em]">{s.text}</code>;
        return <Fragment key={i}>{s.text}</Fragment>;
      })}
    </>
  );
}
