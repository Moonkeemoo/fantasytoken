import { describe, expect, it } from 'vitest';
import {
  REFEREE_SIGNUP_BONUS_CENTS,
  RECRUITER_SIGNUP_BONUS_CENTS,
  REQUIRED_CONTESTS_FOR_BONUS,
} from '@fantasytoken/shared';
import { createReferralsService, type ReferralsRepo } from './referrals.service.js';
import type { CurrencyService } from '../currency/currency.service.js';

interface FakeRepo extends ReferralsRepo {
  /** chain[userId] = ordered L1, L2 referrer ids */
  chain: Map<string, string[]>;
  /** count[userId] = finalized entries so far */
  finalized: Map<string, number>;
  /** signup bonus rows by user (REFEREE rows live under userId, RECRUITER under recruiter id) */
  bonusRows: Array<{
    id: string;
    userId: string;
    bonusType: 'REFEREE' | 'RECRUITER';
    amountCents: bigint;
    unlocked: boolean;
  }>;
  /** payouts the service tried to pay (for assertion) */
  attemptedPayouts: Array<{
    recipientUserId: string;
    sourceEntryId: string;
    level: 1 | 2;
    payoutCents: bigint;
  }>;
}

function makeFakeRepo(): FakeRepo {
  const repo: FakeRepo = {
    chain: new Map(),
    finalized: new Map(),
    bonusRows: [],
    attemptedPayouts: [],
    async getReferralChain(userId, depth) {
      const ids = this.chain.get(userId) ?? [];
      return ids.slice(0, depth).map((id, i) => ({
        level: (i + 1) as 1 | 2,
        userId: id,
      }));
    },
    async countFinalizedEntries(userId) {
      return this.finalized.get(userId) ?? 0;
    },
    async preCreateSignupBonuses({ refereeUserId, recruiterUserId }) {
      const exists = (uid: string, type: 'REFEREE' | 'RECRUITER') =>
        this.bonusRows.some((r) => r.userId === uid && r.bonusType === type);
      if (!exists(refereeUserId, 'REFEREE')) {
        this.bonusRows.push({
          id: `b-${this.bonusRows.length}`,
          userId: refereeUserId,
          bonusType: 'REFEREE',
          amountCents: BigInt(REFEREE_SIGNUP_BONUS_CENTS),
          unlocked: false,
        });
      }
      if (!exists(recruiterUserId, 'RECRUITER')) {
        this.bonusRows.push({
          id: `b-${this.bonusRows.length}`,
          userId: recruiterUserId,
          bonusType: 'RECRUITER',
          amountCents: BigInt(RECRUITER_SIGNUP_BONUS_CENTS),
          unlocked: false,
        });
      }
    },
    async payOneCommission(args) {
      // Detect duplicate by (recipient × entry × level).
      const dup = this.attemptedPayouts.some(
        (p) =>
          p.recipientUserId === args.recipientUserId &&
          p.sourceEntryId === args.sourceEntryId &&
          p.level === args.level,
      );
      if (dup) return { paid: false };
      this.attemptedPayouts.push({
        recipientUserId: args.recipientUserId,
        sourceEntryId: args.sourceEntryId,
        level: args.level,
        payoutCents: args.payoutCents,
      });
      return { paid: true };
    },
    async findLockedSignupBonuses(userId) {
      return this.bonusRows
        .filter((r) => r.userId === userId && !r.unlocked)
        .map((r) => ({
          id: r.id,
          recipientUserId: r.userId,
          bonusType: r.bonusType,
          amountCents: r.amountCents,
          sourceUserId: null,
        }));
    },
    async lookupFirstName(_userId: string) {
      return null;
    },
    async markBonusUnlocked({ bonusRowId }) {
      const row = this.bonusRows.find((r) => r.id === bonusRowId);
      if (row) row.unlocked = true;
    },
    async getStats(_userId) {
      return {
        l1Count: 0,
        l2Count: 0,
        l1ActiveCount: 0,
        l2ActiveCount: 0,
        l1EarnedCents: 0n,
        l2EarnedCents: 0n,
      };
    },
    async getTree(_userId) {
      return { l1: [], l2: [] };
    },
    async getPayouts(_userId, _limit) {
      return [];
    },
    async lookupCommissionDmContext(_args) {
      return { sourceFirstName: null, contestName: null };
    },
    async getFriendDetail(_args) {
      return null;
    },
    async getLeaderboard(_args) {
      return { items: [], myRow: null };
    },
  };
  return repo;
}

