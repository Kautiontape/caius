import type { StagingBuffer, PendingChange } from './staging';
import { BUCKET_LABEL } from './grains';

export interface CommitSummary {
  total: number;
  rows: { title: string; toTier: string; kind: PendingChange['kind'] }[];
  byTier: { tier: string; count: number }[];
}

const tierLabel = (g: PendingChange['toGrain']): string =>
  g === 'someday' ? 'Someday' : BUCKET_LABEL[g];

/** Summarize a staging buffer for the pre-commit confirmation: a flat row list
 * plus per-destination-tier counts (insertion order preserved). Pure. */
export function summarizeBuffer(buffer: StagingBuffer): CommitSummary {
  const changes = Object.values(buffer);
  const rows = changes.map((c) => ({ title: c.snapshot.text, toTier: tierLabel(c.toGrain), kind: c.kind }));
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.toTier, (counts.get(r.toTier) ?? 0) + 1);
  const byTier = [...counts.entries()].map(([tier, count]) => ({ tier, count }));
  return { total: changes.length, rows, byTier };
}
