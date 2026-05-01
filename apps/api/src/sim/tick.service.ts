import type { CurrencyService } from '../modules/currency/currency.service.js';
import type { EntriesService } from '../modules/entries/entries.service.js';
import type { Logger } from '../logger.js';
import type { SimLogger } from './log.js';
import type { TickOpenContest, TickRepo, TickSynthetic } from './tick.repo.js';
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
      const tickClock = now();
      const hour = tickClock.getUTCHours();

      // Per-tick budgets — wider than typical demand so they only kick in
      // when something's gone wrong (config tweak, runaway loop, etc.).
      let joinsLeft = config.perTickJoinAttemptsCap;
      let invitesLeft = config.perTickInviteAttemptsCap;

      for (const synth of synths) {
        const persona = config.personas[synth.personaKind];
        const loggedIn = random() < persona.loginProbabilityByHour[hour]!;

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

        // 1) Try to join one contest (whichever lottery hits first).
        if (joinsLeft > 0) {
          const target = pickContestToJoin(
            synth,
            openContests,
            entered,
            persona,
            random,
            tickClock,
          );
          if (target) {
            joinsLeft -= 1;
            stats.joinsAttempted += 1;
            const r = await joinContest(
              { entries: deps.entries, currency: deps.currency, log: deps.log },
              {
                syntheticUser: { id: synth.id, syntheticSeed: synth.syntheticSeed },
                contest: { id: target.id, entryFeeCents: target.entryFeeCents },
                pool,
                bias: persona.tokenBias,
                size: pickSize(persona.lineupSize, random),
              },
            );
            if (r.kind === 'success') {
              stats.joinsSucceeded += 1;
              entered.add(`${synth.id}|${target.id}`); // prevent re-pick this tick
            }
          }
        }

        // 2) Invite friend — rarest action, gated by persona referralRate.
        // (Top-up removed 2026-05-01 — synthetics never DEV_GRANT after
        // their initial welcome bonus. Closed-loop economy: only
        // contest wins or referral bonuses bring in new coins.)
        if (invitesLeft > 0 && persona.referralRate > 0 && random() < persona.referralRate) {
          invitesLeft -= 1;
          const childSeed = (Math.floor(random() * 0xffffffff) ^ Date.now()) >>> 0;
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

function pickContestToJoin(
  synth: TickSynthetic,
  openContests: readonly TickOpenContest[],
  entered: Set<string>,
  persona: { joinFreeRate: number; joinPaidRate: number },
  rand: () => number,
  now: Date,
): TickOpenContest | null {
  // Iterate open contests in DB order; first lottery hit wins. Order
  // doesn't matter much because the per-contest probability is bounded.
  for (const c of openContests) {
    if (entered.has(`${synth.id}|${c.id}`)) continue;
    const isFree = c.entryFeeCents === 0n;
    const baseRate = isFree ? persona.joinFreeRate : persona.joinPaidRate;
    if (baseRate <= 0) continue;
    const window = c.startsAt.getTime() - c.createdAt.getTime();
    const elapsed = now.getTime() - c.createdAt.getTime();
    const t = window > 0 ? elapsed / window : 0.5;
    const p = baseRate * density(SIM_CONFIG.joinPacingShape, t);
    if (rand() < p) return c;
  }
  return null;
}

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
