import { LEAGUE_MULTIPLIERS } from '../constants.js';
import type { ContestType } from '../schemas/contest.js';

export interface TokenAllocation {
  /** Allocated USD amount. INV-3: sum across portfolio === PORTFOLIO_BUDGET_USD. */
  allocationUsd: number;
  /** Decimal fraction of price change. +0.25 means +25%. */
  pctChange: number;
}

/**
 * Authoritative portfolio score.
 *
 * Same function used by frontend (preview) and backend (final result) — INV-3, INV-4
 * cannot drift between ends because there is only one implementation.
 *
 * Score = sum over tokens of (multiplier × pctChange × weight)
 * where weight = allocationUsd / totalBudgetUsd.
 *
 * INV-4: bear leagues invert via `multiplier = -1`, never via `Math.abs()`.
 */
export function calculatePortfolioScore(
  contestType: ContestType,
  tokens: readonly TokenAllocation[],
  totalBudgetUsd: number,
): number {
  if (totalBudgetUsd <= 0) {
    throw new Error('totalBudgetUsd must be positive');
  }
  const multiplier = LEAGUE_MULTIPLIERS[contestType];
  return tokens.reduce((acc, token) => {
    const weight = token.allocationUsd / totalBudgetUsd;
    return acc + multiplier * token.pctChange * weight;
  }, 0);
}
