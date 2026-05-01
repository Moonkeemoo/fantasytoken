import { describe, expect, it } from 'vitest';
import type { CurrencyService } from '../modules/currency/currency.service.js';
import type { EntriesService } from '../modules/entries/entries.service.js';
import type { Logger } from '../logger.js';
import type { LogActionArgs, SimLogger } from './log.js';
import type { SeedRepo } from './seed.service.js';
import { createTickService } from './tick.service.js';
import type { TickRepo } from './tick.repo.js';
import { SIM_CONFIG } from './sim.config.js';

function silent(): Logger {
  const noop = (): void => {};
  return {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    fatal: noop,
    trace: noop,
    child: () => silent(),
  } as unknown as Logger;
}

function makeRepo(opts: {
  synths?: Array<{ id: string; personaKind: string; syntheticSeed: number }>;
  contests?: Array<{ id: string; entryFeeCents: bigint; createdAt: Date; startsAt: Date }>;
  pool?: Array<{ symbol: string; marketCapUsd: number | null; pctChange24h: number | null }>;
  entered?: string[]; // "userId|contestId"
}): TickRepo {
  return {
    async listSynthetics() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (opts.synths ?? []) as any;
    },
    async listOpenContests() {
      return opts.contests ?? [];
    },
    async loadTokenPool() {
      return opts.pool ?? [];
    },
    async loadEnteredPairs() {
      return new Set(opts.entered ?? []);
    },
  };
}

function makeLog(): SimLogger & { rows: LogActionArgs[] } {
  const rows: LogActionArgs[] = [];
  return {
    rows,
    async log(args) {
      rows.push(args);
    },
  };
}

function makeCurrency(): CurrencyService {
  return {
    async transact() {
      return { txId: 'tx-1', balanceAfter: 100n };
    },
    async getBalance() {
      return 100n;
    },
  };
}

function makeEntries(): EntriesService {
  let counter = 0;
  return {
    submit: async (args: { contestId: string }) => ({
      entryId: `e-${++counter}`,
      contestId: args.contestId,
      submittedAt: new Date().toISOString(),
      alreadyEntered: false,
    }),
  } as unknown as EntriesService;
}

function makeSeedRepo(): SeedRepo {
  let counter = 0;
  return {
    async createSynthetic({ handle: _h }) {
      void _h;
      return { id: `child-${++counter}`, telegramId: -1_000_000 - counter };
    },
  };
}

const SIGNUP_BONUSES = {
  async preCreateSignupBonuses() {
    /* no-op */
  },
};

const POOL = [
  { symbol: 'BTC', marketCapUsd: 1e12, pctChange24h: 0.5 },
  { symbol: 'ETH', marketCapUsd: 5e11, pctChange24h: 1.0 },
  { symbol: 'SOL', marketCapUsd: 1e11, pctChange24h: -2.5 },
];

