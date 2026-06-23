import { PIPELINE, GRAIN_LABEL, BUCKET_LABEL, type Grain } from '../lib/grains';

interface Props {
  byGrain: Record<string, number>;
  sourceTier: Grain;
  aimed: 'month' | 'week' | 'day';
  onAim: (t: 'month' | 'week' | 'day') => void;
  overdueCount: number;
  nowCount: number;
}

const isAimable = (g: Grain): g is 'month' | 'week' | 'day' => g === 'month' || g === 'week' || g === 'day';

export function PipelineStrip({ byGrain, sourceTier, aimed, onAim, overdueCount, nowCount }: Props) {
  const lit = (g: Grain) => g === sourceTier || g === aimed;
  return (
    <div className="border-b border-line px-5 py-2 text-xs" data-testid="pipeline-strip">
      <div className="flex items-center gap-2">
        {PIPELINE.map((g, i) => {
          const aimable = isAimable(g);
          return (
            <span key={g} className="flex items-center gap-2">
              {i > 0 && <span className="text-dim">→</span>}
              <button data-testid={`pipe-${g}`} disabled={!aimable} onClick={() => aimable && onAim(g)}
                className={`rounded px-2 py-1 ${lit(g) ? 'bg-panel2 text-ink' : 'text-dim'} ${aimable ? 'hover:text-ink' : 'cursor-default'}`}>
                {GRAIN_LABEL[g]} <b className="text-ink">{byGrain[g] ?? 0}</b>
              </button>
            </span>
          );
        })}
        <span className="ml-auto flex gap-3">
          <span className="text-good" data-testid="now-count">now {nowCount}</span>
          <span className="text-over" data-testid="overdue-count">overdue {overdueCount}</span>
        </span>
      </div>
      <div data-testid="ambient-caption" className="mt-1 text-[11px] text-dim">
        Pulling <span className="text-ink">{GRAIN_LABEL[sourceTier]}</span> → <span className="text-ink">{BUCKET_LABEL[aimed]}</span>
      </div>
    </div>
  );
}
