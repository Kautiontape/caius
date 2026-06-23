/** Whole days a due date is past `today` (both ISO YYYY-MM-DD). 0 or negative → not late. */
export function daysLate(due: string | null, today: string): number {
  if (!due) return 0;
  const a = Date.parse(`${due}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  const d = Math.round((b - a) / 86_400_000);
  return d > 0 ? d : 0;
}
