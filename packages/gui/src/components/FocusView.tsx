import { useEffect, useState } from 'react';
import { fetchFocus, postTask, toUiTask, type ApiTask, type FocusData } from '../lib/api';
import { TaskCard } from './TaskCard';
import { ShutdownBar } from './ShutdownBar';

/** Focus mode: today's doing-list. ShutdownBar at the top, a done-today tally, then
 * each active task as a card with live state writes (complete / start-stop / archive)
 * via POST /api/task. Each write re-fetches focus so the list and tally stay correct;
 * a 409 conflict surfaces a small banner and refreshes from disk. */
export function FocusView() {
  const [data, setData] = useState<FocusData>({ date: '', active: [], doneToday: 0 });
  const [conflict, setConflict] = useState(false);

  const refresh = () => void fetchFocus().then(setData);
  useEffect(refresh, []);

  const act = async (task: ApiTask, patch: Record<string, unknown>) => {
    const res = await postTask({ file: task.file, line: task.line, expectedText: task.text, patch });
    if (res.conflict) setConflict(true);
    else setConflict(false);
    refresh();
  };

  return (
    <main data-testid="focus-view" className="flex flex-col gap-4 p-5">
      <ShutdownBar active={data.active.map((t) => ({ estMinutes: t.estMinutes }))} />

      {conflict && (
        <div data-testid="focus-conflict" className="rounded-lg border border-over/40 bg-panel p-2 text-sm text-over">
          changed on disk — refreshing…
        </div>
      )}

      <div data-testid="done-today" className="text-xs uppercase tracking-wide text-good">
        {data.doneToday} done today
      </div>

      <div className="flex flex-col gap-1.5">
        {data.active.map((t) => (
          <TaskCard
            key={`${t.file}\n${t.line}`}
            task={toUiTask(t)}
            showFile
            actions={
              <div className="flex gap-1 text-xs">
                <button
                  data-testid="focus-complete"
                  onClick={() => void act(t, { state: 'done' })}
                  className="rounded bg-panel2 px-2 py-0.5 text-good"
                >
                  done
                </button>
                <button
                  data-testid="focus-toggle"
                  onClick={() => void act(t, { state: t.state === 'in_progress' ? 'open' : 'in_progress' })}
                  className="rounded bg-panel2 px-2 py-0.5 text-accent"
                >
                  {t.state === 'in_progress' ? 'stop' : 'start'}
                </button>
                <button
                  data-testid="focus-archive"
                  onClick={() => void act(t, { state: 'cancelled' })}
                  className="rounded bg-panel2 px-2 py-0.5 text-over"
                >
                  archive
                </button>
              </div>
            }
          />
        ))}
        {data.active.length === 0 && (
          <div data-testid="focus-clear" className="text-xs italic text-dim">nothing on the list ✓</div>
        )}
      </div>
    </main>
  );
}
