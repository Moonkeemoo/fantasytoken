// INV-3: portfolio is exactly 5 tokens summing to exactly $100K.
export const PORTFOLIO_BUDGET_USD = 100_000 as const;
export const PORTFOLIO_TOKEN_COUNT = 5 as const;

// INV-4: bear leagues invert via multiplier, never abs().
export const LEAGUE_MULTIPLIERS = {
  bull: 1,
  bear: -1,
} as const;

// Anti-manipulation floor for token eligibility (microcaps are pumpable).
export const MIN_TOKEN_MARKET_CAP_USD = 1_000_000 as const;
