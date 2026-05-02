import type { CurrencyService } from '../modules/currency/currency.service.js';
import type { EntriesService } from '../modules/entries/entries.service.js';
import type { Logger } from '../logger.js';
import type { SimLogger } from './log.js';
import type { TickRepo } from './tick.repo.js';
import { joinContest } from './actions/join_contest.js';
import { login } from './actions/login.js';
import { idle } from './actions/idle.js';
import { applyFaucet } from './actions/faucet.js';
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
  faucetTopUps: number;
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
        faucetTopUps: 0,
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
      // Faucet pre-fetch — used inside the loop to decide if a drained
      // synth deserves a liveness top-up. Skipped entirely if disabled
      // by config (no DB hit).
      const faucetByUser = config.faucetEnabled
        ? await deps.repo.loadFaucetState(synthIds, config.faucetLookbackMinutes)
        : new Map<string, { recentCantAffordCount: number; lastFaucetAt: Date | null }>();
      const tickClock = now();
      const hour = tickClock.getUTCHours();
      const faucetCooldownMs = config.faucetCooldownMinutes * 60_000;

      // Per-tick budgets — wider than typical demand so they only kick in
      // when something's gone wrong (config tweak, runaway loop, etc.).
      let joinsLeft = config.perTickJoinAttemptsCap;

      for (const synth of synths) {
        const persona = config.personas[synth.personaKind];
        // Per-synth fairness budget — prevents the most-active personas
        // (inviter at 1806/2408) from monopolising the global cap and
        // starving quieter personas (whale, lurker, casual). Each synth
        // gets at most N join-attempts per tick regardless of how many
        // contests they're eligible for.
        let perSynthJoinsLeft = config.perSynthJoinAttemptsPerTick;
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

        // 0) Liveness faucet — runs BEFORE the join loop so a refilled
        // synth can immediately spend the new coins this tick. Strict
        // gates: only synths that are demonstrably stuck (multiple
        // recent cannot_afford events) AND truly empty (balance=0)
        // AND past cooldown get a top-up.
        if (config.faucetEnabled && balance === 0n) {
          const fs = faucetByUser.get(synth.id);
          const cantAffordHits = fs?.recentCantAffordCount ?? 0;
          const cooldownExpired =
            !fs?.lastFaucetAt ||
            tickClock.getTime() - fs.lastFaucetAt.getTime() >= faucetCooldownMs;
          if (cantAffordHits >= config.faucetMinCantAffordEvents && cooldownExpired) {
            const r = await applyFaucet(
              { currency: deps.currency, log: deps.log },
              { userId: synth.id, amountCoins: config.faucetTopUpCoins },
            );
            if (r.kind === 'success') {
              balance = r.newBalance ?? BigInt(config.faucetTopUpCoins);
              stats.faucetTopUps += 1;
            }
          }
        }

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
          if (perSynthJoinsLeft <= 0) break;
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
          perSynthJoinsLeft -= 1;
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

        // Synth-driven invites permanently disabled (owner directive
        // 2026-05-01). Existing referral edges keep working — RECRUITER /
        // REFEREE signup bonuses still unlock on first finalized contest
        // via referrals.service.maybeUnlockSignupBonuses — but no new
        // synth→synth invites are created. The `invite_friend` action
        // file is preserved for admin/CLI use; only the per-tick dispatch
        // here is retired. `stats.invitesCreated` stays in shape but is
        // always 0; `seedRepo` / `signupBonuses` deps are unused here now.
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
