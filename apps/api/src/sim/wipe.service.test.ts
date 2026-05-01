import { describe, expect, it } from 'vitest';
import { createWipeService, type WipeRepo, type WipeResult } from './wipe.service.js';

function makeFakeRepo(initial: {
  users: number;
  transactions: number;
  entries: number;
  logRows: number;
}): WipeRepo & { wipeCalled: number } {
  const state = { ...initial };
  return {
    wipeCalled: 0,
    async countSynthetic() {
      return { ...state };
    },
    async wipe(): Promise<WipeResult> {
      this.wipeCalled += 1;
      const r: WipeResult = {
        deletedUsers: state.users,
        deletedTransactions: state.transactions,
        deletedEntries: state.entries,
        deletedLogRows: state.logRows,
        dryRun: false,
      };
      state.users = 0;
      state.transactions = 0;
      state.entries = 0;
      state.logRows = 0;
      return r;
    },
  };
}

describe('wipeService', () => {
  it('dry-run reports counts without invoking wipe', async () => {
    const repo = makeFakeRepo({ users: 12, transactions: 30, entries: 5, logRows: 100 });
    const svc = createWipeService({ repo });
    const r = await svc.wipe({ dryRun: true });
    expect(r).toEqual({
      deletedUsers: 12,
      deletedTransactions: 30,
      deletedEntries: 5,
      deletedLogRows: 100,
      dryRun: true,
    });
    expect(repo.wipeCalled).toBe(0);
  });

  it('non-dry-run delegates to repo.wipe and returns deletion counts', async () => {
    const repo = makeFakeRepo({ users: 7, transactions: 14, entries: 2, logRows: 50 });
    const svc = createWipeService({ repo });
    const r = await svc.wipe({ dryRun: false });
    expect(r.dryRun).toBe(false);
    expect(r.deletedUsers).toBe(7);
    expect(r.deletedTransactions).toBe(14);
    expect(repo.wipeCalled).toBe(1);
  });

  it('wipe followed by count returns zeroes (post-condition)', async () => {
    const repo = makeFakeRepo({ users: 3, transactions: 6, entries: 1, logRows: 20 });
    const svc = createWipeService({ repo });
    await svc.wipe({ dryRun: false });
    const after = await repo.countSynthetic();
    expect(after.users).toBe(0);
    expect(after.transactions).toBe(0);
    expect(after.entries).toBe(0);
    expect(after.logRows).toBe(0);
  });
});
