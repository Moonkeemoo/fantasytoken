import type { PersonaKind } from '@fantasytoken/shared';

/**
 * TZ-005 §9 — single tuning surface for synthetic users.
 *
 * All behavior knobs live here so the polish-loop agent (and you) can
 * diff before/after across runs without grepping the codebase. Every
 * field is plain data — no functions — so a future hot-reload from a
 * config_table is a one-day swap.
 *
 * Economy goal driving these defaults: a 1000-synth cohort over a 24h
 * window should produce ~30-50 entries per active scheduled contest,
 * with the persona mix biasing free/paid splits, lineup sizes, and
 * lineup contents in a way that surfaces obvious holes (e.g. a casual
 * burning through coins on day 1 means the welcome grant is too low).
 */

export type TokenBias = 'bluechip' | 'meme' | 'mixed' | 'volatile';
export type PacingShape = 'bell' | 'exponential' | 'uniform';

export interface PersonaConfig {
  /** Coins granted at seed time via DEV_GRANT (one-shot). */
  startingCoins: number;
  /** 24-element array — probability of being "logged in" at hour h (UTC).
   * Used by the tick worker to gate every other action behind a login
   * decision. Values are independent per hour. */
  loginProbabilityByHour: number[];
  /** Pick-count range for a fresh lineup. Inclusive on both ends. */
  lineupSize: { min: number; max: number };
  /** Token-pool filter applied before random pick. */
  tokenBias: TokenBias;
  /** Per-tick probability of joining one specific eligible scheduled
   * contest (already filtered by rank gate + not-yet-entered). Free vs
   * paid split lets us model whales paying eagerly while casuals stay
   * on practice tier. */
  joinFreeRate: number;
  joinPaidRate: number;
  /** When defined, persona occasionally tops up its balance via DEV_GRANT
   * (Stars purchase is v2). Amount is in coins; intervalDays gates frequency. */
  topUpBehavior: { intervalDays: number; amountCoins: number } | null;
  /** Per-tick probability of inviting a friend (creates a child synthetic,
   * sets referrer_user_id, pre-creates bonus rows). */
  referralRate: number;
}

