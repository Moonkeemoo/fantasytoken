# ADR-0007: Matrix v3 — Cell-Level Capacity Override + Linear Practice Payout

**Status:** Accepted
**Date:** 2026-05-01
**Supersedes:** small parts of ADR-0004 (matrix v2) — `LANE_CAPACITY` is no
longer the only knob; cells can override.

## Context

The 100-synth prod cohort launched on 2026-05-01 (TZ-005 M1-M4). Within
minutes it surfaced two distinct concerns:

1. **Lane caps were too small** for a non-trivial cohort. `LANE_CAPACITY['10m']=20`
   meant Practice + small-cap cells filled in seconds. Real users seeing
   "Practice (FULL)" with no alternative is exactly the experience we
   want to avoid; even worse, INV-13's "one live instance per cell" plus
   sequential spawning meant the next Practice was 5-10 minutes away.
2. **Practice payout curve was both stingy and didn't scale.** Practice
   used `payAll: true` over a hard-coded 5-coin pool with geometric
   decay. With N=20 entries the top got ~3 coins and rank 12+ got 0.
   With N=100 the long tail starved entirely. The pool didn't scale;
   the user's expressed goal — "Practice should let people play but
   not get rich, just enough for the next c1 contest" — wasn't met.

We considered auto-replicate (multi-instance per cell at ≥80% fill,
DraftKings GPP-style) but it requires breaking INV-13 and adding
runtime-suffix-cell-key logic. Not justified at current scale.

## Decision

### 1. `MatrixCell.capacityOverride?: number`

Per-cell override of `LANE_CAPACITY[lane]`. Used by Practice (10m / free /
bull) and both Marathon cells (7d / c100, weeklyMonday) — both set to
**5000**, effectively unlimited. Pari-mutuel paid lanes keep the lane
default to preserve prize-pool fairness.

`scheduler.spawnCellInstance` reads the cap via new helper
`effectiveCapacity(cell)`, mirroring the existing `effectiveXpMultiplier`
shape.

### 2. Lane caps bumped 5–10×

Pre-2026-05-01: 20/30/50/100/500. Post: **200/200/300/500/1000**. Big
enough for a 100-synth cohort + organic real users to coexist without
starvation. Specifically too small for 1000-synth scale; auto-replicate
becomes the right answer there (deferred — see "Future work").

### 3. Linear Practice payout curve

`computePrizeCurve` with `opts.payAll === true` now delegates to a new
`computeLinearPracticeCurve(N)`:

- rank 1 (best): **2 coins**
- rank N (worst): **0.5 coins**, rounded up to **1 coin** floor
- middle ranks: linear interpolation

Total pool ≈ 1.5 × N coins, **house-funded** (the `prizePoolCents` arg
is ignored when `payAll=true`). Geometric decay path stays for
pari-mutuel paid contests.

Why these numbers:

- Cap of 2 means Practice grinding can't make a player rich.
- Floor of 1 means every player can afford a c1 contest after one
  Practice round (closes the closed-loop economy from TZ-005 §3 amended).
- Linear (vs geometric) is "fair": 1st only ~4× more than last in raw
  coins, vs ~∞× under geometric. Less feels-bad for the long tail.

### 4. Server-side enforcement of cap + rank gates

The lobby route filters contests by `min_rank > caller_rank` and
`spotsFilled >= maxCapacity`, but those filters are pure UI hygiene.
Direct submit (curl, synthetics, future client divergence) bypasses
them. `entriesService.submit` now enforces both server-side:

- **CONTEST_FULL** (409, `details: {current, cap}`) when real-entry
  count ≥ `maxCapacity`. New `errors.contestFull(...)`. Race window
  on count→insert is documented and accepted (1-2 extras at exactly
  cap; row-locking transaction not justified at current scale).
- **CONTEST_NOT_OPEN** (409) when `caller.currentRank < contest.minRank`.

Captured as **INV-15** and **INV-16**.

## Alternatives rejected

- **Auto-replicate at ≥80% fill** for paid lanes. Right answer at 1000+
  cohort scale but requires:
  - ADR to relax INV-13 (multi-instance per cell allowed).
  - Schema change: `matrix_cell_key` partial unique index swap, or new
    `cell_replica_index` column.
  - Runtime suffix logic for new instance keys.
    Bumped caps + cell override are 80% of the value at 5% of the cost.
- **Single global high cap** (e.g. 5000 for everything paid). Breaks
  pari-mutuel: a 5000-entry c100 contest has a 500K prize pool, far
  larger than current product expectation. Pre-fill latency on lock
  also explodes (5000 bot entries inserted in one tx).
- **Geometric Practice curve, just bigger pool.** Geometric preserves
  the "long tail starves" problem regardless of pool size — bottom
  ranks always get 0 due to integer rounding.

## Consequences

- Practice and Marathon are house-funded by ~1.5×N coins per finalize.
  At 200 finalized Practices/day × ~50 entries average = ~15K coins/day
  outflow. Fine for v1 (Coins ≠ real money).
- Existing scheduled contests created BEFORE this deploy keep their
  20/50 caps until they finalize. Operator can run a single
  `DELETE FROM contests WHERE status='scheduled' AND ...` to force
  fresh spawn — the scheduler picks up within 1 minute.
- INV-13 unchanged for now; auto-replicate flagged for follow-up ADR.

## Future work

- **Auto-replicate** when cohort hits 1000+: multi-instance per cell at
  ≥80% fill. Requires INV-13 relaxation + schema migration. Track as
  TZ-007.
- **Migrate `users.synthetic_seed` from int4 to bigint** to remove the
  `& 0x7fffffff` mask in seed.service / invite_friend. Cosmetic; fix
  works as-is.
