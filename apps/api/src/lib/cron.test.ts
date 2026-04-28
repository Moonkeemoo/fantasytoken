import { describe, expect, it, vi } from 'vitest';
import { scheduleEvery } from './cron.js';

const noopLog = { error: () => {}, warn: () => {}, info: () => {} } as never;

describe('scheduleEvery', () => {
  it('invokes fn immediately if runOnStart=true', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const stop = scheduleEvery({
      intervalMs: 60_000,
      fn,
      name: 'test',
      log: noopLog,
      runOnStart: true,
    });
    // fn is invoked synchronously then awaited; flush microtasks.
    await Promise.resolve();
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does not invoke immediately when runOnStart=false', () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const stop = scheduleEvery({
      intervalMs: 60_000,
      fn,
      name: 'test',
      log: noopLog,
      runOnStart: false,
    });
    expect(fn).not.toHaveBeenCalled();
    stop();
  });

  it('catches errors so the loop survives (INV-7 logs them)', async () => {
    const errors: unknown[] = [];
    const log = {
      error: (ctx: unknown) => errors.push(ctx),
      warn: () => {},
      info: () => {},
    } as never;
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    const stop = scheduleEvery({ intervalMs: 60_000, fn, name: 'failing', log, runOnStart: true });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(errors).toHaveLength(1);
    stop();
  });

  it('stop() prevents further ticks', () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const stop = scheduleEvery({
      intervalMs: 1, // tiny
      fn,
      name: 'test',
      log: noopLog,
      runOnStart: false,
    });
    stop();
    // Even after a few microtasks, no invocations.
    expect(fn).not.toHaveBeenCalled();
  });
});