describe('tickService.tick', () => {
  it('returns zero stats and no actions when no synthetics exist', async () => {
    const log = makeLog();
    const svc = createTickService({
      repo: makeRepo({}),
      seedRepo: makeSeedRepo(),
      entries: makeEntries(),
      currency: makeCurrency(),
      signupBonuses: SIGNUP_BONUSES,
      log,
      serverLog: silent(),
    });
    const stats = await svc.tick();
    expect(stats.syntheticsScanned).toBe(0);
    expect(stats.joinsAttempted).toBe(0);
    expect(log.rows).toHaveLength(0);
  });

  it('skips loginless synths quietly (no idle log most of the time)', async () => {
    const log = makeLog();
    // Force loginProbability=0 by overriding config + random=1 so login fails.
    const config = structuredClone(SIM_CONFIG);
    for (const k of Object.keys(config.personas) as Array<keyof typeof config.personas>) {
      config.personas[k].loginProbabilityByHour = new Array(24).fill(0);
    }
    const svc = createTickService({
      repo: makeRepo({
        synths: [{ id: 'u1', personaKind: 'casual', syntheticSeed: 1 }],
      }),
      seedRepo: makeSeedRepo(),
      entries: makeEntries(),
      currency: makeCurrency(),
      signupBonuses: SIGNUP_BONUSES,
      log,
      serverLog: silent(),
      config,
      random: () => 0.5, // > IDLE_LOG_SAMPLE (0.01) — no idle log
    });
    const stats = await svc.tick();
    expect(stats.syntheticsScanned).toBe(1);
    expect(stats.loginsLogged).toBe(0);
    expect(stats.idlesLogged).toBe(0);
    expect(stats.joinsAttempted).toBe(0);
  });

  it('joins a free contest when persona rate × density(t) is high enough', async () => {
    const log = makeLog();
    const config = structuredClone(SIM_CONFIG);
    // Force-on: every hour 100% logged in, very high join rate.
    config.personas.casual.loginProbabilityByHour = new Array(24).fill(1);
    config.personas.casual.joinFreeRate = 1.0;
    const now = new Date('2026-05-01T12:00:00Z');
    const created = new Date(now.getTime() - 2 * 60 * 1000); // 2min ago
    const startsAt = new Date(now.getTime() + 8 * 60 * 1000); // 8min away

    const svc = createTickService({
      repo: makeRepo({
        synths: [{ id: 'u1', personaKind: 'casual', syntheticSeed: 1 }],
        contests: [{ id: 'c1', entryFeeCents: 0n, createdAt: created, startsAt }],
        pool: POOL,
      }),
      seedRepo: makeSeedRepo(),
      entries: makeEntries(),
      currency: makeCurrency(),
      signupBonuses: SIGNUP_BONUSES,
      log,
      serverLog: silent(),
      config,
      random: () => 0.05,
      now: () => now,
    });
    const stats = await svc.tick();
    expect(stats.joinsAttempted).toBe(1);
    expect(stats.joinsSucceeded).toBe(1);
    expect(log.rows.some((r) => r.action === 'join_contest' && r.outcome === 'success')).toBe(true);
  });

  it('respects perTickJoinAttemptsCap', async () => {
    const log = makeLog();
    const config = structuredClone(SIM_CONFIG);
    config.perTickJoinAttemptsCap = 2;
    config.personas.casual.loginProbabilityByHour = new Array(24).fill(1);
    config.personas.casual.joinFreeRate = 1.0;
    const synths = [
      { id: 'u1', personaKind: 'casual', syntheticSeed: 1 },
      { id: 'u2', personaKind: 'casual', syntheticSeed: 2 },
      { id: 'u3', personaKind: 'casual', syntheticSeed: 3 },
      { id: 'u4', personaKind: 'casual', syntheticSeed: 4 },
    ];
    const now = new Date('2026-05-01T12:00:00Z');
    const svc = createTickService({
      repo: makeRepo({
        synths,
        contests: [
          {
            id: 'c1',
            entryFeeCents: 0n,
            createdAt: new Date(now.getTime() - 60_000),
            startsAt: new Date(now.getTime() + 9 * 60 * 1000),
          },
        ],
        pool: POOL,
      }),
      seedRepo: makeSeedRepo(),
      entries: makeEntries(),
      currency: makeCurrency(),
      signupBonuses: SIGNUP_BONUSES,
      log,
      serverLog: silent(),
      config,
      random: () => 0.05,
      now: () => now,
    });
    const stats = await svc.tick();
    expect(stats.joinsAttempted).toBe(2);
  });

  it('top-up never fires (closed-loop economy — synthetics earn coins only via wins/referrals)', async () => {
    const log = makeLog();
    const config = structuredClone(SIM_CONFIG);
    config.personas.whale.loginProbabilityByHour = new Array(24).fill(1);
    config.personas.whale.joinFreeRate = 0;
    config.personas.whale.joinPaidRate = 0;
    config.personas.whale.referralRate = 0;
    const svc = createTickService({
      repo: makeRepo({
        synths: [{ id: 'u1', personaKind: 'whale', syntheticSeed: 1 }],
        contests: [],
      }),
      seedRepo: makeSeedRepo(),
      entries: makeEntries(),
      currency: makeCurrency(),
      signupBonuses: SIGNUP_BONUSES,
      log,
      serverLog: silent(),
      config,
      random: () => 0.05,
    });
    const stats = await svc.tick();
    expect(stats.topUpsGranted).toBe(0);
  });

  it('invite fires for inviter persona at high random gate', async () => {
    const log = makeLog();
    const config = structuredClone(SIM_CONFIG);
    config.personas.inviter.loginProbabilityByHour = new Array(24).fill(1);
    config.personas.inviter.joinFreeRate = 0;
    config.personas.inviter.joinPaidRate = 0;
    config.personas.inviter.referralRate = 1.0;

    const svc = createTickService({
      repo: makeRepo({
        synths: [{ id: 'u1', personaKind: 'inviter', syntheticSeed: 1 }],
      }),
      seedRepo: makeSeedRepo(),
      entries: makeEntries(),
      currency: makeCurrency(),
      signupBonuses: SIGNUP_BONUSES,
      log,
      serverLog: silent(),
      config,
      random: () => 0.5, // gates: login-log @ 0.10, idle @ 0.01, login itself irrelevant (1.0)
    });
    const stats = await svc.tick();
    expect(stats.invitesCreated).toBe(1);
  });
});
