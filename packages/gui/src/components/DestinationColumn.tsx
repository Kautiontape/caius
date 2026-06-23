import { type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { BUCKET_LABEL } from '../lib/grains';
import type { CapacityMeter as Meter } from '../lib/capacity';
import { CapacityMeter } from './CapacityMeter';

type Tier = 'month' | 'week' | 'day';

interface Props {
  aimed: Tier;
  tabs: Tier[];
  isDefault: boolean;
  onAim: (t: Tier) => void;
  meter: Meter;
  count: number;
  dragging: boolean;
  children: ReactNode;
}

/** The aimable destination column. Tabs re-aim it; each tab is also a drop target
 * so a card can be sent to a tier without switching to it first. */
export function DestinationColumn({ aimed, tabs, isDefault, onAim, meter, count, dragging, children }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `bucket:${aimed}` });
  return (
    <div className="flex flex-col rounded-lg border border-line bg-panel p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex rounded-full bg-panel2 p-0.5 text-xs" data-testid="dest-tabs">
          {tabs.map((t) => <TabDrop key={t} tier={t} active={t === aimed} onAim={onAim} />)}
        </div>
        <span className="ml-auto text-[11px] uppercase tracking-wide text-dim">{isDefault ? 'destination' : 'peeking'} · {count}</span>
      </div>
      <CapacityMeter meter={meter} />
      <div ref={setNodeRef} data-testid={`bucket:${aimed}`}
        className={`mt-2 flex min-h-24 flex-1 flex-col gap-1.5 overflow-auto rounded border border-dashed p-2 transition-all ${isOver ? 'border-accent bg-accent/10' : dragging ? 'border-line' : 'border-transparent'}`}>
        {children}
        {dragging && <div className="rounded border border-dashed border-accent/60 p-2 text-center text-xs text-accent">drop to promote</div>}
      </div>
    </div>
  );
}

function TabDrop({ tier, active, onAim }: { tier: Tier; active: boolean; onAim: (t: Tier) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `tab:${tier}` });
  return (
    <button ref={setNodeRef} data-testid={`dest-tab-${tier}`} onClick={() => onAim(tier)}
      className={`rounded-full px-3 py-1 ${active ? 'bg-accent text-bg' : 'text-dim hover:text-ink'} ${isOver ? 'ring-2 ring-accent/50' : ''}`}>
      {BUCKET_LABEL[tier]}
    </button>
  );
}
