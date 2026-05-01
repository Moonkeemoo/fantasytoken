import type { CurrencyService } from '../modules/currency/currency.service.js';
import type { EntriesService } from '../modules/entries/entries.service.js';
import type { Logger } from '../logger.js';
import type { SimLogger } from './log.js';
import type { TickRepo } from './tick.repo.js';
import { joinContest } from './actions/join_contest.js';
import { login } from './actions/login.js';
import { idle } from './actions/idle.js';
import { inviteFriend } from './actions/invite_friend.js';
import { density } from './pacing.js';
import { SIM_CONFIG } from './sim.config.js';
import type { SeedRepo } from './seed.service.js';

/**
 * The heart of TZ-005 M3 — drives every synthetic forward by one tick.
 *
 * Design:
 *   • One pass over all synthetics per tick (default cadence: 60s).
 *   • All pre-fetches batched (entered pairs, last-topup-at, token pool)
 *     so the per-synth inner loop is in-memory. ~1000 synths × 60s tick
 *     is ~16 ops/s; well within Postgres + entriesService capacity.
 *   • Hard caps on per-tick join attempts and invites prevent a config
 *     bug from melting the API.
 *   • INV-7: every action is wrapped — failures degrade to log rows
 *     with `outcome='error'`; the loop never throws.
 */

export interface TickStats {
  syntheticsScanned: number;
  loginsLogged: number;
  idlesLogged: number;
  joinsAttempted: number;
  joinsSucceeded: number;
  topUpsGranted: number;
  invitesCreated: number;
  durationMs: number;
}

export interface TickServiceDeps {
  repo: TickRepo;
  seedRepo: SeedRepo;
  entries: EntriesService;
  currency: CurrencyService;
  signupBonuses: {
    preCreateSignupBonuses(args: { refereeUserId: string; recruiterUserId: string }): Promise<void>;
  };
  log: SimLogger;
  serverLog: Logger;
  /** Override SIM_CONFIG (testing). */
  config?: typeof SIM_CONFIG;
  /** Source of randomness. Defaults to Math.random. */
  random?: () => number;
  /** Defaults to () => new Date(). Tests pin the wall clock. */
  now?: () => Date;
}

export interface TickService {
  tick(): Promise<TickStats>;
}

const LOGIN_LOG_SAMPLE = 0.1; // log 1 in 10 logins
const IDLE_LOG_SAMPLE = 0.01; // log 1 in 100 idles

