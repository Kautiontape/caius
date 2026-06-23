import { useState } from 'react';
import { postCapture } from '../lib/api';
import { previewCapture } from '../lib/capturePreview';

/** Quick-add capture (spec §B6): a pinned input that appends a brand-new task to
 * the default capture note (today's daily note). Enter submits; on success the
 * input clears and `onCaptured` fires so the board re-fetches and the new task
 * surfaces. Inline grammar tokens (~30m, !!, *2026-07-01, :[[Project]]) are sent
 * verbatim and parsed on the next scan — no client-side parsing here. */
export function QuickAdd({ onCaptured }: { onCaptured: () => void }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = text.trim();
  const preview = trimmed ? previewCapture(text) : null;
  const hasTokens = !!preview && (preview.estMinutes != null || preview.importance > 0 || preview.due != null || preview.project != null || preview.unparsed.length > 0);

  const submit = async () => {
    const trimmed = text.trim();
    if (trimmed === '' || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await postCapture(trimmed);
      if (res.ok) {
        setText('');
        onCaptured();
      } else {
        setError(res.error ?? 'capture failed');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <input
        data-testid="quick-add"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
        disabled={saving}
        placeholder="Capture a task… (⏎)   supports ~30m  !!  *2026-07-01  :[[Project]]"
        className="w-full rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-ink placeholder:text-dim disabled:opacity-50"
      />
      {preview && hasTokens && (
        <div data-testid="capture-preview" className="flex flex-wrap items-center gap-1.5 px-1 text-[11px]">
          <span className="rounded border border-line bg-panel2 px-1.5 py-0.5 text-ink">{preview.title || '(no title yet)'}</span>
          {preview.estMinutes != null && (
            <span className="rounded border border-line px-1.5 py-0.5 text-good">~{preview.estMinutes}m</span>
          )}
          {preview.importance > 0 && (
            <span className="rounded border border-line px-1.5 py-0.5 text-warn">{'!'.repeat(preview.importance)}</span>
          )}
          {preview.due && (
            <span className="rounded border border-line px-1.5 py-0.5 text-accent">due {preview.due}</span>
          )}
          {preview.project && (
            <span className="rounded border border-line px-1.5 py-0.5 text-accent">{preview.project}</span>
          )}
          {preview.unparsed.map((u) => (
            <span key={u} data-testid="capture-unparsed" className="rounded border border-over/50 px-1.5 py-0.5 text-over">
              "{u}" isn't a valid token — it'll stay in the title
            </span>
          ))}
        </div>
      )}
      {error && (
        <span data-testid="quick-add-error" className="text-xs text-over">{error}</span>
      )}
    </div>
  );
}