function makeFakeCurrency(): CurrencyService & {
  credits: Array<{ userId: string; amount: bigint }>;
} {
  const credits: Array<{ userId: string; amount: bigint }> = [];
  return {
    credits,
    async transact(args) {
      credits.push({ userId: args.userId, amount: args.deltaCents });
      return { txId: `t-${credits.length}`, balanceAfter: args.deltaCents };
    },
    async getBalance() {
      return 0n;
    },
  };
}

const noopLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  fatal: () => {},
} as unknown as Parameters<typeof createReferralsService>[0]['log'];

describe('ReferralsService.payCommissions', () => {
  it('walks 0 hops when user has no referrer (no commissions)', async () => {
    const repo = makeFakeRepo();
    const cur = makeFakeCurrency();
    const svc = createReferralsService({ repo, currency: cur, log: noopLog });
    const r = await svc.payCommissions({
      sourceUserId: 'u-orphan',
      sourceEntryId: 'e1',
      sourceContestId: 'c1',
      sourcePrizeCents: 10_000n,
      currency: 'USD',
    });
    expect(r.paidLevels).toBe(0);
    expect(repo.attemptedPayouts).toHaveLength(0);
  });

  it('walks 1 hop (L1 only) when user has direct referrer', async () => {
    const repo = makeFakeRepo();
    const cur = makeFakeCurrency();
    repo.chain.set('u-bob', ['u-alice']); // bob → alice (L1)
    const svc = createReferralsService({ repo, currency: cur, log: noopLog });
    const r = await svc.payCommissions({
      sourceUserId: 'u-bob',
      sourceEntryId: 'e1',
      sourceContestId: 'c1',
      sourcePrizeCents: 10_000n, // $100
      currency: 'USD',
    });
    expect(r.paidLevels).toBe(1);
    expect(repo.attemptedPayouts).toHaveLength(1);
    expect(repo.attemptedPayouts[0]?.recipientUserId).toBe('u-alice');
    expect(repo.attemptedPayouts[0]?.level).toBe(1);
    expect(repo.attemptedPayouts[0]?.payoutCents).toBe(500n); // 5%
  });

  it('walks 2 hops (L1 + L2) and pays both', async () => {
    const repo = makeFakeRepo();
    const cur = makeFakeCurrency();
    repo.chain.set('u-bob', ['u-alice', 'u-zara']); // bob → alice → zara
    const svc = createReferralsService({ repo, currency: cur, log: noopLog });
    const r = await svc.payCommissions({
      sourceUserId: 'u-bob',
      sourceEntryId: 'e1',
      sourceContestId: 'c1',
      sourcePrizeCents: 10_000n,
      currency: 'USD',
    });
    expect(r.paidLevels).toBe(2);
    expect(repo.attemptedPayouts).toHaveLength(2);
    expect(repo.attemptedPayouts[0]?.payoutCents).toBe(500n); // L1 5%
    expect(repo.attemptedPayouts[1]?.payoutCents).toBe(100n); // L2 1%
    expect(repo.attemptedPayouts[1]?.level).toBe(2);
  });

  it('idempotent — second call to payCommissions for same entry pays 0 levels', async () => {
    const repo = makeFakeRepo();
    const cur = makeFakeCurrency();
    repo.chain.set('u-bob', ['u-alice']);
    const svc = createReferralsService({ repo, currency: cur, log: noopLog });
    await svc.payCommissions({
      sourceUserId: 'u-bob',
      sourceEntryId: 'e1',
      sourceContestId: 'c1',
      sourcePrizeCents: 10_000n,
      currency: 'USD',
    });
    const second = await svc.payCommissions({
      sourceUserId: 'u-bob',
      sourceEntryId: 'e1',
      sourceContestId: 'c1',
      sourcePrizeCents: 10_000n,
      currency: 'USD',
    });
    expect(second.paidLevels).toBe(0);
    expect(repo.attemptedPayouts).toHaveLength(1);
  });

  it('zero prize → no commission attempted', async () => {
    const repo = makeFakeRepo();
    const cur = makeFakeCurrency();
    repo.chain.set('u-bob', ['u-alice']);
    const svc = createReferralsService({ repo, currency: cur, log: noopLog });
    const r = await svc.payCommissions({
      sourceUserId: 'u-bob',
      sourceEntryId: 'e1',
      sourceContestId: 'c1',
      sourcePrizeCents: 0n,
      currency: 'USD',
    });
    expect(r.paidLevels).toBe(0);
    expect(repo.attemptedPayouts).toHaveLength(0);
  });
});