export function createTickService(deps: TickServiceDeps): TickService {
  const config = deps.config ?? SIM_CONFIG;
  const random = deps.random ?? Math.random;
  const now = deps.now ?? (() => new Date());

  return {
    async tick() {
      const t0 = Date.now();
      const stats: TickStats = {
        syntheticsScanned: 0,
        loginsLogged: 0,
        idlesLogged: 0,
        joinsAttempted: 0,
        joinsSucceeded: 0,
        topUpsGranted: 0,
        invitesCreated: 0,
        durationMs: 0,
      };

      const synths = await deps.repo.listSynthetics();
      stats.syntheticsScanned = synths.length;
      if (synths.length === 0) {
        stats.durationMs = Date.now() - t0;
        return stats;
      }

      const openContests = await deps.repo.listOpenContests();
      const pool = openContests.length > 0 ? await deps.repo.loadTokenPool() : [];
      const synthIds = synths.map((s) => s.id);
      const contestIds = openContests.map((c) => c.id);
      const entered =
        contestIds.length > 0
          ? await deps.repo.loadEnteredPairs(synthIds, contestIds)
          : new Set<string>();
      const balancesByUser = await deps.repo.loadBalancesByUser(synthIds);
      const tickClock = now();
      const hour = tickClock.getUTCHours();

      // Per-tick budgets — wider than typical demand so they only kick in
      // when something's gone wrong (config tweak, runaway loop, etc.).
      let joinsLeft = config.perTickJoinAttemptsCap;
      let invitesLeft = config.perTickInviteAttemptsCap;

      for (const synth of synths) {
        const persona = config.personas[synth.personaKind];
        // alwaysOnline=true bypasses the time-of-day curve so a small
        // cohort produces visible activity all day.
        const loggedIn = config.alwaysOnline
          ? true
          : random() < persona.loginProbabilityByHour[hour]!;

        if (!loggedIn) {
          if (random() < IDLE_LOG_SAMPLE) {
            await safeAction(deps.serverLog, 'idle.log', () =>
              idle({ log: deps.log }, { userId: synth.id, hour }),
            );
            stats.idlesLogged += 1;
          }
          continue;
        }

        // Logged in. Sample-log for peak-hour analysis.
        if (random() < LOGIN_LOG_SAMPLE) {
          await safeAction(deps.serverLog, 'login.log', () =>
            login({ log: deps.log }, { userId: synth.id, hour }),
          );
          stats.loginsLogged += 1;
        }

        let balance = balancesByUser.get(synth.id) ?? 0n;

        // 1) Per-tick: try to enter EVERY contest the synth can afford AND
        //    is rank-eligible for, that they're not already in. "Max
        //    connect" mode (TZ-005 amended 2026-05-01) — real-active-player
        //    simulation. Pre-filter eliminates noise:
        //      - rank-gated contests (minRank > synth.currentRank): a
        //        rank-1 synth shouldn't waste dice on a tier-2 contest
        //        (real lobby UI hides those, mirror the same logic).
        //      - already-entered contests.
        //      - unaffordable contests (separate signal — `cannot_afford`).
        //    Balance is drained locally so a 20-coin synth doesn't
        //    "double-spend" within one tick.
        const eligible = openContests.filter(
          (c) => !entered.has(`${synth.id}|${c.id}`) && c.minRank <= synth.currentRank,
        );
        const affordableUnentered = eligible.filter((c) => c.entryFeeCents <= balance);
        const unaffordableUnentered = eligible.filter((c) => c.entryFeeCents > balance);

        for (const c of affordableUnentered) {
          if (joinsLeft <= 0) break;
          if (c.entryFeeCents > balance) continue; // local balance drain
          const isFree = c.entryFeeCents === 0n;
          const baseRate = isFree ? persona.joinFreeRate : persona.joinPaidRate;
          if (baseRate <= 0) continue;
          const window = c.startsAt.getTime() - c.createdAt.getTime();
          const elapsed = tickClock.getTime() - c.createdAt.getTime();
          const t = window > 0 ? elapsed / window : 0.5;
          const p = baseRate * density(SIM_CONFIG.joinPacingShape, t);
          if (random() >= p) continue;

          joinsLeft -= 1;
          stats.joinsAttempted += 1;
          const r = await joinContest(
            { entries: deps.entries, currency: deps.currency, log: deps.log },
            {
              syntheticUser: { id: synth.id, syntheticSeed: synth.syntheticSeed },
              contest: { id: c.id, entryFeeCents: c.entryFeeCents },
              pool,
              bias: persona.tokenBias,
              size: pickSize(persona.lineupSize, random),
            },
          );
          if (r.kind === 'success') {
            stats.joinsSucceeded += 1;
            entered.add(`${synth.id}|${c.id}`);
            balance -= c.entryFeeCents; // local drain — next contest in this tick must also fit
          }
        }

        // No affordable un-entered left, but unaffordable still exist →
        // synth is "drained" relative to the current contest set. Logged
        // once per synth per tick (not per contest) so the polish loop can
        // chart "when did persona X get stuck" without log spam.
        if (affordableUnentered.length === 0 && unaffordableUnentered.length > 0) {
          const minFee = unaffordableUnentered.reduce(
            (acc, c) => (c.entryFeeCents < acc ? c.entryFeeCents : acc),
            unaffordableUnentered[0]!.entryFeeCents,
          );
          await safeAction(deps.serverLog, 'cannot_afford.log', () =>
            deps.log.log({
              userId: synth.id,
              action: 'cannot_afford',
              outcome: 'skipped',
              payload: {
                balanceCoins: Number(balance),
                minFeeCoins: Number(minFee),
                openContestCount: openContests.length,
              },
              balanceAfterCents: balance,
            }),
          );
        }

        // 2) Invite friend — rarest action, gated by persona referralRate.
        // (Top-up removed 2026-05-01 — synthetics never DEV_GRANT after
        // their initial welcome bonus. Closed-loop economy: only
        // contest wins or referral bonuses bring in new coins.)
        if (invitesLeft > 0 && persona.referralRate > 0 && random() < persona.referralRate) {
          invitesLeft -= 1;
          // Mask to signed-int31 range. `users.synthetic_seed` is a 32-bit
          // signed integer; uint32 values from the mulberry32 stream
          // exceed 2^31 about half the time and Postgres rejects them
          // ("value … is out of range for type integer"). 0x7fffffff
          // keeps every seed in [0, 2^31-1]. Migration to bigint is the
          // cleaner long-term fix — flagged for later.
          const childSeed = (Math.floor(random() * 0xffffffff) ^ Date.now()) & 0x7fffffff;
          const r = await inviteFriend(
            {
              seedRepo: deps.seedRepo,
              currency: deps.currency,
              signupBonuses: deps.signupBonuses,
              log: deps.log,
              config,
              random,
            },
            {
              inviter: { id: synth.id, personaKind: synth.personaKind },
              childSeed,
            },
          );
          if (r.kind === 'success') stats.invitesCreated += 1;
        }
      }

      stats.durationMs = Date.now() - t0;
      return stats;
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

// pickContestToJoin was the "first-hit" picker; replaced by inline loop
// in the per-synth body so we can attempt multiple affordable contests
// per tick (max-connect mode). Kept the function shape removed rather
// than dead-code so the next reader doesn't wonder which is canonical.

function pickSize(range: { min: number; max: number }, rand: () => number): number {
  const span = range.max - range.min + 1;
  return range.min + Math.floor(rand() * span);
}

async function safeAction(log: Logger, name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    // INV-7: log writer failure is best-effort; surface but don't bubble.
    log.warn({ err, name }, 'sim.tick action failed');
  }
}