export const SIM_CONFIG: {
  /** When true, the login-dice based on `loginProbabilityByHour` is
   * skipped — every synth is treated as logged-in every tick. Useful
   * for early debug + when the cohort is small enough that "natural"
   * day-night rhythms make activity invisible. Set to false to bring
   * back the realistic peak-hour curves. */
  alwaysOnline: boolean;
  /** Tick cadence in milliseconds. ~1 tick/min so a fresh contest fills
   * with 30-50 entries in 2-3 minutes (M2 acceptance). */
  tickIntervalMs: number;
  /** Pacing curve for join-contest decisions over the [contest.created →
   * contest.startsAt] window. Higher density mid-window approximates real
   * users discovering the contest after it's been listed for a while. */
  joinPacingShape: PacingShape;
  /** Cap on per-tick join attempts across the whole synthetic pool — a
   * config bug can't accidentally DDOS entriesService. */
  perTickJoinAttemptsCap: number;
  /** Cap on per-tick invite attempts across the whole synthetic pool. */
  perTickInviteAttemptsCap: number;
  /** Minimum time-between-actions per synthetic, in seconds. Prevents one
   * persona from spamming all actions in a single tick. */
  perSynthCooldownSeconds: number;
  distribution: Record<PersonaKind, number>;
  personas: Record<PersonaKind, PersonaConfig>;
} = {
  alwaysOnline: true,
  tickIntervalMs: 60_000,
  // 'uniform' = density(t)≡1 across the whole contest window. The bell
  // curve modelled "natural discovery" but starves freshly-spawned
  // contests (t≈0 → density≈0.12) — synths don't act for 5+ minutes
  // and the watch view stays empty. Switch back to 'bell' once we
  // have enough cohort + contest density that natural pacing is the
  // right model.
  joinPacingShape: 'uniform',
  perTickJoinAttemptsCap: 200,
  // Disabled 2026-05-01 — synth-to-synth referral chains were piling
  // up children faster than the cohort needed (each invite spawns a
  // new persona via inviteFriend → seedRepo). Setting the per-tick cap
  // to 0 short-circuits the branch in tick.service.ts without zeroing
  // every persona's referralRate, so the persona config remains
  // intact and we can flip this back to 20 once we want the chain.
  perTickInviteAttemptsCap: 0,
  perSynthCooldownSeconds: 60,

  distribution: {
    casual: 0.4,
    newbie: 0.2,
    streaker: 0.15,
    meme_chaser: 0.1,
    lurker: 0.08,
    inviter: 0.05,
    whale: 0.02,
  },

  personas: {
    // ALL personas start with WELCOME_BONUS_COINS=20 — synthetics simulate
    // brand-new players, no different from a real user landing for the
    // first time. Their economy is closed-loop after that: the only way
    // to gain coins is to win a contest or bring a referral. No top-ups
    // (TZ-005 §3 amended 2026-05-01: synths never DEV_GRANT after seed).
    casual: {
      startingCoins: 20,
      loginProbabilityByHour: hourCurve('peak-evening', 0.1, 0.3),
      lineupSize: { min: 3, max: 5 },
      tokenBias: 'mixed',
      joinFreeRate: 0.3,
      joinPaidRate: 0.1,
      topUpBehavior: null,
      referralRate: 0.001,
    },
    // Newbie: first-week shape, follows tutorials (5 picks by instinct),
    // bluechip-only.
    newbie: {
      startingCoins: 20,
      loginProbabilityByHour: hourCurve('scattered', 0.05, 0.25),
      lineupSize: { min: 5, max: 5 },
      tokenBias: 'bluechip',
      joinFreeRate: 0.35,
      joinPaidRate: 0.05,
      topUpBehavior: null,
      referralRate: 0.005,
    },
    // Streaker: daily login at consistent hour, rank-focused, balanced.
    streaker: {
      startingCoins: 20,
      loginProbabilityByHour: hourCurve('daily-burst', 0.05, 0.85),
      lineupSize: { min: 3, max: 5 },
      tokenBias: 'mixed',
      joinFreeRate: 0.5,
      joinPaidRate: 0.2,
      topUpBehavior: null,
      referralRate: 0.002,
    },
    // Meme chaser: late-night peaks, small lineups (1-2 tokens).
    meme_chaser: {
      startingCoins: 20,
      loginProbabilityByHour: hourCurve('peak-late-night', 0.05, 0.55),
      lineupSize: { min: 1, max: 2 },
      tokenBias: 'meme',
      joinFreeRate: 0.4,
      joinPaidRate: 0.25,
      topUpBehavior: null,
      referralRate: 0.002,
    },
    // Lurker: opens app rarely, observes leaderboards, almost never plays.
    lurker: {
      startingCoins: 20,
      loginProbabilityByHour: hourCurve('peak-evening', 0.02, 0.1),
      lineupSize: { min: 5, max: 5 },
      tokenBias: 'bluechip',
      joinFreeRate: 0.1,
      joinPaidRate: 0,
      topUpBehavior: null,
      referralRate: 0,
    },
    // Inviter: high referral rate; plays just enough to keep referees
    // active. Mid-day social peak.
    inviter: {
      startingCoins: 20,
      loginProbabilityByHour: hourCurve('peak-midday', 0.1, 0.5),
      lineupSize: { min: 3, max: 5 },
      tokenBias: 'mixed',
      joinFreeRate: 0.3,
      joinPaidRate: 0.1,
      topUpBehavior: null,
      referralRate: 0.05,
    },
    // Whale: high spend, joins paid contests aggressively, small conviction
    // lineups. Same starting balance — they earn their way up via wins,
    // not via being born rich.
    whale: {
      startingCoins: 20,
      loginProbabilityByHour: hourCurve('twin-peak', 0.1, 0.85),
      lineupSize: { min: 1, max: 2 },
      tokenBias: 'volatile',
      joinFreeRate: 0.2,
      joinPaidRate: 0.5,
      topUpBehavior: null,
      referralRate: 0.002,
    },
  },
};

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

type HourCurveShape =
  | 'peak-evening' // peak 19-22 UTC
  | 'peak-midday' // peak 12-15 UTC
  | 'peak-late-night' // peak 22-03 UTC
  | 'twin-peak' // peaks 09-11 + 19-22
  | 'scattered' // mostly flat with a small evening lift
  | 'daily-burst'; // single sharp spike at hour 20

function hourCurve(shape: HourCurveShape, baseline: number, peak: number): number[] {
  const arr = new Array<number>(24).fill(baseline);
  const setPeak = (hours: number[]): void => {
    for (const h of hours) arr[(h + 24) % 24] = peak;
  };
  const setShoulder = (hours: number[]): void => {
    for (const h of hours) arr[(h + 24) % 24] = baseline + (peak - baseline) * 0.5;
  };
  switch (shape) {
    case 'peak-evening':
      setPeak([19, 20, 21, 22]);
      setShoulder([18, 23]);
      break;
    case 'peak-midday':
      setPeak([12, 13, 14, 15]);
      setShoulder([11, 16]);
      break;
    case 'peak-late-night':
      setPeak([22, 23, 0, 1, 2, 3]);
      setShoulder([21, 4]);
      break;
    case 'twin-peak':
      setPeak([9, 10, 11, 19, 20, 21, 22]);
      setShoulder([8, 12, 18, 23]);
      break;
    case 'scattered':
      setShoulder([18, 19, 20]);
      break;
    case 'daily-burst':
      setPeak([20]);
      setShoulder([19, 21]);
      break;
  }
  return arr;
}
