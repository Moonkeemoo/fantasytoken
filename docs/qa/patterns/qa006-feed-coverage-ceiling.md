# qa006 — Live-feed coverage ceiling per exchange

**First seen:** 2026-05-01 — task #41 ("Drive Bybit feed coverage to ≥95%")
revealed Bybit + OKX combined cap out at ~50% of our 519-token catalog.
**Severity:** product expectation mismatch, not a bug. Caught at the moment
we measured prod freshness.
**Fix commit:** see `feat(prices): add Gate.io feed for long-tail coverage`.

## Symptom

```
=== Coverage tally (519 tokens) ===
  on Bybit          : 229 / 519 (44.1%)
  on OKX            : 183 / 519 (35.3%)
  on either         : 261 / 519 (50.3%)
  on neither        : 258 / 519 (49.7%)
  currently <30s    : 183 / 519 (35.3%)
```

The `<30s fresh` ceiling tracked exchange listings: every additional
percentage point required either another exchange to subscribe to, or
accepting the truly illiquid tail.

## Root cause

Bybit and OKX index toward serious USDT spot pairs (~459 / ~296). The
top-500-by-mcap cohort includes a long tail of memecoins, gaming tokens,
RWA stablecoins (BUIDL, ACRED, USTBL, FIUSD, FDIT, EARNETH) that simply
don't list on those two. The "≥95% via Bybit alone" framing was infeasible.

## Pattern

> **A live-feed coverage target above ~50% requires ≥3 exchanges, and
> above ~90% requires accepting that some catalog tokens (RWA, illiquid)
> have no live source — only CoinGecko cron.**

Diagnostic recipe (committed at `apps/api/scripts/check-feed-gap.ts`):

1. Fetch each exchange's USDT-spot instrument list via public REST.
2. Intersect with our catalog symbols.
3. Tally the four buckets: only-A / only-B / both / neither.
4. Sort the "neither" bucket by current age — that's where you decide
   whether to add a 3rd exchange or drop the symbol from the catalog.

Coverage strategy that emerged:

- **Bybit + OKX**: top-tier liquidity (~50% of catalog).
- **+ Gate.io**: long-tail memes/L1s (~30 more percentage points).
- **CoinGecko cron**: 60s fallback for the residue (RWA + dead listings).
- **Per-symbol drop**: review tokens with `age > 1d` quarterly — these
  are usually delisted and shouldn't be in a "top 500" basket anyway.

## How to spot in review

When someone files a "make X% of {N items} fresh" task, run the diagnostic
first. If the chosen source covers <X% of N at the supplier level, the
task is unmeetable by tuning that source — it needs another supplier
or a smaller N.
