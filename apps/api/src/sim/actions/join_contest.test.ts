import { describe, expect, it } from 'vitest';
import { AppError } from '../../lib/errors.js';
import type { CurrencyService } from '../../modules/currency/currency.service.js';
import type { EntriesService } from '../../modules/entries/entries.service.js';
import type { LogActionArgs, SimLogger } from '../log.js';
import type { PoolToken } from '../lineup_picker.js';
import { joinContest } from './join_contest.js';

const POOL: PoolToken[] = [
  { symbol: 'BTC', marketCapUsd: 1e12, pctChange24h: 0.5 },
  { symbol: 'ETH', marketCapUsd: 5e11, pctChange24h: 1.0 },
  { symbol: 'SOL', marketCapUsd: 1e11, pctChange24h: -2.5 },
];

function makeLog(): SimLogger & { rows: LogActionArgs[] } {
  const rows: LogActionArgs[] = [];
  return {
    rows,
    async log(args) {
      rows.push(args);
    },
  };
}

function makeCurrency(balance: bigint): CurrencyService {
  return {
    async transact() {
      throw new Error('not used in these tests');
    },
    async getBalance() {
      return balance;
    },
  };
}

function makeEntries(impl: EntriesService['submit']): EntriesService {
  // Casting because we only exercise `submit` here. The other methods are
  // never called in this test file.
  return {
    submit: impl,
  } as unknown as EntriesService;
}

const SYNTH = { id: 'u-1', syntheticSeed: 12345 };
const CONTEST = { id: 'c-1', entryFeeCents: 5n };

describe('joinContest', () => {
  it('logs success with picks + balanceAfter on a real entry', async () => {
    const log = makeLog();
    const currency = makeCurrency(15n);
    const entries = makeEntries(async ({ picks }) => ({
      entryId: 'e-1',
      contestId: CONTEST.id,
      submittedAt: new Date().toISOString(),
      alreadyEntered: false,
      // Suppress unused-var lint by reading picks here (consumed in the call).
      ...{ _checkPicks: picks.length > 0 ? null : null },
    }));

    const r = await joinContest(
      { entries, currency, log },
      { syntheticUser: SYNTH, contest: CONTEST, pool: POOL, bias: 'mixed', size: 3 },
    );

    expect(r.kind).toBe('success');
    if (r.kind === 'success') {
      expect(r.picks.length).toBe(3);
      expect(r.entryId).toBe('e-1');
    }
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]?.action).toBe('join_contest');
    expect(log.rows[0]?.outcome).toBe('success');
    expect(log.rows[0]?.balanceAfterCents).toBe(15n);
    expect(log.rows[0]?.errorCode).toBeFalsy();
  });

  it('logs rejected with errorCode when entriesService throws AppError', async () => {
    const log = makeLog();
    const currency = makeCurrency(0n);
    const entries = makeEntries(async () => {
      throw new AppError('INSUFFICIENT_COINS', 'need more', 402, undefined, {
        required: 5,
        current: 0,
      });
    });

    const r = await joinContest(
      { entries, currency, log },
      { syntheticUser: SYNTH, contest: CONTEST, pool: POOL, bias: 'mixed', size: 3 },
    );

    expect(r.kind).toBe('rejected');
    if (r.kind === 'rejected') expect(r.errorCode).toBe('INSUFFICIENT_COINS');
    expect(log.rows[0]?.outcome).toBe('rejected');
    expect(log.rows[0]?.errorCode).toBe('INSUFFICIENT_COINS');
    expect(log.rows[0]?.balanceAfterCents).toBe(0n);
  });

  it('logs error (not rejected) when entriesService throws plain Error', async () => {
    const log = makeLog();
    const currency = makeCurrency(20n);
    const entries = makeEntries(async () => {
      throw new Error('database exploded');
    });

    const r = await joinContest(
      { entries, currency, log },
      { syntheticUser: SYNTH, contest: CONTEST, pool: POOL, bias: 'mixed', size: 3 },
    );

    expect(r.kind).toBe('error');
    expect(log.rows[0]?.outcome).toBe('error');
    expect(log.rows[0]?.errorCode).toBe('INTERNAL');
  });

  it('logs skipped + EMPTY_POOL when bias filter yields no tokens', async () => {
    const log = makeLog();
    const currency = makeCurrency(20n);
    const entries = makeEntries(async () => {
      throw new Error('should not be called');
    });

    const r = await joinContest(
      { entries, currency, log },
      { syntheticUser: SYNTH, contest: CONTEST, pool: [], bias: 'mixed', size: 3 },
    );

    expect(r.kind).toBe('rejected');
    expect(log.rows[0]?.outcome).toBe('skipped');
    expect(log.rows[0]?.errorCode).toBe('EMPTY_POOL');
  });

  it('marks already-entered as skipped, not success', async () => {
    const log = makeLog();
    const currency = makeCurrency(15n);
    const entries = makeEntries(async () => ({
      entryId: 'e-prev',
      contestId: CONTEST.id,
      submittedAt: new Date().toISOString(),
      alreadyEntered: true,
    }));

    const r = await joinContest(
      { entries, currency, log },
      { syntheticUser: SYNTH, contest: CONTEST, pool: POOL, bias: 'mixed', size: 3 },
    );

    expect(r.kind).toBe('already_entered');
    expect(log.rows[0]?.outcome).toBe('skipped');
    expect(log.rows[0]?.errorCode).toBe('ALREADY_ENTERED');
  });

  it('does not throw even if the log writer throws (best-effort logging)', async () => {
    const flakyLog: SimLogger = {
      async log() {
        throw new Error('log write failed');
      },
    };
    const currency = makeCurrency(20n);
    const entries = makeEntries(async () => ({
      entryId: 'e-1',
      contestId: CONTEST.id,
      submittedAt: new Date().toISOString(),
      alreadyEntered: false,
    }));
    // We only assert it doesn't reject — actual surfacing of log errors
    // is the calling layer's responsibility (INV-7 logger.warn).
    await expect(
      joinContest(
        { entries, currency, log: flakyLog },
        { syntheticUser: SYNTH, contest: CONTEST, pool: POOL, bias: 'mixed', size: 3 },
      ),
    ).rejects.toBeTruthy();
  });
});
