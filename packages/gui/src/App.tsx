import { useEffect, useReducer, useState } from 'react';
import { type Altitude, type Posture, RITUALS } from './lib/grains';
import {
  fetchFunnel, fetchSummary, fetchOverdue, fetchTasksAtGrain, fetchReview,
  type FunnelData, type SummaryData, type UiTask,
} from './lib/api';
import { stagingReducer, commit, type PendingChange, type CommitResult } from './lib/staging';
import { RitualHeader } from './components/RitualHeader';
import { PipelineStrip } from './components/PipelineStrip';
import { PlanView } from './components/PlanView';
import { DayPlanView } from './components/DayPlanView';
import { PendingTray } from './components/PendingTray';
import { ReviewView } from './components/ReviewView';
import { RitualSummary } from './components/RitualSummary';

export function App() {
  const [altitude, setAltitude] = useState<Altitude>('day');
  const [posture, setPosture] = useState<Posture>('plan');
  const [targetBucket, setTargetBucket] = useState<'this' | 'next'>('this');

  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [overdue, setOverdue] = useState<UiTask[]>([]);
  const [source, setSource] = useState<UiTask[]>([]);
  const [review, setReview] = useState<{ done: UiTask[]; open: UiTask[] }>({ done: [], open: [] });

  const [buffer, dispatch] = useReducer(stagingReducer, {});
  const [conflicts, setConflicts] = useState<CommitResult['conflicts']>([]);

  const ritual = RITUALS[altitude][posture];

  useEffect(() => {
    void fetchFunnel().then(setFunnel);
    void fetchSummary().then(setSummary);
    void fetchOverdue().then(setOverdue);
  }, []);

  useEffect(() => {
    if (posture === 'plan' && ritual.from) void fetchTasksAtGrain(ritual.from).then(setSource);
  }, [posture, ritual.from]);

  useEffect(() => {
    if (posture === 'review' && ritual.grain) void fetchReview(ritual.grain).then(setReview);
  }, [posture, ritual.grain]);

  const onStage = (c: PendingChange) => dispatch({ type: 'stage', change: c });
  const onUnstage = (taskId: string) => dispatch({ type: 'unstage', taskId });

  const onCommit = async () => {
    const res = await commit(buffer);
    setConflicts(res.conflicts);
    // Keep conflicts staged; clear the applied (clean) subset.
    const conflictIds = new Set(res.conflicts.map((c) => c.taskId));
    for (const id of Object.keys(buffer)) if (!conflictIds.has(id)) dispatch({ type: 'unstage', taskId: id });
    void fetchFunnel().then(setFunnel);
  };

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
      <main className="grid grid-cols-[1fr_320px] gap-5 p-5" data-testid="ritual-body">
        <div>
          {posture === 'plan' && altitude !== 'day' && (
            <div className="mb-3 flex gap-1 text-xs" data-testid="bucket-toggle">
              {(['this', 'next'] as const).map((b) => (
                <button
                  key={b}
                  data-testid={`bucket-${b}`}
                  onClick={() => setTargetBucket(b)}
                  className={`rounded px-2 py-1 ${targetBucket === b ? 'bg-panel2 text-ink' : 'text-dim'}`}
                >
                  {b} {altitude}
                </button>
              ))}
            </div>
          )}

          {posture === 'plan' && altitude === 'day' && (
            <DayPlanView
              source={source}
              capacityMinutes={summary?.capacityMinutes ?? 480}
              pending={buffer}
              onStage={onStage}
              onUnstage={onUnstage}
            />
          )}
          {posture === 'plan' && altitude !== 'day' && (
            <PlanView
              altitude={altitude}
              source={source}
              targetBucket={targetBucket}
              pending={buffer}
              onStage={onStage}
              onUnstage={onUnstage}
            />
          )}
          {posture === 'review' && (
            <div className="flex flex-col gap-4">
              <RitualSummary
                altitude={altitude}
                doneCount={review.done.length}
                openCount={review.open.length}
                stagedCount={Object.keys(buffer).length}
              />
              <ReviewView
                altitude={altitude}
                done={review.done}
                open={review.open}
                pending={buffer}
                onStage={onStage}
                onUnstage={onUnstage}
              />
            </div>
          )}
        </div>

        <PendingTray
          changes={Object.values(buffer)}
          commitLabel={`commit ${ritual.title.toLowerCase()}`}
          conflicts={conflicts}
          onUnstage={onUnstage}
          onCommit={() => void onCommit()}
        />
      </main>
    </div>
  );
}
