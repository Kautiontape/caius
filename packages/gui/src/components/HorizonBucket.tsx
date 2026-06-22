import type { ReactNode } from 'react';
import { BUCKET_LABEL } from '../lib/grains';

interface Props {
  grain: 'month' | 'week' | 'day';
  emphasized: boolean;
  count: number;
  capacity?: { estMinutes: number; capacityMinutes: number }; // Today only
  dropActive?: boolean;       // true while a drag is in progress (A4)
  children: ReactNode;
}

export function HorizonBucket({ grain, emphasized, count, capacity, dropActive, children }: Props) {
  const over = capacity ? capacity.estMinutes > capacity.capacityMinutes : false;
  return (
    <div
      data-testid={`bucket-${grain}`}
      data-emphasized={emphasized ? 'true' : 'false'}
      className={`rounded-lg border bg-panel p-3 transition-all ${
        emphasized ? 'border-2 border-accent shadow-sm' : 'border border-line opacity-80'
      } ${dropActive ? 'ring-2 ring-accent/50' : ''}`}
    >
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-dim">
        <span>{BUCKET_LABEL[grain]}</span>
        {capacity
          ? <span data-testid="cap-today" className={over ? 'text-over' : ''}>{capacity.estMinutes}/{capacity.capacityMinutes}m</span>
          : <span>{count}</span>}
      </div>
      <div className="mt-2 flex flex-col gap-1.5">{children}</div>
      {dropActive && <div className="mt-2 rounded border border-dashed border-accent bg-accent/10 p-2 text-center text-xs text-accent">drop here</div>}
    </div>
  );
}
