import { describe, expect, it } from 'vitest';
import {
  VIRTUAL_BUDGET_TIERS_CENTS,
  VIRTUAL_BUDGET_TOP_TIER_CENTS,
  virtualBudgetCentsFor,
} from './contest-tiers.js';

// TZ-003: budget floor bumped from $100 to $1K so per-token gains stay
// legible. Units are whole coins (1 coin = $1 fantasy display).
describe('virtualBudgetCentsFor', () => {
  it('free contest → $1K (floor)', () => {
    expect(virtualBudgetCentsFor(0)).toBe(1_000);
  });

  it('$1 entry (Quick Match / Bear Trap, boundary) → $10K', () => {
    expect(virtualBudgetCentsFor(1)).toBe(10_000);
  });

  it('$5 entry (Memecoin Madness) → $100K', () => {
    expect(virtualBudgetCentsFor(5)).toBe(100_000);
  });

  it('$10 entry (boundary) → $100K', () => {
    expect(virtualBudgetCentsFor(10)).toBe(100_000);
  });

  it('$25 entry (Trader Cup) → $1M', () => {
    expect(virtualBudgetCentsFor(25)).toBe(1_000_000);
  });

  it('$50 entry (Degen Arena, boundary) → $1M', () => {
    expect(virtualBudgetCentsFor(50)).toBe(1_000_000);
  });

  it('$100 entry (Whale Vault) → $10M (top tier)', () => {
    expect(virtualBudgetCentsFor(100)).toBe(VIRTUAL_BUDGET_TOP_TIER_CENTS);
  });

  it('$500 entry (Mythic Cup) → $10M', () => {
    expect(virtualBudgetCentsFor(500)).toBe(VIRTUAL_BUDGET_TOP_TIER_CENTS);
  });

  it('rejects non-finite / negative input — falls back to floor', () => {
    expect(virtualBudgetCentsFor(Number.NaN)).toBe(1_000);
    expect(virtualBudgetCentsFor(-1)).toBe(1_000);
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
