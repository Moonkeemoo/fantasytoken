// INV-3 (revised 2026-04-30, ADR-0003): allocation rules.
export const PORTFOLIO_TOKEN_COUNT = 5 as const;
export const PORTFOLIO_PCT_TOTAL = 100 as const;
export const ALLOCATION_STEP_PCT = 1 as const;
export const ALLOCATION_MIN_PCT = 0 as const;
export const ALLOCATION_MAX_PCT = 100 as const;

// Legacy: scoring function takes a generic `totalBudgetUsd`. Tests pass 100_000;
// MVP code paths pass 100 (unit = percent). Kept here so existing scoring tests
// don't churn — see ADR-0002.
export const PORTFOLIO_BUDGET_USD = 100_000 as const;

// ADR-0003: virtualBudget per contest is the new $-first UX layer. Default for
// contests without an explicit value (e.g. legacy fixtures, dev seeds).
export const DEFAULT_VIRTUAL_BUDGET_USD = 100_000 as const;

// INV-4 (frozen for MVP): preserved for V2 unfreeze.
export const LEAGUE_MULTIPLIERS = {
  bull: 1,
  bear: -1,
} as const;

// MVP-economy constants (mirror server env defaults; treat env as authoritative).
// TZ-002: numerical units are now WHOLE COINS (1 coin = $1 fantasy display).
// Constant kept under its old name so existing call sites compile through the
// migration; the value is the new coin grant.
export const WELCOME_BONUS_USD_CENTS = 500 as const; // 500 🪙 signup grant
/** Telegram Stars → Coins exchange rate (TZ-002 §2). 100⭐ → 1000🪙 base. */
export const COINS_PER_STAR = 10 as const;
export const RAKE_PCT_DEFAULT = 10 as const;
export const BOT_MIN_FILLER = 20 as const;
export const BOT_RATIO = 3 as const;

// Anti-manipulation floor — currently no-op (MVP §1.4 free-for-all).
export const MIN_TOKEN_MARKET_CAP_USD = 0 as const;
