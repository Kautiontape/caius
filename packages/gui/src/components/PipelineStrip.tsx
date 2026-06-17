import { PIPELINE, GRAIN_LABEL, type Grain } from '../lib/grains';

interface Props {
  byGrain: Record<string, number>;
  from?: Grain;
  to?: Grain;
  auditGrain?: Grain;
  overdueCount: number;
  nowCount: number;
}

export function PipelineStrip({ byGrain, from, to, auditGrain, overdueCount, nowCount }: Props) {
  const lit = (g: Grain) => g === from || g === to || g === auditGrain;
  return (
    <div className="flex items-center gap-2 px-5 py-2 border-b border-line text-xs" data-testid="pipeline-strip">
      {PIPELINE.map((g, i) => (
        <span key={g} className="flex items-center gap-2">
          {i > 0 && <span className="text-dim">→</span>}
          <span
            data-testid={`pipe-${g}`}
            className={`rounded px-2 py-1 ${lit(g) ? 'bg-panel2 text-ink' : 'text-dim'}`}
          >
            {GRAIN_LABEL[g]} <b className="text-ink">{byGrain[g] ?? 0}</b>
          </span>
        </span>
      ))}
      <span className="ml-auto flex gap-3">
        <span className="text-good" data-testid="now-count">now {nowCount}</span>
        <span className="text-over" data-testid="overdue-count">overdue {overdueCount}</span>
      </span>
    </div>
  );
}
