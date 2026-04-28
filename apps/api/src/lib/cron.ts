import type { Logger } from '../logger.js';

export interface ScheduleEveryArgs {
  intervalMs: number;
  fn: () => Promise<void>;
  name: string;
  log: Logger;
  /** Run immediately on schedule, then every intervalMs. Default false. */
  runOnStart?: boolean;
}

/**
 * Lightweight scheduler with drift control via setTimeout chaining.
 *
 * INV-7: errors thrown inside `fn` are caught and logged; the loop survives.
 * The DB is the source of truth for what state to act on (cron is idempotent).
 */
export function scheduleEvery(args: ScheduleEveryArgs): () => void {
  const { intervalMs, fn, name, log, runOnStart = false } = args;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      await fn();
    } catch (err) {
      log.error({ err, name }, 'cron tick failed');
    }
    if (!stopped) {
      timer = setTimeout(() => {
        void tick();
      }, intervalMs);
    }
  };

  if (runOnStart) {
    void tick();
  } else {
    timer = setTimeout(() => {
      void tick();
    }, intervalMs);
  }

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
