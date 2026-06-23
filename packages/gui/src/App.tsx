import { useEffect, useReducer, useState } from 'react';
import { type Altitude, type Posture, RITUALS } from './lib/grains';
import {
  fetchFunnel, fetchSummary, fetchOverdue, fetchReview,
  type FunnelData, type SummaryData, type UiTask,
} from './lib/api';
import { stagingReducer, commit, type PendingChange, type CommitResult } from './lib/staging';
import { ObsidianContext } from './lib/obsidian';
import { PlanHeader } from './components/PlanHeader';
import { PipelineStrip } from './components/PipelineStrip';
import { PlanBoard } from './components/PlanBoard';
import { ReviewView } from './components/ReviewView';
import { RitualSummary } from './components/RitualSummary';
import { FocusView } from './components/FocusView';

export function App() {
  const [altitude, setAltitude] = useState<Altitude>('day');
  const [posture, setPosture] = useState<Posture>('plan');
  const [mode, setMode] = useState<'plan' | 'focus'>('plan');

  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [overdue, setOverdue] = useState<UiTask[]>([]);
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
    if (posture === 'review' && ritual.grain) void fetchReview(ritual.grain).then(setReview);
  }, [posture, ritual.grain]);

  const onStage = (c: PendingChange) => { dispatch({ type: 'stage', change: c }); setConflicts([]); };
  const onUnstage = (taskId: string) => { dispatch({ type: 'unstage', taskId }); setConflicts([]); };

  const onCommit = async () => {
    const res = await commit(buffer);
    setConflicts(res.conflicts);
    // Keep conflicts staged; clear the applied (clean) subset.
    const conflictIds = new Set(res.conflicts.map((c) => c.taskId));
    for (const id of Object.keys(buffer)) if (!conflictIds.has(id)) dispatch({ type: 'unstage', taskId: id });
    void fetchFunnel().then(setFunnel);
  };

  const obsidianValue = summary?.obsidian ?? { vault: 'Main', advancedUri: false };

  return (
    <ObsidianContext.Provider value={obsidianValue}>
    <div className="min-h-full">
      <PlanHeader
        altitude={altitude}
        posture={posture}
        mode={mode}
        onGrain={setAltitude}
        onPosture={setPosture}
        onMode={setMode}
      />
      <PipelineStrip
        byGrain={funnel?.byGrain ?? {}}
        from={ritual.from}
        to={ritual.to}
        auditGrain={ritual.grain}
        overdueCount={overdue.length}
        nowCount={funnel?.now.length ?? 0}
      />
      {mode === 'focus' ? (
        <FocusView />
      ) : (
        <main data-testid="ritual-body">
          {posture === 'plan' && (
            <PlanBoard
              altitude={altitude}
              capacityMinutes={summary?.capacityMinutes ?? 480}
              buffer={buffer}
              onStage={onStage}
              onUnstage={onUnstage}
              onCommit={() => void onCommit()}
              conflicts={conflicts}
            />
          )}
          {posture === 'review' && (
            <div className="flex flex-col gap-4 p-5">
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
        </main>
      )}
    </div>
    </ObsidianContext.Provider>
  );
}
