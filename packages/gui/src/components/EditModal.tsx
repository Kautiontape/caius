import { useEffect, useState } from 'react';
import type { UiTask } from '../lib/api';
import { postTask } from '../lib/api';
import { buildPatch, formatEstimate, parseEstimate, type EditFields } from '../lib/edit';

interface Props {
  task: UiTask;
  onClose: () => void;
  onSaved: () => void;
}

const IMPORTANCE: { value: 0 | 1 | 2 | 3; label: string }[] = [
  { value: 0, label: 'none' },
  { value: 1, label: '!' },
  { value: 2, label: '!!' },
  { value: 3, label: '!!!' },
];

/** Edit modal (spec §B5): a dimmed backdrop over a panel pre-filled from the task.
 * Save posts ONLY the changed fields as a `patch` via postTask; a 409/error shows a
 * conflict notice. Esc and backdrop-click dismiss. */
export function EditModal({ task, onClose, onSaved }: Props) {
  const [fields, setFields] = useState<EditFields>({
    text: task.text,
    estimate: formatEstimate(task.estMinutes),
    importance: task.importance as 0 | 1 | 2 | 3,
    due: task.due ?? '',
    project: task.project ?? '',
    description: task.notes.join('\n'),
  });
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof EditFields>(key: K, value: EditFields[K]) =>
    setFields((f) => ({ ...f, [key]: value }));

  const patch = buildPatch(task, fields);
  const estInvalid = parseEstimate(fields.estimate) === 'invalid';
  const canSave = !estInvalid && Object.keys(patch).length > 0 && !saving;

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setConflict(null);
    try {
      const res = await postTask({ file: task.file, line: task.line, expectedText: task.text, patch });
      if (res.conflict || res.error) {
        setConflict(res.conflict ?? res.error ?? 'changed on disk — reload');
      } else {
        onSaved();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const labelCls = 'text-xs uppercase tracking-wide text-dim';
  const inputCls = 'rounded-md border border-line bg-panel2 px-2 py-1 text-sm text-ink';

  return (
    <div
      data-testid="edit-backdrop"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        data-testid="edit-modal"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-line bg-panel p-4 shadow-lg"
      >
        <div className="flex flex-col gap-1">
          <label className={labelCls} htmlFor="edit-text">Task</label>
          <input
            id="edit-text"
            data-testid="edit-text"
            value={fields.text}
            onChange={(e) => set('text', e.target.value)}
            className={inputCls}
          />
        </div>

        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label className={labelCls} htmlFor="edit-estimate">Estimate</label>
            <input
              id="edit-estimate"
              data-testid="edit-estimate"
              value={fields.estimate}
              onChange={(e) => set('estimate', e.target.value)}
              placeholder="30m / 1h30m"
              className={`${inputCls} ${estInvalid ? 'border-over text-over' : ''}`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className={labelCls}>Importance</span>
            <div className="flex rounded-md bg-panel2 p-0.5 text-sm">
              {IMPORTANCE.map((i) => (
                <button
                  key={i.value}
                  type="button"
                  data-testid={`edit-importance-${i.value}`}
                  onClick={() => set('importance', i.value)}
                  className={`rounded px-2 py-1 ${
                    fields.importance === i.value ? 'bg-accent text-bg' : 'text-dim'
                  }`}
                >
                  {i.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label className={labelCls} htmlFor="edit-due">Due</label>
            <input
              id="edit-due"
              data-testid="edit-due"
              type="date"
              value={fields.due}
              onChange={(e) => set('due', e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className={labelCls} htmlFor="edit-project">Project</label>
            <input
              id="edit-project"
              data-testid="edit-project"
              value={fields.project}
              onChange={(e) => set('project', e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls} htmlFor="edit-description">Description</label>
          <textarea
            id="edit-description"
            data-testid="edit-description"
            value={fields.description}
            onChange={(e) => set('description', e.target.value)}
            rows={4}
            className={`${inputCls} resize-y`}
          />
        </div>

        {conflict && (
          <div data-testid="edit-conflict" className="rounded-md border border-over/40 bg-panel2 p-2 text-sm text-over">
            {conflict} — reload
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            data-testid="edit-cancel"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-dim hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="edit-save"
            onClick={() => void onSave()}
            disabled={!canSave}
            className="rounded-md bg-accent px-3 py-1.5 text-sm text-bg disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
