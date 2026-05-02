# qa007 — Postgres 65 534-parameter ceiling tripped by unbounded `inArray`

**First seen:** 2026-05-02 — production API service entered an OOM
crash-loop; loading screen on the Mini App.
**Severity:** prod-down — `/health` timing out for ~9h before triage.
**Fix commits:** `<scheduler-chunk>` (`apps/api/src/modules/contests/contests.scheduler.ts`).

## Symptom

```
Error: MAX_PARAMETERS_EXCEEDED: Max number of parameters (65534) exceeded
  at toBuffer (postgres/src/connection.js:187:20)
  ...
  in contests.tick onContestLocked failed contestId=<…>
```

…repeated dozens of times per second, then:

```
FATAL ERROR: Ineffective mark-compacts near heap limit
Allocation failed - JavaScript heap out of memory
```

The error landed inside `loadLiveByCell` (called from
`scheduler.schedule()` via the `onContestLocked` hook). On every
contest lock the worker re-ran the failing query, accumulated retry
state, and eventually tipped over from heap exhaustion.

## Root cause

`loadLiveByCell` did:

```ts
const ids = rows.map((r) => r.id);
await db.select(...).from(entries).where(inArray(entries.contestId, ids));
```

The postgres-js driver binds each `inArray` element as a separate
query parameter. Postgres caps a single query at **65 534 bind
parameters** (`pq_getmsgint16` field width). When `ids.length` crossed
that threshold, the query failed before ever reaching the server.

The set grew unboundedly because the new auto-replicate scheduler
(ADR-0009) spawns short-lane instances faster than the lock pipeline
can move them to `active`, and there was no garbage collection of
overdue empty `scheduled` rows. After a wipe + re-warm, the prod set
crossed 65 546 (62 668 scheduled + 2 878 active) and the next tick
crashed.

## Pattern

> **`inArray(col, list)` is a foot-gun whenever `list` is bounded by a
> growing collection (users, contests, entries). Always either chunk
> the list or replace the predicate with a JOIN / EXISTS / subquery.**

Two systemic fixes apply together:

1. **Chunk the list** at the call site (or via a helper) below a safe
   ceiling — 5 000 per query gives ~13× headroom and adds only one
   extra round-trip per 5 000 ids.
2. **Bound the underlying collection.** When the upstream is a
   queue-like table (scheduled contests, DM queue, finalized entries
   pending bonus), garbage-collect rows the system will never act on
   again. Without this, chunking only delays the next ceiling.

The combo eliminates both the immediate failure and the structural
trend that produced it.

## How to spot in review

- Grep `inArray(` across the api source. For each match, ask:
  _what bounds the array length?_ If the answer involves a row count
  in a growing table (users, contests, entries, transactions, queue),
  this is the pattern. Either chunk inline or refactor to a JOIN.
- Distrust hooks that re-run on every event in a hot loop
  (`onContestLocked`, finalize callbacks). A query that's "fast enough"
  at 1 000 rows can crash the worker at 65 000 — and the on-event
  trigger means each failure is immediately retried.

## Audit performed (2026-05-02)

Eleven `inArray(` call sites in `apps/api/src`. Classified:

| Site                                                            | Bound                          | Verdict                                     |
| --------------------------------------------------------------- | ------------------------------ | ------------------------------------------- |
| `contests.scheduler.ts:loadLiveByCell`                          | live + scheduled contest count | **caused crash** — chunked                  |
| `sim/tick.repo.ts:loadBalancesByUser`                           | synth user count               | at-risk above 60 k synths — note for future |
| `bot/queue.repo.ts` (×3)                                        | DM batch size                  | bounded by batch fetch — safe               |
| `entries.repo.ts`, `leaderboard.repo.ts` (×2), `result.repo.ts` | lineup symbols (≤5 per entry)  | safe                                        |
| `profile.repo.ts` (×2)                                          | per-user transactions          | de facto bounded; revisit at whale scale    |

Only the scheduler site was a current bug. Inline chunk + scheduler GC
is the right dose; lifting to a `chunkedInArray` helper is YAGNI until
a third site needs the same pattern.
