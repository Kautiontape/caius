import { type Altitude, type Posture } from '../lib/grains';
import { ThemeToggle } from './ThemeToggle';

interface Props {
  altitude: Altitude;
  posture: Posture;
  mode: 'plan' | 'focus';
  onGrain: (a: Altitude) => void;
  onPosture: (p: Posture) => void;
  onMode: (m: 'plan' | 'focus') => void;
}

const GRAINS: { value: Altitude; label: string }[] = [
  { value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }, { value: 'day', label: 'Day' },
];

export function PlanHeader({ altitude, posture, mode, onGrain, onPosture, onMode }: Props) {
  return (
    <header className="flex items-center gap-4 border-b border-line px-5 py-4">
      <select
        data-testid="grain-select"
        value={altitude}
        onChange={(e) => onGrain(e.target.value as Altitude)}
        disabled={mode === 'focus'}
        className="rounded-md bg-panel2 px-2 py-1 text-xl font-medium text-ink disabled:opacity-40"
      >
        {GRAINS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
      </select>

      <div className="flex rounded-full bg-panel2 p-0.5 text-sm" data-testid="posture-toggle">
        {(['plan', 'review'] as Posture[]).map((ps) => (
          <button
            key={ps}
            data-testid={`posture-${ps}`}
            onClick={() => { onMode('plan'); onPosture(ps); }}
            className={`rounded-full px-3 py-1 capitalize ${
              mode === 'plan' && posture === ps ? 'bg-accent text-bg' : 'text-dim'
            }`}
          >
            {ps}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button
          data-testid="mode-focus"
          onClick={() => onMode('focus')}
          className={`rounded-full px-3 py-1 text-sm ${mode === 'focus' ? 'bg-good text-bg' : 'text-dim'}`}
        >
          Focus
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
