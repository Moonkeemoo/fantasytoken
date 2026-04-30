# ADR-0005: Equal-Split Allocation (TZ-003)

**Status:** Accepted
**Date:** 2026-04-30
**Supersedes:** ADR-0003 portion that defined per-pick alloc UX (step=1, range [0,100], length=5)

## Context

ADR-0003 (TZ-001) shipped the $-first allocation UX: player picks 5 tokens
and tunes each token's % share via a bottom sheet (`AllocSheet`). In prod
testing the allocation step proved to be the dominant UX friction:

- Most players default-clicked "Balanced 20/20/20/20/20" instead of
  expressing a real opinion.
- The "I think BTC will pump" mental model is naturally expressed as
  "pick BTC", not "pick BTC + 4 fillers, allocate ≥ 50% to BTC".
- The AllocSheet introduced a modal where players expected an immediate
  add-to-team interaction.

The fantasy genre convention (DraftKings, fantasy football, sports
pools) is **roster construction**, not portfolio rebalancing. We were
charging the player for game complexity that didn't differentiate us.

## Decision

### 1. Lineup is 1–5 unique symbols. Allocations are auto-distributed evenly.

Strategy now lives in `lineup.length`:

| Picks | Effective strategy                      |
| ----- | --------------------------------------- |
| 1     | All-in conviction (100% on one token)   |
| 2     | Hedge (50/50)                           |
| 3     | Triple split (~33% each)                |
| 4     | 25% each                                |
| 5     | Spread / max diversification (20% each) |

### 2. Storage in basis points

Allocations stored as integer "alloc cents" (basis points) with total
`10000 = 100%`. Avoids float drift in scoring math. When
`10000 % length ≠ 0`, the remainder goes to `picks[0..remainder-1]` —
deterministic, predictable.

```
1 token  → [10000]
2 tokens → [5000, 5000]
3 tokens → [3334, 3333, 3333]   ← picks[0] gets +1 cent
4 tokens → [2500, 2500, 2500, 2500]
5 tokens → [2000, 2000, 2000, 2000, 2000]
```

Implementation: `evenAllocCents()` in `packages/shared/src/schemas/entry.ts`.

### 3. Wire payload simplified

```ts
// before
POST /contests/:id/enter
{ picks: [{ symbol: 'PEPE', alloc: 30 }, ...] }

// after
POST /contests/:id/enter
{ picks: ['PEPE', 'SOL', 'WIF'] }
```

Backend computes `allocCents` via `evenAllocCents` server-side. Old
payload format is rejected with 400 — clean cutover, no compat layer.
Existing `entries.picks[].alloc` rows preserve their pre-TZ-003 values
(legacy historical data).

### 4. UI removals

- `AllocSheet.tsx` deleted.
- `AllocSheetDev.tsx` deleted (dev preview route gone too).
- `LineupSlot` now removes the pick on tap (no edit modal).
- `TokenResultRow` toggles add/remove on tap (no modal).
- Allocation progress bar (the `0..100%` sticky bar in DraftScreen) deleted —
  with auto-split, total is always 100% the moment any pick exists.

### 5. CTA state machine simplified

```
empty lineup → "PICK 1+ TOKENS" (idle)
1..5 picks   → "GO BULL · 🪙 N entry" / "GO BEAR · …" (ready)
```

Legacy `alloc` ("ALLOCATE X% MORE") and `over` ("OVER BUDGET BY X%") states
deleted — they were artifacts of the manual allocation logic.

### 6. Onboarding hint

First-launch players (empty lineup) see a single line under the slots:

```
Tip: 1 token = all-in conviction · 5 = max spread
```

Disappears as soon as they place a pick. Implemented as inline JSX in
`DraftScreen`, no localStorage / counter state.

### 7. Presets re-shaped

`StartFromStrip` presets now express strategy through count:

