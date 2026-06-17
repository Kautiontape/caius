import { useState } from 'react';
import { RITUALS, type Altitude, type Posture } from '../lib/grains';

interface Props {
  altitude: Altitude;
  posture: Posture;
  onPick: (altitude: Altitude, posture: Posture) => void;
  onPosture: (posture: Posture) => void;
}

const ALTITUDES: Altitude[] = ['month', 'week', 'day'];

export function RitualHeader({ altitude, posture, onPick, onPosture }: Props) {
  const [open, setOpen] = useState(false);
  const ritual = RITUALS[altitude][posture];
  return (
    <header className="flex items-center gap-4 px-5 py-4 border-b border-line relative">
      <button
        data-testid="ritual-title"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-2xl font-medium text-ink"
      >
        {ritual.title}
        <span className="text-dim text-base">▾</span>
      </button>

      <div className="flex rounded-full bg-panel2 p-0.5 text-sm" data-testid="posture-toggle">
        {(['plan', 'review'] as Posture[]).map((ps) => (
          <button
            key={ps}
            data-testid={`posture-${ps}`}
            onClick={() => onPosture(ps)}
            className={`px-3 py-1 rounded-full capitalize ${
              posture === ps ? (ps === 'review' ? 'bg-warn text-bg' : 'bg-accent text-bg') : 'text-dim'
            }`}
          >
            {ps}
          </button>
        ))}
      </div>

      <span className="ml-auto text-dim text-xs">{ritual.blurb}</span>

      {open && (
        <div
          data-testid="ritual-menu"
          className="absolute left-5 top-16 z-10 w-72 rounded-lg border border-line bg-panel p-2 shadow-xl"
        >
          {ALTITUDES.map((alt) => (
            <div key={alt} className="mb-2 last:mb-0">
              <div className="px-2 py-1 text-xs uppercase tracking-wide text-dim">{alt}</div>
              {(['plan', 'review'] as Posture[]).map((ps) => (
                <button
                  key={ps}
                  data-testid={`menu-${alt}-${ps}`}
                  onClick={() => {
                    onPick(alt, ps);
                    setOpen(false);
                  }}
                  className="block w-full rounded px-2 py-1.5 text-left hover:bg-panel2"
                >
                  {RITUALS[alt][ps].title}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </header>
  );
}
