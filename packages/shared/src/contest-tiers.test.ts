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

  it('$0.25 entry → $1K', () => {
    expect(virtualBudgetCentsFor(25)).toBe(100_000);
  });

  it('$0.50 entry (boundary) → $1K', () => {
    expect(virtualBudgetCentsFor(50)).toBe(100_000);
  });

  it('$0.51 entry (just over) → $10K', () => {
    expect(virtualBudgetCentsFor(51)).toBe(1_000_000);
  });

  it('$5 entry (boundary) → $10K', () => {
    expect(virtualBudgetCentsFor(500)).toBe(1_000_000);
  });

  it('$25 entry → $100K', () => {
    expect(virtualBudgetCentsFor(2_500)).toBe(10_000_000);
  });

  it('$50 entry (boundary) → $100K', () => {
    expect(virtualBudgetCentsFor(5_000)).toBe(10_000_000);
  });

  it('$50.01+ entry → $1M (top tier)', () => {
    expect(virtualBudgetCentsFor(5_001)).toBe(VIRTUAL_BUDGET_TOP_TIER_CENTS);
    expect(virtualBudgetCentsFor(100_000)).toBe(VIRTUAL_BUDGET_TOP_TIER_CENTS);
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
