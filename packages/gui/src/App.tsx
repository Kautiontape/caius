import { useEffect, useState } from 'react';
import { type Altitude, type Posture, RITUALS } from './lib/grains';
import { fetchFunnel, fetchSummary, fetchOverdue, type FunnelData, type SummaryData, type UiTask } from './lib/api';
import { RitualHeader } from './components/RitualHeader';
import { PipelineStrip } from './components/PipelineStrip';

export function App() {
  const [altitude, setAltitude] = useState<Altitude>('day');
  const [posture, setPosture] = useState<Posture>('plan');
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [overdue, setOverdue] = useState<UiTask[]>([]);

  useEffect(() => {
    void fetchFunnel().then(setFunnel);
    void fetchSummary().then(setSummary);
    void fetchOverdue().then(setOverdue);
  }, []);

  const ritual = RITUALS[altitude][posture];

  return (
    <div className="min-h-full">
      <RitualHeader
        altitude={altitude}
        posture={posture}
        onPick={(a, p) => { setAltitude(a); setPosture(p); }}
        onPosture={setPosture}
      />
      <PipelineStrip
        byGrain={funnel?.byGrain ?? {}}
        from={ritual.from}
        to={ritual.to}
        auditGrain={ritual.grain}
        overdueCount={overdue.length}
        nowCount={funnel?.now.length ?? 0}
      />
      <main className="p-5" data-testid="ritual-body">
        <div className="text-dim text-sm">
          {summary ? `${summary.report.liveCount} live tasks · ${summary.vault}` : 'loading…'}
        </div>
        <div className="mt-4 text-dim" data-testid="view-placeholder">
          {ritual.title} — view lands in Milestone {posture === 'plan' ? 2 : 3}.
        </div>
      </main>
    </div>
  );
}
