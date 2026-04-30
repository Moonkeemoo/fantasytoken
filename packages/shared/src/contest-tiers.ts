/**
 * Virtual-budget tiers (ADR-0003).
 *
 * The contest's virtual budget is an UX-only display value — backend score
 * and payout still operate in pure % space. We derive it from `entryFeeCents`
 * so a $0.50 contest doesn't pretend to be a $1M tournament.
 *
 * Floor bumped to $1,000 — the previous $100 free-tier produced
 * sub-cent per-token gains on Practice ($0.20 alloc × 1% pump = $0.002),
 * which read as "$0" to most users. $1,000 floor keeps numbers legible
 * (a 1% gain shows as "+$2") without changing the underlying scoring math.
 *
 *   free          → $1,000
 *   ≤ $1          → $10,000
 *   ≤ $10         → $100,000
 *   ≤ $50         → $1,000,000
 *   > $50         → $10,000,000
 */

export const VIRTUAL_BUDGET_TIERS_CENTS = [
  { maxEntryFeeCents: 0, budgetCents: 1_000 }, // free → $1K
  { maxEntryFeeCents: 1, budgetCents: 10_000 }, // ≤ $1 → $10K
  { maxEntryFeeCents: 10, budgetCents: 100_000 }, // ≤ $10 → $100K
  { maxEntryFeeCents: 50, budgetCents: 1_000_000 }, // ≤ $50 → $1M
] as const;

export const VIRTUAL_BUDGET_TOP_TIER_CENTS = 10_000_000 as const; // $10M

/**
 * Pick the virtual budget (in cents) for a contest given its entry fee.
 * Pure function — call from both backend (repo projection) and frontend
 * (anywhere that needs to display before the wire response is parsed).
 */
export function virtualBudgetCentsFor(entryFeeCents: number): number {
  if (!Number.isFinite(entryFeeCents) || entryFeeCents < 0) return 1_000;
  for (const tier of VIRTUAL_BUDGET_TIERS_CENTS) {
    if (entryFeeCents <= tier.maxEntryFeeCents) return tier.budgetCents;
  }
  return VIRTUAL_BUDGET_TOP_TIER_CENTS;
}
