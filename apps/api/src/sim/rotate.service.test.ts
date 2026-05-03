import { describe, expect, it } from 'vitest';
import { createRotateService, ROTATE_DEFAULTS, type RotateRepo } from './rotate.service.js';

interface Calls {
  log: number[];
  tx: number[];
  contests: number[];
  vacuum: string[][];
}

function makeFakeRepo(returns: { log: number; tx: number; contests: number }): RotateRepo & {
  calls: Calls;
} {
  const calls: Calls = { log: [], tx: [], contests: [], vacuum: [] };
  return {
    calls,
    async trimSyntheticActionsLog(ms) {
      calls.log.push(ms);
      return returns.log;
    },
    async trimSyntheticTransactions(ms) {
      calls.tx.push(ms);
      return returns.tx;
    },
    async trimFinalizedContests(ms) {
      calls.contests.push(ms);
      return returns.contests;
    },
    async vacuum(tables) {
      calls.vacuum.push([...tables]);
    },
  };
}

describe('rotateService', () => {
  it('uses defaults when no overrides passed', async () => {
    const repo = makeFakeRepo({ log: 10, tx: 5, contests: 1 });
    const svc = createRotateService({ repo });
    const r = await svc.runOnce();
    expect(r).toEqual({
      deletedLogRows: 10,
      deletedTransactions: 5,
      deletedContests: 1,
    });
    expect(repo.calls.log).toEqual([ROTATE_DEFAULTS.logRetentionMs]);
    expect(repo.calls.tx).toEqual([ROTATE_DEFAULTS.txRetentionMs]);
    expect(repo.calls.contests).toEqual([ROTATE_DEFAULTS.contestRetentionMs]);
  });

  it('overrides individual retention windows', async () => {
    const repo = makeFakeRepo({ log: 0, tx: 0, contests: 0 });
    const svc = createRotateService({ repo });
    await svc.runOnce({ logRetentionMs: 60_000 });
    expect(repo.calls.log).toEqual([60_000]);
    expect(repo.calls.tx).toEqual([ROTATE_DEFAULTS.txRetentionMs]);
  });

  it('skips VACUUM when nothing was deleted', async () => {
    const repo = makeFakeRepo({ log: 0, tx: 0, contests: 0 });
    const svc = createRotateService({ repo });
    await svc.runOnce();
    expect(repo.calls.vacuum).toEqual([]);
  });

  it('runs VACUUM on touched tables when deletions happened', async () => {
    const repo = makeFakeRepo({ log: 1, tx: 0, contests: 0 });
    const svc = createRotateService({ repo });
    await svc.runOnce();
    expect(repo.calls.vacuum).toHaveLength(1);
    expect(repo.calls.vacuum[0]).toEqual([
      'synthetic_actions_log',
      'transactions',
      'entries',
      'price_snapshots',
      'contests',
    ]);
  });
});
