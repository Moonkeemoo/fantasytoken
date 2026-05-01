# ADR-0006: Synthetic Users Simulation (TZ-005)

**Status:** Accepted (M1 only — milestone-by-milestone)
**Date:** 2026-05-01
**Builds on:** TZ-001..004 (all shipped); does not touch them.

## Context

Prod has no real users yet. An empty leaderboard repels first arrivals and
hides whole classes of business-logic bugs (insufficient-coin churn,
referral edge-cases, prize-pool maths under load) until they hit a real
player. We need a population to:

1. **Find economic holes** before real money/Stars purchases unlock — e.g.
   personas running out of coins before earning their first prize means
   our welcome grant is too small or fees too high.
2. **Populate leaderboards** so contests look alive on day-1.
3. **Exercise real services end-to-end** (`entriesService`,
   `currencyService`, referral graph) — not bypass them.

## Decision

Introduce a parallel cohort of **synthetic users** living in the same
`users` table, distinguished by `is_synthetic=true`, with persona-driven
behavior controlled by a tick worker.

### Key design choices

1. **Same table, flag column.** Keeping synthetics in `users` means every
   read path (leaderboard, referrals, friendships) sees them by default.
   Production read paths that should hide synthetics filter via
   `is_synthetic=false` (see INV-14). A partial index makes that filter
   index-only.

2. **Negative `telegram_id`.** Real Telegram IDs are always positive.
   Synthetics claim values from a Postgres `synthetic_telegram_id_seq` and
   negate them — never collides with a real TG account, never confuses
   the `telegramId BIGINT UNIQUE` constraint.

3. **Real services, never bypass.** When a synthetic enters a contest,
   it goes through the same `entriesService.submit` a real user would.
   When it gets `INSUFFICIENT_COINS`, that's logged as
   `outcome='rejected'`, `errorCode='INSUFFICIENT_COINS'` — exactly the
   data we need to spot economy holes.

4. **Append-only `synthetic_actions_log`.** Every action — success,
   rejection, skip — captures `(action, outcome, errorCode, payload,
balanceAfterCents)`. CASCADE on `user_id` because this is observability,
   not audit (INV-9 audit lives in `transactions`).

5. **`DEV_GRANT` transaction type.** Synthetic balances are seeded via
   `currencyService.transact({ type: 'DEV_GRANT' })`. Distinct from
   `COINS_PURCHASE` so ledger reports can split synthetic-funded balance
   from real Stars-purchased coins. **Stars purchase simulation is
   deferred to v2** (TZ §11).

6. **Single tuning surface (`sim.config.ts`).** All persona weights,
   distributions, and starting balances live in one file so the polish
   loop agent can diff before/after across runs.

7. **Endpoints behind two gates.** `SIM_ADMIN_ENABLED` env flag gates
   route registration; `requireAdmin` (existing) gates per-request access.

### Wipe semantics

`pnpm sim:wipe` runs in a single transaction, deleting in dependency
order: `synthetic_actions_log` → `bot_dm_queue` → `friendships` →
`xp_events` → `referral_*` → `entries` → `transactions` → `balances` →
`users`. `transactions.user_id` is `ON DELETE RESTRICT` (audit log
preservation for real users); the explicit DELETE inside the transaction
keeps that constraint intact for real rows. If any FK back to a synthetic
user comes from a real user (would only happen post-launch via the
referral graph — see TZ §12 risk), the transaction rolls back and the
operator sees the violation.

## Alternatives rejected

- **Separate `synthetic_users` table.** Doubles every read path's joins
  and forks the query surface. Flag column + partial index is cheaper.
- **Soft-delete via flag.** Wipe needs to remove the rows entirely —
  otherwise contest leaderboards stay inflated and prize-pool maths
  drifts.
- **Stars-purchase simulation in v1.** Telegram Stars are real money; the
  TG API doesn't have a sandbox we can drive. Defer to v2 when real
  traffic justifies the integration cost.

## Consequences

- Every existing query that lists or counts users in a "real users only"
  context must be audited and updated to filter `is_synthetic = false`
  (INV-14, M1.7 audit).
- Future TON-payout mode (TZ-006) must guard against synthetic winners
  receiving on-chain transfers. Not yet enforced — Coins ≠ real money in
  v1, so a synthetic winning a paid contest is harmless.
- Migration `0021_synthetic_users.sql` is additive and idempotent; no
  rollback needed (just drop the new columns/table if reverted, but no
  consumer outside the sim module reads them).

## Milestone scope

This ADR governs the whole TZ-005 initiative. M1 lands schema + seed +
wipe + admin endpoints. M2..M4 (static play / tick worker / referral
cascade) extend the same architecture; if any of them require an
architectural shift, a follow-up ADR will supersede this one in part.
