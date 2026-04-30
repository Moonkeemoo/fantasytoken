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
 * Tiers (5) — units are now WHOLE COINS (1 coin = $1) post-TZ-002 wipe.
 * Function/constant names keep the `Cents` suffix to avoid a 50-file rename;
 * the values changed by /100 to match the new unit.
 *
 *   free          → $100         (100 coins)
 *   ≤ $1          → $1,000       (1_000)
 *   ≤ $10         → $10,000      (10_000)
 *   ≤ $50         → $100,000     (100_000)
 *   > $50         → $1,000,000   (1_000_000)
 *
 * Tuned against REPLENISH_TEMPLATES so each tier holds 2–3 contests; the
 * effective leverage is roughly 1000× entry → budget.
 */

export const VIRTUAL_BUDGET_TIERS_CENTS = [
  { maxEntryFeeCents: 0, budgetCents: 100 }, // free → $100
  { maxEntryFeeCents: 1, budgetCents: 1_000 }, // ≤ $1 → $1K
  { maxEntryFeeCents: 10, budgetCents: 10_000 }, // ≤ $10 → $10K
  { maxEntryFeeCents: 50, budgetCents: 100_000 }, // ≤ $50 → $100K
] as const;

export const VIRTUAL_BUDGET_TOP_TIER_CENTS = 1_000_000 as const; // $1M

/**
 * Pick the virtual budget (in cents) for a contest given its entry fee.
 * Pure function — call from both backend (repo projection) and frontend
 * (anywhere that needs to display before the wire response is parsed).
 */
export function virtualBudgetCentsFor(entryFeeCents: number): number {
  if (!Number.isFinite(entryFeeCents) || entryFeeCents < 0) return 100;
  for (const tier of VIRTUAL_BUDGET_TIERS_CENTS) {
    if (entryFeeCents <= tier.maxEntryFeeCents) return tier.budgetCents;
  }
  return VIRTUAL_BUDGET_TOP_TIER_CENTS;
}
