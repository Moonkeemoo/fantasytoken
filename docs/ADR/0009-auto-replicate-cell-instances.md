# ADR-0009: Auto-replicate Cell Instances at Fill Threshold

**Status:** Accepted
**Date:** 2026-05-01
**Supersedes:** the "one live instance per cell" stance from ADR-0007's
"considered alternatives" section. The deferral was correct at the time
(small cohort) — this ADR closes the gap now that real users routinely
hit FULL on short-lane cells.

## Context

The 100-synth + early real-user cohort surfaces FULL on short-lane cells
(Quick Match, Memecoin Mash, Bear Trap c1) several times a day. The
existing model has each cell run a single live instance at a time; once
it caps, the only forward path is to wait for the lane to finalize and
the scheduler to spawn the next wave (5-15 minutes for short lanes).
That's the worst lobby UX: a player who picked the contest and prepared
a lineup hits a "FULL" wall with no CTA.

DraftKings' lobby solves this with **mirror contests** — when the
current GPP fills to ~90%, a clone is auto-spawned with the same rules,
prize structure, and timing. The card flips from JOIN to "Open seat in
the next instance →", routing the player straight at the clone. The
mirror is invisible to the player as a concept; from their perspective
they just got a seat.

We want the same handoff, scoped to the cells where it actually
matters: short lanes with finite caps. Long lanes (24h/7d) have huge
capacity overrides and clock-anchored kickoffs — replicating in the
middle of a 24h window would create overlapping waves with confusing
end-times. We skip those for now.

## Decision

### 1. Drop `idx_one_live_per_cell`

The partial UNIQUE INDEX from migration 0020 enforced "one (scheduled
or active) per matrix_cell_key." We drop it in 0023 and replace with a
non-unique index on the same predicate (lookup-shape preserved). The
`matrix_cell_key` column stays — it's now a grouping key, not a
uniqueness key.

Race protection becomes app-level. The scheduler runs on a single
instance with a 60s tick; the worst case is one duplicate spawn if a
cron + a manual trigger happen to race in the same tick, which is easy
to spot in logs and harmless (a duplicate room nobody enters
finalizes empty).

### 2. Replicate when ≥90% full

`scheduler.replicateFullCells` runs after the cold-spawn pass. For
each short-lane cell with at least one live sibling:

- If **every** live sibling has `realFilled / maxCapacity ≥ 0.9`,
- AND the youngest sibling was created **at least 60 seconds ago**,
- spawn a fresh sibling with the lane's standard fill+play windows.

The 90% threshold pre-stages the mirror so the moment the card hits
100%, the CTA is already pointing somewhere. The 60s gap guard keeps
the chain to "one new mirror per minute per cell" even under
saturation.

We only count **real** users (`entries.user_id IS NOT NULL`) toward
the threshold. Synth fillers don't trigger replication on cells real
users haven't found yet — INV-14 spirit applied to the spawn engine.

### 3. Lobby card surfaces the mirror

`ContestRowFromRepo.mirrorContestId: string | null` is computed in
`contests.repo.list` after the row pass. For every FULL row, we look
up siblings (same `matrix_cell_key`) with available capacity and pick
the freshest one (most spots left, latest `startsAt`).

In the UI (`ContestRow.tsx`):

- FULL + `mirrorContestId` → CTA `OPEN SEAT →`, primary variant,
  routes to the mirror's join flow.
- FULL + no mirror → existing disabled `FULL` pill.

Caption rewrites to `FILLED · fresh instance ready →` so the row
explains _why_ the button changed shape.

### 4. Scope: short lanes only

10m / 30m / 1h cells participate. 24h / 7d cells are explicitly
excluded in `scheduler.replicateFullCells` because:

- ADR-0007 already gave them `capacityOverride: 5000` — they don't
  practically fill.
- Their kickoffs are clock-anchored (00/06/12/18 UTC for 24h, Monday
  for 7d). Spawning in the middle of a window creates overlapping
  finalize times that don't match the cadence promise.

If a 24h cell ever needs replication we'd revisit with a separate
spec — likely "sibling clock = parent clock + 12h" rather than
"sibling = NOW".

## Consequences

### Positive

- No more dead-end FULL cards on the cells that fill fastest.
- Player flow stays continuous: pick → prepare → join → if full, one
  click into the clone with the same lineup state preserved.
- Pari-mutuel math stays clean: each sibling has its own pool, prize
  curve, and prices. They don't merge.

### Negative

- Lobby may show two near-identical rows for the same cell during a
  fill spike. This is intended (DraftKings does the same) but worth
  watching — if it gets noisy we could collapse siblings under a
  "Quick Match (3 instances)" group.
- We lose the DB-level uniqueness guard. App-level idempotency at the
  60s scheduler cadence is sufficient for the single-instance backend
  we run today. If we ever scale the scheduler horizontally we'd
  re-add a uniqueness window via `(matrix_cell_key, starts_at)` or a
  short-lived advisory lock per cell key.

### Invariant impact

The "one live per cell" claim from ADR-0007 (and the dangling INV-13
reference in scheduler comments) is retired. INVARIANTS.md never had
an INV-13 entry — the scheduler comment was aspirational. We don't
add a replacement invariant; auto-replicate is a behavior with a
spec, not a hard contract worth enforcing in the DB.

## Implementation notes

- Migration: `0023_auto_replicate.sql` (drop unique, add non-unique).
- Scheduler tests cover the decision function (`shouldReplicateNow`)
  pure-style: capacity threshold, age gap, ANY-not-full short-circuit.
  Integration with the spawn loop is covered by the existing
  scheduler tests (which already exercise the cold-spawn path).
- Web: `ContestListItem.mirrorContestId` defaults to `null` so older
  API responses (pre-0023 deploy) parse cleanly during rollout.
