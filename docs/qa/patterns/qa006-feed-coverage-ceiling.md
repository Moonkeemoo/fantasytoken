# qa006 — Live-feed coverage ceiling per exchange (and Railway-side block)

**First seen:** 2026-05-01 — task #41 ("Drive Bybit feed coverage to ≥95%")
revealed Bybit + OKX combined cap out at ~50% of our 519-token catalog.
A Gate.io 3rd feed was added next, but Railway's egress IP is silently
black-holed by Gate's WS endpoint — locally the same code works, in prod
every connection idles for exactly 60s and closes with code=1006.
**Severity:** product expectation mismatch + an environment-specific block
that doesn't surface as an error.
**Fix commits:** `c792593` (added Gate.io), reverted next commit (Railway-blocked).

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
> have no live source — only CoinGecko cron. Always probe the candidate
> exchange from the actual prod IP before counting on it — Railway and
> similar US-egress hosts are quietly blocked by some endpoints.**

The Railway-side block looks like this in logs:

```
gateio.ws.open       symbolCount=519
(60 seconds of silence)
gateio.ws.closed     code=1006 backoffMs=1000
```

No subscribe response, no error frame, no data. The local probe
(`apps/api/scripts/probe-gateio.ts`) hits the same URL with the same
payload and gets a `result.status:"success"` reply within 1s plus a
continuous update stream. The disconnect is a server-side idle close
because our subscribe never registers on their end — a near-silent block.

Diagnostic recipe (committed at `apps/api/scripts/check-feed-gap.ts`):

1. Fetch each exchange's USDT-spot instrument list via public REST.
2. Intersect with our catalog symbols.
3. Tally the four buckets: only-A / only-B / both / neither.
4. Sort the "neither" bucket by current age — that's where you decide
   whether to add a 3rd exchange or drop the symbol from the catalog.

Coverage strategy that emerged:

- **Bybit + OKX**: top-tier liquidity (~50% of catalog).
- **Gate.io tried, blocked from Railway** — kept in qa006/git log as a
  pre-known dead end.
- **MEXC tried locally, returns explicit `Reason: Blocked!`** — same
  Asian-exchange anti-US-egress story.
- **CoinGecko cron**: 60s fallback for the residue (~50% of catalog).
  Tried 15s cadence — triggered the qa003 burst rate-limit; reverted.
- **Per-symbol drop**: review tokens with `age > 1d` quarterly — these
  are usually delisted and shouldn't be in a "top 500" basket anyway.

## Where this leaves the "≥95%" target

Practically infeasible at the current setup. Realistic outcomes:

- ~35% of the 519-token catalog refreshes <30s (Bybit/OKX active).
- ~50% refreshes <60s (live feed + half of the CG cron cycle).
- ~93% refreshes <5min (full CG cron cycle covers everything).

To break past ~50% < 30s would require:

1. Self-host outside US so MEXC/Gate accept us (infrastructure change).
2. Pay for CoinGecko Pro (per-second burst headroom, predictable).
3. Drop the long-tail tokens from the catalog so the denominator is
   what live feeds CAN cover.

## How to spot in review

When someone files a "make X% of {N items} fresh" task, run the diagnostic
first. If the chosen source covers <X% of N at the supplier level, the
task is unmeetable by tuning that source — it needs another supplier
or a smaller N.
