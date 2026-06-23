import type { UiTask } from './api';

/** The editable form state. */
export interface EditFields {
  text: string;
  estimate: string;        // human estimate input, e.g. "" | "30m" | "1h" | "1h30m" | "90"
  importance: 0 | 1 | 2 | 3;
  due: string;             // "" clears; otherwise YYYY-MM-DD (from a date input)
  project: string;         // "" clears
  description: string;     // multi-line; "" clears the note block
}

/** Parse a human estimate into integer minutes. "" → null (clear). Returns
 * `'invalid'` for unparseable input so the modal can block Save. Accepts
 * `Nh`, `Nm`, `NhMm`, or a bare integer (minutes). */
export function parseEstimate(s: string): number | null | 'invalid' {
  const trimmed = s.trim();
  if (trimmed === '') return null;
  // Bare integer → minutes (a 0-minute estimate is meaningless).
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return n > 0 ? n : 'invalid';
  }
  // Nh, Nm, or NhMm (case-insensitive, no leading sign).
  const m = /^(?:(\d+)h)?(?:(\d+)m)?$/i.exec(trimmed);
  if (!m || (m[1] === undefined && m[2] === undefined)) return 'invalid';
  const hours = m[1] ? Number(m[1]) : 0;
  const mins = m[2] ? Number(m[2]) : 0;
  const total = hours * 60 + mins;
  return total > 0 ? total : 'invalid';
}

/** Format minutes back to the estimate input value (inverse of parseEstimate for
 * canonical inputs): null → "", 90 → "1h30m", 60 → "1h", 30 → "30m". */
export function formatEstimate(min: number | null): string {
  if (min == null) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}h${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/** Build a TaskPatch containing ONLY the fields that differ from the task. The
 * patch values satisfy the server's B3 validation. May be empty if nothing
 * changed. */
export function buildPatch(task: UiTask, fields: EditFields): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (fields.text !== task.text) patch.text = fields.text;

  const m = parseEstimate(fields.estimate);
  if (m !== 'invalid' && m !== task.estMinutes) patch.estMinutes = m;

  if (fields.importance !== task.importance) patch.importance = fields.importance;

  const due = fields.due.trim() || null;
  if (due !== task.due) patch.due = due;

  const project = fields.project.trim() || null;
  if (project !== task.project) patch.project = project;

  const origDescription = task.notes.join('\n').trim();
  if (fields.description.trim() !== origDescription) patch.description = fields.description.trim();

  return patch;
}
