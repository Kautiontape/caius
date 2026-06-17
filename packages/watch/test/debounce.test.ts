import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../src/debounce.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('debounce', () => {
  it('collapses a burst into a single trailing call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d();
    d();
    d();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('restarts the timer on each call (only fires after quiet period)', () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d();
    vi.advanceTimersByTime(40);
    d(); // resets the 50ms window
    vi.advanceTimersByTime(40);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('fires again for a new burst after settling', () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d();
    vi.advanceTimersByTime(50);
    d();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('cancel() prevents a pending call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d();
    d.cancel();
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();
  });
});
