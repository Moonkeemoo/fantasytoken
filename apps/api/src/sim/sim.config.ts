import type { PersonaKind } from '@fantasytoken/shared';

/**
 * TZ-005 §9 — single tuning surface for synthetic users.
 *
 * Edit this file (or override at runtime via admin/seed body) to tweak
 * cohort behavior. Keeping every knob in one place lets the polish-loop
 * agent diff before/after across runs.
 *
 * M1 only consumes `distribution` and `startingCoins`. M3 will add
 * loginProbability / contestPickProbability / topUpBehavior / referralRate.
 */

export interface PersonaConfig {
  /** Coins granted at seed time via DEV_GRANT (one-shot). 0 → no grant. */
  startingCoins: number;
}

export const SIM_CONFIG: {
  distribution: Record<PersonaKind, number>;
  personas: Record<PersonaKind, PersonaConfig>;
} = {
  // Default mix — sums to 1.0. Caller can override per-seed.
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
    // Casual: matches a real user's welcome bonus floor. If economy holes
    // appear, casuals are the canary — they should NOT churn out of coins
    // before earning their first prize.
    casual: { startingCoins: 20 },
    newbie: { startingCoins: 20 },
    // Streakers play daily; a slightly bigger float lets them last a week
    // of $1 entries before any payout — that's the success metric.
    streaker: { startingCoins: 50 },
    meme_chaser: { startingCoins: 30 },
    lurker: { startingCoins: 20 },
    inviter: { startingCoins: 30 },
    // Whales seed the paid-tier liquidity. $1000 covers ~10 max-tier
    // entries; anything less and they'd churn unrealistically fast.
    whale: { startingCoins: 1000 },
  },
};
