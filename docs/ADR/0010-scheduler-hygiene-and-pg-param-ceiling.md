# ADR-0010: Scheduler Hygiene and the Postgres Parameter Ceiling

**Status:** Accepted
**Date:** 2026-05-02
**Builds on:** ADR-0009 (auto-replicate cell instances) — fixes the
unbounded growth that ADR-0009 unintentionally introduced.
**Related:** qa007 (the prod incident this ADR closes).

## Context

ADR-0009 wired auto-replicate into the scheduler so short-lane cells
spawn a clone at 90% fill. That logic is correct, but it left two
operational gaps:

1. **No upper bound on the live + scheduled set.** When real-user
   demand can't keep up with replicate output, instances accumulate
   in `status='scheduled'` indefinitely. By the morning of 2026-05-02
   the set was at 65 546 rows (62 668 scheduled + 2 878 active).
2. **`loadLiveByCell` reads that whole set into a single
   `inArray(contests.id, ids)` query.** postgres-js binds each id as a
   parameter; postgres caps queries at 65 534 parameters. Once the set
   crossed that line every scheduler tick failed with
   `MAX_PARAMETERS_EXCEEDED`. The error fired from the
   `onContestLocked` hook on every lock, the worker retried, and the
   process OOM'd. `/health` was unreachable for ~9h.

The trigger was the wipe-and-restart from 2026-05-01: a fresh empty
matrix gave auto-replicate the most permissive fill curve, and ADR-0009
created instances faster than the lock pipeline could promote them to
`active`. Pre-wipe traffic had been keeping the set ~75 k for hours
without the lock-event-spam path being exercised; the restart turned
slow accumulation into a fast crash.

## Decision

### 1. Chunk `loadLiveByCell`'s `inArray` query

Stay below the postgres parameter ceiling regardless of set size.
Chunk size **5 000** ids per query — well below 65 534, with negligible
round-trip overhead at any realistic scale (`N/5000` extra hops). The
top-level select that produces the `ids` list is itself unbounded but
returns one row per contest, which is fine — the failure was bind
parameters, not result-set size.

### 2. Add Pass 0 GC to `scheduler.schedule()`

Each scheduler tick now begins by cancelling rows that match all of:

- `status = 'scheduled'`
- `starts_at < now()`
- no entries with `user_id IS NOT NULL`

Single bulk `UPDATE` — atomic, idempotent, INV-9-safe (the
empty-real-entries predicate guarantees nothing to refund). Logged via
`scheduler.gc cancelled overdue empty`. Wrapped in `try/catch` per
INV-7 — a GC error logs and degrades cleanly without blocking the
spawn passes.

This bounds the live + scheduled set by _real demand_ + _current-window
window_, not by historical scheduler churn.

### 3. Codify the `inArray` pattern in qa007

Eleven `inArray(` call sites audited; only the scheduler site
required a fix. The pattern document (qa007) records the audit so
future contributors don't re-introduce an unbounded variant.

We deliberately did **not** lift `chunkedInArray` to a shared helper.
A single call site is YAGNI; we'll revisit if a third unbounded
`inArray` shows up.

## Alternatives rejected

- **Replace `inArray` with a window subquery** (e.g. SELECT entries
  joined to a CTE of contest ids). Cleaner SQL but a much bigger
  rewrite of `loadLiveByCell`'s shape, and it doesn't address the
  unbounded-growth root cause that GC handles.
- **Hard cap on live + scheduled per cell.** Fragile — caps a healthy
  high-demand cell the same as a runaway one. GC by overdue + empty
  predicate is precise.
- **Run scheduler on a fixed cron, not on `onContestLocked`.** Worth
  doing eventually for unrelated reasons (debounce heavy work) but
  doesn't fix the ceiling — even a 60s cron with 65 k rows would still
  crash. Out of scope for this ADR.
- **Move scheduler bookkeeping out of postgres.** The set-size
  problem is a postgres-postgres-driver interaction, not a database
  fitness issue. Postgres handles the actual data fine; the ceiling is
  in the wire-protocol parameter slot.

## Consequences

- The scheduler now has three passes (GC, cold spawn, replicate)
  instead of two. `SchedulerService.schedule()` returns
  `{ created, replicated, gcCancelled }` — additive change.
- An operational backlog (e.g. surveillance pause, prolonged low
  demand) self-cleans in one tick instead of accumulating.
- Cancelled rows produce no DM and no balance change — they are
  invisible to users by construction (no real entries existed).
- The 65 534 ceiling is now far enough away that even a 10× scale
  spike won't reproduce qa007.

## Future work

- **Move `scheduler.schedule()` off the `onContestLocked` hook** onto
  its own debounced cron; lock events should not trigger heavy
  scheduler scans.
- **Promote the chunk pattern to a helper** if a third unbounded
  `inArray` site appears.
- **Boot-time sanity probe** — log `live+scheduled` count on API boot;
  alert if > 10 000 (early warning, half the historical observed
  ceiling).
