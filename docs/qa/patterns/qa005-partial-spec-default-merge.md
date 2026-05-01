# qa005 — Partial-spec default merge (caller-provided overrides leak defaults)

**First seen:** 2026-05-01 — sim:seed test asserting whale/casual split
returned wrong counts.
**Severity:** silent semantic drift, caught by test.
**Fix commit:** part of `47c8413` (apps/api/src/sim/seed.service.ts).

## Symptom

```ts
seedService.seed({ count: 100, distribution: { whale: 0.2, casual: 0.8 } });
// expected: whale=20, casual=80
// actual:   whale=14, casual=56  (rest distributed to default mix)
```

## Root cause

The service merged caller's `distribution` over `SIM_CONFIG.distribution`
defaults via spread:

```ts
const merged = { ...config.distribution };
if (distribution) {
  for (const k of PERSONA_KINDS) {
    if (distribution[k] !== undefined) merged[k] = distribution[k] as number;
  }
}
```

So when caller passed `{whale: 0.2, casual: 0.8}` thinking "rest is
zero", merged was `{whale: 0.2, casual: 0.8, newbie: 0.20, streaker: 0.15, ...}`
(default values for missing keys). Sum > 1.0; allocator normalised
and most slots went to the defaults the caller didn't even mention.

Spec on the wire (shared/sim.ts SimSeedBody) explicitly said
"Missing kinds use 0%" — implementation contradicted the contract.

## Pattern

> **When a caller provides a "partial spec", treat missing keys as
> the zero/null state, NOT as "use the default".** Otherwise a caller
> overriding 2 of 7 fields silently drags in the other 5 defaults.

Two cleaner patterns:

1. **Treat partial = full, missing = zero** (what we picked here).
2. **Require caller to pass the full spec** — TypeScript can enforce
   via `Required<>`, no merge logic at all.

Avoid the merge-with-defaults middle ground unless the partial-vs-full
intent is explicitly part of the API ("provide ONLY the deltas").

## How to spot in review

When a service accepts an optional `Partial<Record<K, V>>` and merges
it over a default `Record<K, V>`, ask:

- "If the caller passes `{a: 0}` thinking they zeroed `a`, do we
  silently bring back default `a`?"
- Document the merge semantics on the type (`/** Missing keys default
to 0 */` or `/** Missing keys keep the default */`) so the next
  reader doesn't have to re-derive it.
