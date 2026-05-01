# qa003 — Burst rate-limit on batched API calls

**First seen:** 2026-05-01 — CoinGecko 429s spamming logs, live leaderboard frozen at 0.00%.
**Severity:** product-visible — live PnL appears broken to user.
**Fix commit:** `f697873` (apps/api/src/lib/coingecko.ts).

## Symptom

Logs full of `coingecko marketsByIds failed status=429`. `tokens.last_updated_at` stale by >10 minutes. Live contest leaderboard shows
`$0 / 0.00%` for every entry because `current_price_usd` doesn't refresh.

## Root cause

`syncActive` cron runs every 15s. The token list (active-contest picks) often
exceeds 250, the CoinGecko `/coins/markets` per-page max. `marketsByIds`
batched into 250-id chunks but **fired them back-to-back** with no delay.
Total per cron tick: ~2 HTTP requests in ~1s → **per-second burst** trips
CoinGecko free-tier rate limit even when the per-minute quota is fine.

`syncCatalog` had a `pageDelayMs: 5000` between pages and never 429ed.
The pattern was already there — just not applied to `syncActive`.

## Pattern

> **Provider rate limits are typically tighter on per-second than
> per-minute.** A correct per-minute budget can still 429 if you fire
> the calls back-to-back. Always stagger sequential batches with at
> least a 5s gap on free tiers.

The minute budget is also misleading: `(60 / interval) × batches_per_call`
gives an under-estimate when the calls cluster. Multiply by burst factor.

## How to spot in review

When you see a `for (chunk of chunks) { await fetch(...) }` against a
third-party API, check:

- Is there a delay between iterations?
- What's the provider's per-second limit (most are ≤ 5/s on free)?
- If batches > 1 typical, add `setTimeout(resolve, 5000)` between.