- `Spread 5` — 5 picks
- `Hedge 2` — 2 picks
- `All-in` — 1 pick
- `Last team +X.X%` — personal preset (symbol list from last entry,
  historical alloc% intentionally dropped on apply)

Type change: `preset.picks` is `AddTokenInput[]` (symbol + display meta),
not `LineupPick[]`.

## Consequences

### Positive

- **Drive-by drafting in 3 seconds**: tap 1–5 tokens, hit GO. Modal-free.
- **Wire payload smaller** (~30% smaller JSON), no more numeric coercion
  drift between the $ display and stored %.
- **Test surface area shrinks**: reducer goes from ~150 LOC to ~110 with
  fewer branches; no rounding/clamp edge cases per pick.
- **Onboarding curriculum cleaner**: "pick a team" is one rule, not three
  (count + per-pick range + sum=100).
- **Future Pro Mode** (manual allocation) is a clean feature flag away,
  not a refactor.

### Negative

- **Strategy expressiveness is reduced**: a player who wants 70/15/15
  can't express it. Mitigated by the count-based axis (1 = max
  conviction; you wouldn't have used 70/15/15 anyway because the high
  pick already dominates the score).
- **Existing entries pre-TZ-003** still carry the manual `alloc` values.
  Live screen / leaderboard read both — new entries scored from
  `allocCents` (precise), legacy from `alloc%` (legacy) — same scoring
  formula, no drift in practice.
- **Round-off bias to picks[0]** — first pick gets +1 basis point on
  3-pick lineups. Negligible (0.01% extra weight). Documented for
  symmetry with future audits.

### Trade-offs explicitly NOT taken

- **Keep manual mode as opt-in toggle**: rejected. Two-mode UI doubles
  surface area, splits onboarding, and the pro audience for v1 is too
  small to justify the cost. Will revisit as a separate ADR if/when
  retention-by-tier data shows demand.
- **Backwards-compat for old payload**: rejected. New client never sends
  it; cleaner to fail-fast on stale clients than to maintain dual
  parsers. Existing in-flight entries (created pre-deploy) are
  unaffected — only future submissions hit the new schema.
- **Drop the 5-token cap**: rejected. UI grid is 5 slots; raising it
  cascades into search/sort/scoring rebalances out of scope here.

## Invariant changes

### Update INV-3

> **INV-3** (revised) — Lineup portfolio: 1–5 unique tokens. Allocations
> are auto-distributed evenly server-side — no user input on per-pick
> allocation. Stored as integer "alloc cents" / basis points (10000 =
> 100%); when `10000 % length ≠ 0`, the round-off goes to picks in input
> order. Sum of alloc cents always equals 10000.

Old phrasing ("exactly 5 tokens", "step=1", "range [0,100]") is retired.

## Migration notes

1. Wire format flip is the breaking change — clients pinned to the old
   shape will get 400 from `POST /contests/:id/enter`. Coordinated with
   the Vercel deploy → Railway redeploy ordering: shared package builds
   first, web + api roll over together on the same git push.
2. Legacy `entries.picks[].alloc` column stays in DB. New rows continue
   writing `alloc` for back-compat (computed from `allocCents / 100`).
   `allocCents` will be added as a sibling column in TZ-003.1 if scoring
   precision becomes an issue.
3. Active contests at deploy time keep their entries — neither schema
   migration nor a recompute is needed.

## References

- Handoff: TZ-003 v1 · 2026-04-30 (this ADR formalizes the spec)
- Replaces: ADR-0003 §1 (per-pick alloc UX)
- INV-3 update: see `docs/INVARIANTS.md`
- Implementation:
  - `packages/shared/src/schemas/entry.ts` (schema + `evenAllocCents`)
  - `apps/api/src/modules/entries/entries.service.ts` (server split)
  - `apps/web/src/features/team-builder/lineupReducer.ts` (FE state)
  - `apps/web/src/features/team-builder/DraftScreen.tsx` (UI)