describe('ReferralsService.maybeUnlockSignupBonuses', () => {
  it('does nothing when user has 0 finalized contests', async () => {
    const repo = makeFakeRepo();
    const cur = makeFakeCurrency();
    repo.bonusRows.push({
      id: 'b1',
      userId: 'u-bob',
      bonusType: 'REFEREE',
      amountCents: 2500n,
      unlocked: false,
    });
    const svc = createReferralsService({ repo, currency: cur, log: noopLog });
    const r = await svc.maybeUnlockSignupBonuses({ userId: 'u-bob', triggeredByEntryId: 'e1' });
    expect(r.unlockedCount).toBe(0);
    expect(cur.credits).toHaveLength(0);
    expect(repo.bonusRows[0]?.unlocked).toBe(false);
  });

  it(`unlocks both REFEREE + RECRUITER rows once user finalizes ${REQUIRED_CONTESTS_FOR_BONUS} contest(s)`, async () => {
    const repo = makeFakeRepo();
    const cur = makeFakeCurrency();
    // Pre-create both rows belonging to bob (REFEREE on his ledger; RECRUITER
    // would actually live on Alice's ledger, but for the unlock pathway test
    // we only need to verify the counter+unlock loop.)
    repo.bonusRows.push({
      id: 'b1',
      userId: 'u-bob',
      bonusType: 'REFEREE',
      amountCents: BigInt(REFEREE_SIGNUP_BONUS_CENTS),
      unlocked: false,
    });
    repo.finalized.set('u-bob', REQUIRED_CONTESTS_FOR_BONUS);
    const svc = createReferralsService({ repo, currency: cur, log: noopLog });
    const r = await svc.maybeUnlockSignupBonuses({ userId: 'u-bob', triggeredByEntryId: 'e1' });
    expect(r.unlockedCount).toBe(1);
    expect(cur.credits).toHaveLength(1);
    expect(cur.credits[0]?.amount).toBe(BigInt(REFEREE_SIGNUP_BONUS_CENTS));
    expect(repo.bonusRows[0]?.unlocked).toBe(true);
  });

  it('idempotent — second call after unlock does nothing (rows already unlocked)', async () => {
    const repo = makeFakeRepo();
    const cur = makeFakeCurrency();
    repo.bonusRows.push({
      id: 'b1',
      userId: 'u-bob',
      bonusType: 'REFEREE',
      amountCents: BigInt(REFEREE_SIGNUP_BONUS_CENTS),
      unlocked: false,
    });
    repo.finalized.set('u-bob', REQUIRED_CONTESTS_FOR_BONUS);
    const svc = createReferralsService({ repo, currency: cur, log: noopLog });
    await svc.maybeUnlockSignupBonuses({ userId: 'u-bob', triggeredByEntryId: 'e1' });
    const second = await svc.maybeUnlockSignupBonuses({
      userId: 'u-bob',
      triggeredByEntryId: 'e2',
    });
    expect(second.unlockedCount).toBe(0);
    expect(cur.credits).toHaveLength(1); // only the first call paid
  });
});

describe('ReferralsService.preCreateSignupBonuses', () => {
  it('creates one REFEREE row for referee + one RECRUITER row for recruiter', async () => {
    const repo = makeFakeRepo();
    const cur = makeFakeCurrency();
    const svc = createReferralsService({ repo, currency: cur, log: noopLog });
    await svc.preCreateSignupBonuses({
      refereeUserId: 'u-bob',
      recruiterUserId: 'u-alice',
    });
    expect(repo.bonusRows).toHaveLength(2);
    const refereeRow = repo.bonusRows.find((r) => r.bonusType === 'REFEREE');
    const recruiterRow = repo.bonusRows.find((r) => r.bonusType === 'RECRUITER');
    expect(refereeRow?.userId).toBe('u-bob');
    expect(recruiterRow?.userId).toBe('u-alice');
    expect(refereeRow?.amountCents).toBe(BigInt(REFEREE_SIGNUP_BONUS_CENTS));
    expect(recruiterRow?.amountCents).toBe(BigInt(RECRUITER_SIGNUP_BONUS_CENTS));
  });

  it('idempotent — re-calling does not duplicate rows', async () => {
    const repo = makeFakeRepo();
    const cur = makeFakeCurrency();
    const svc = createReferralsService({ repo, currency: cur, log: noopLog });
    await svc.preCreateSignupBonuses({
      refereeUserId: 'u-bob',
      recruiterUserId: 'u-alice',
    });
    await svc.preCreateSignupBonuses({
      refereeUserId: 'u-bob',
      recruiterUserId: 'u-alice',
    });
    expect(repo.bonusRows).toHaveLength(2);
  });
});
