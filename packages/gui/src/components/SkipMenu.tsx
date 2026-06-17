import { useState } from 'react';
import { PIPELINE, GRAIN_LABEL, NEXT_GRAIN, type Grain } from '../lib/grains';

interface Props {
  current: Grain;                         // the task's current grain
  onPick: (toGrain: Grain, isSkip: boolean) => void;
}

/** ⋯ menu listing every grain finer than `current`; beyond the default `next` is a skip. */
export function SkipMenu({ current, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const finer = PIPELINE.slice(PIPELINE.indexOf(current) + 1);
  const def = NEXT_GRAIN[current];
  if (finer.length === 0) return null;
  return (
    <div className="relative">
      <button
        data-testid="skip-trigger"
        onClick={() => setOpen((o) => !o)}
        className="px-1.5 text-dim hover:text-ink"
        aria-label="more destinations"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-line bg-panel p-1 shadow-xl" data-testid="skip-menu">
          {finer.map((g) => {
            const isSkip = g !== def;
            return (
              <button
                key={g}
                data-testid={`skip-to-${g}`}
                onClick={() => { onPick(g, isSkip); setOpen(false); }}
                className="block w-full rounded px-2 py-1.5 text-left hover:bg-panel2"
              >
                → {GRAIN_LABEL[g]} {isSkip && <span className="text-warn text-xs">(skip)</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
