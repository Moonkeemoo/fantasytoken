import { describe, expect, it } from 'vitest';
import {
  VIRTUAL_BUDGET_TIERS_CENTS,
  VIRTUAL_BUDGET_TOP_TIER_CENTS,
  virtualBudgetCentsFor,
} from './contest-tiers.js';

describe('virtualBudgetCentsFor', () => {
  it('free contest → $100', () => {
    expect(virtualBudgetCentsFor(0)).toBe(10_000);
  });

  it('$1 entry (Quick Match / Bear Trap, boundary) → $1K', () => {
    expect(virtualBudgetCentsFor(100)).toBe(100_000);
  });

  it('$1.01 entry (just over) → $10K', () => {
    expect(virtualBudgetCentsFor(101)).toBe(1_000_000);
  });

  it('$5 entry (Memecoin Madness) → $10K', () => {
    expect(virtualBudgetCentsFor(500)).toBe(1_000_000);
  });

  it('$10 entry (High-Stakes Quick Match, boundary) → $10K', () => {
    expect(virtualBudgetCentsFor(1_000)).toBe(1_000_000);
  });

  it('$20 entry (Trader Cup) → $100K', () => {
    expect(virtualBudgetCentsFor(2_000)).toBe(10_000_000);
  });

  it('$50 entry (Degen Arena, boundary) → $100K', () => {
    expect(virtualBudgetCentsFor(5_000)).toBe(10_000_000);
  });

  it('$100 entry (Whale Vault) → $1M (top tier)', () => {
    expect(virtualBudgetCentsFor(10_000)).toBe(VIRTUAL_BUDGET_TOP_TIER_CENTS);
  });

  it('$500 entry (Mythic Cup) → $1M', () => {
    expect(virtualBudgetCentsFor(50_000)).toBe(VIRTUAL_BUDGET_TOP_TIER_CENTS);
  });

  it('rejects non-finite / negative input — falls back to lowest tier', () => {
    expect(virtualBudgetCentsFor(Number.NaN)).toBe(10_000);
    expect(virtualBudgetCentsFor(-1)).toBe(10_000);
  });

  it('budgets are strictly monotonic across tier boundaries', () => {
    let prev = -1;
    for (const t of VIRTUAL_BUDGET_TIERS_CENTS) {
      expect(t.budgetCents).toBeGreaterThan(prev);
      prev = t.budgetCents;
    }
    expect(VIRTUAL_BUDGET_TOP_TIER_CENTS).toBeGreaterThan(prev);
  });
});
