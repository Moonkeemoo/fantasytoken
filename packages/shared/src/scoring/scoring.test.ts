import { describe, expect, it } from 'vitest';
import { PORTFOLIO_BUDGET_USD } from '../constants.js';
import { calculatePortfolioScore } from './index.js';

describe('calculatePortfolioScore', () => {
  it('bull league: weighted sum of pct changes', () => {
    // 40% on +25% = +10pp; 60% on -10% = -6pp; total = +4pp = 0.04.
    const score = calculatePortfolioScore(
      'bull',
      [
        { allocationUsd: 40_000, pctChange: 0.25 },
        { allocationUsd: 60_000, pctChange: -0.1 },
      ],
      PORTFOLIO_BUDGET_USD,
    );
    expect(score).toBeCloseTo(0.04);
  });

  it('bear league inverts via multiplier — drops are wins (INV-4)', () => {
    const tokens = [{ allocationUsd: 100_000, pctChange: -0.5 }];
    expect(calculatePortfolioScore('bear', tokens, PORTFOLIO_BUDGET_USD)).toBeCloseTo(0.5);
    expect(calculatePortfolioScore('bull', tokens, PORTFOLIO_BUDGET_USD)).toBeCloseTo(-0.5);
  });

  it('bear league: gains hurt — must NOT use abs() (INV-4)', () => {
    const tokens = [{ allocationUsd: 100_000, pctChange: 0.2 }];
    // If implementation wrongly used abs(), this would be +0.20 — caught here.
    expect(calculatePortfolioScore('bear', tokens, PORTFOLIO_BUDGET_USD)).toBeCloseTo(-0.2);
  });

  it('rejects non-positive budget', () => {
    expect(() => calculatePortfolioScore('bull', [], 0)).toThrow();
    expect(() => calculatePortfolioScore('bull', [], -1)).toThrow();
  });

  it('empty portfolio scores zero', () => {
    expect(calculatePortfolioScore('bull', [], PORTFOLIO_BUDGET_USD)).toBe(0);
    expect(calculatePortfolioScore('bear', [], PORTFOLIO_BUDGET_USD)).toBe(0);
  });
});
