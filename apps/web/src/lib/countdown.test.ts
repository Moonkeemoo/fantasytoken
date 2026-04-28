import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCountdown } from './countdown.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCountdown', () => {
  it('returns ms-remaining and ticks down each second', () => {
    const endsAt = new Date(Date.now() + 5_000).toISOString();
    const { result } = renderHook(() => useCountdown(endsAt));
    expect(result.current).toBeGreaterThan(4_000);
    expect(result.current).toBeLessThanOrEqual(5_000);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBeLessThanOrEqual(4_000);
  });

  it('clamps to 0 after end', () => {
    const endsAt = new Date(Date.now() - 1_000).toISOString();
    const { result } = renderHook(() => useCountdown(endsAt));
    expect(result.current).toBe(0);
  });
});
