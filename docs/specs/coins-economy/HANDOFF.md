# Coins Economy — Implementation Handoff (TZ-002)

> Captured from product spec `TZ-002 v1` 30 Apr 2026. See section "Decisions
> applied (2026-04-30)" at the bottom for the diffs against the original
> spec — those are the values shipping to prod.

[Original spec contents — see git history, this is a working copy for the
Coins Economy redesign.]

## Decisions applied (2026-04-30)

- **1 coin = 1 dollar of fantasy display.** Coins are the only soft currency
  going forward. The previous USD-cents balance is wiped.
- **1 Star = 10 coins** (per spec).
- **Existing data wiped**, not migrated: `transactions` truncated,
  `balance_cents` dropped, fresh ledger.
- **Entry fee scaling**: prior `entry_fee_cents` values (e.g. Quick Match
  100¢) divided by 100 to become coins (Quick Match → 1 coin entry,
  Mythic Cup → 500 coins entry).
- **Signup grant**: 500 coins (was $100 = 10_000 cents).
- **Column names**: `entry_fee_cents`, `prize_pool_cents`, `prize_cents`,
  `delta_cents` stay as-is in this milestone — only their scaled values
  change. A follow-up rename pass is on the roadmap but not blocking v1.
- **No daily login / referral grants** in v1 (spec §9 deferred).
