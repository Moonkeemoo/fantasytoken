# qa002 — Uint32 overflow into Postgres `integer` column

**First seen:** 2026-05-01 — synthetic invite_friend INTERNAL errors.
**Severity:** silent data loss / blocked feature flow.
**Fix commit:** `6919029` (apps/api/src/sim/{seed.service,tick.service}.ts).

## Symptom

Synthetic referral cascade fired but every invite landed as
`outcome='error', error_code='INTERNAL'` with payload
`message: "value '2467642692' is out of range for type integer"`.

Yet the **batch seed** for the same column (`users.synthetic_seed`)
appeared to work — 100 rows created, observed values ranged
`[-2.13B, +2.10B]`.

## Root cause

`users.synthetic_seed` is `integer` (Postgres int4, signed
[-2^31, 2^31-1]).

JavaScript-side seed generation used `>>> 0` to coerce to **uint32**
[0, 2^32-1]. About **half the time** the value exceeds 2^31.

Two paths produced different outcomes:

1. **Batch seed** via `seed.service` — drizzle's `sql` template binding
   silently wraps oversized JS numbers to signed int32 (negative values
   in DB). Worked, but lossy.
2. **invite_friend** via `seed.repo.createSynthetic` (same file,
   different call site / different driver path) — postgres-js raised
   `out of range`.

So we had a same-bug-two-faces: batch flow silently corrupted seeds
to negative; invite flow loudly failed.

## Pattern

> **A JS uint32 (e.g. from `>>> 0` or `Math.random()*0xffffffff`)
> does not fit a Postgres `integer` column.** Half the time it's
>
> > 2^31. Some driver paths wrap silently (data loss); others throw.
> > Both are wrong.

Two fixes:

- **Mask** to int31: `value & 0x7fffffff` keeps it in [0, 2^31-1].
  Loses 1 bit of entropy. Easy and safe.
- **Migrate column** to `bigint`. Cleanest long-term.

## How to spot in review

When inserting a JS `Number` into a non-`bigint` column:

- Audit `>>> 0`, `0xffffffff`, `Math.imul`, `crypto.randomInt(2**32)` —
  any uint32 source.
- Confirm column type. `serial` is also int4 by default; `bigserial`
  is the bigint version.
