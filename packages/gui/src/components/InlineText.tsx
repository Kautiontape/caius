import { Fragment } from 'react';
import { parseInline } from '../lib/inline';

/** Render a task title with inline markdown (links / bold / code). Display only —
 * the canonical task text is never mutated. */
export function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((s, i) => {
        if (s.kind === 'link')
          return (
            <a
              key={i}
              href={s.href}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-accent underline decoration-dotted hover:opacity-80"
            >
              {s.text}
            </a>
          );
        if (s.kind === 'bold') return <strong key={i}>{s.text}</strong>;
        if (s.kind === 'code')
          return <code key={i} className="rounded bg-panel px-1 text-[0.92em]">{s.text}</code>;
        return <Fragment key={i}>{s.text}</Fragment>;
      })}
    </>
  );
}
