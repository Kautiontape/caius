// Trailing debounce: coalesce a burst of calls into one call after `ms` of quiet.

export interface Debounced {
  (): void;
  cancel(): void;
}

export function debounce(fn: () => void, ms: number): Debounced {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const d = (() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  }) as Debounced;
  d.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return d;
}
