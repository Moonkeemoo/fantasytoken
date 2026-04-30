/**
 * Virtual-budget tiers (ADR-0003).
 *
 * The contest's virtual budget is an UX-only display value — backend score
 * and payout still operate in pure % space. We derive it from `entryFeeCents`
 * so a $0.50 contest doesn't pretend to be a $1M tournament.
 *
 * The DB column `contests.virtual_budget_cents` exists as a future-override
 * hook (e.g. a special $10M practice tournament could be stamped explicitly),
 * but absent an explicit override the value below is the source of truth.
 *
 * Tiers (5):
 *   free          → $100      (10_000 cents)
 *   ≤ \$0.50      → $1,000    (100_000)
 *   ≤ \$5.00      → $10,000   (1_000_000)
 *   ≤ \$50.00     → $100,000  (10_000_000)
 *   > \$50.00     → $1,000,000 (100_000_000)
 *
 * Step factor is 10× per tier — keeps mental math simple at the table.
 */

export const VIRTUAL_BUDGET_TIERS_CENTS = [
  { maxEntryFeeCents: 0, budgetCents: 10_000 }, // free → $100
  { maxEntryFeeCents: 50, budgetCents: 100_000 }, // ≤ $0.50 → $1K
  { maxEntryFeeCents: 500, budgetCents: 1_000_000 }, // ≤ $5 → $10K
  { maxEntryFeeCents: 5_000, budgetCents: 10_000_000 }, // ≤ $50 → $100K
] as const;

export const VIRTUAL_BUDGET_TOP_TIER_CENTS = 100_000_000 as const; // $1M

/**
 * Pick the virtual budget (in cents) for a contest given its entry fee.
 * Pure function — call from both backend (repo projection) and frontend
 * (anywhere that needs to display before the wire response is parsed).
 */
export function virtualBudgetCentsFor(entryFeeCents: number): number {
  if (!Number.isFinite(entryFeeCents) || entryFeeCents < 0) return 10_000;
  for (const tier of VIRTUAL_BUDGET_TIERS_CENTS) {
    if (entryFeeCents <= tier.maxEntryFeeCents) return tier.budgetCents;
  }
  return VIRTUAL_BUDGET_TOP_TIER_CENTS;
}
