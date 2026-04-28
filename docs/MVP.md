# Fantasy Token League — MVP Spec

> Тактичний документ "що саме будуємо у першу версію". Single source of truth для scope, правил, edge cases.
>
> **Vision/контекст:** [PRODUCT_SPEC.md](PRODUCT_SPEC.md) (загальна ідея), [REFERENCES.md](REFERENCES.md) (конкуренти), [MVP Wireframes.html](MVP%20Wireframes.html) (екрани).
> **Контракти коду:** [INVARIANTS.md](INVARIANTS.md).
>
> **Status:** WIP. Збираємо через брейншторм-батчі. Section labels: 🟢 locked, 🟡 in-progress, 🔴 not started.
>
> **Last update:** 2026-04-28 (after Batch #3)

---

## 0. Scope summary

### In MVP

- 4 screens: **Lobby → Team Builder → Live → Result**
- Single in-app currency: **USD** (cent-precision integer)
- Welcome bonus: **$100 one-time** per TG ID
- **Bull-only contests** (Bear deferred to V2)
- **Free + paid** contests (rake configurable)
- **Bot fillers** for empty rooms (display-only, no prizes)
- Token catalog: **top 500–1000 from CoinGecko**, free-for-all in contests (no per-contest whitelist)

### Explicitly OUT of MVP (V2 or later)

- Bull/Bear distinction (formula `INV-4` frozen in code, deferred)
- Real Stars / TON payments (top-up modal = "Coming soon" stub)
- Per-contest token whitelist
- KYC, profile screen, history, settings
- **Push notifications + TG bot DMs** (deferred — see §10)
- **Share-to-chat card** (deferred — see §10)
- **Admin UI / proper admin auth** (interim allowlist for MVP — see §6.2)
- **Sentry / structured error tracking** (just logs for MVP — see §6.1)
- **i18n / multilingual UI** (English only for MVP — see §6.3)
- Multi-team per contest
- On-chain payouts, custom domain, full leaderboard screen
- Achievements, XP, levels, streaks, badges

---

## 1. Game mechanics 🟢

### 1.1 Portfolio rules

- Exactly **5 tokens** per entry
- Allocation: **integer percentage points, multiples of 5, range 5–80%** per token
- Sum of allocations = **100%** (client validates UX, server is source of truth)
- Once submitted: lineup **immutable** until contest ends (`INV-10`)

### 1.2 Currency model

- Single currency `USD`, stored as **integer cents** (`amount_usd_cents`, no float arithmetic on money)
- **Welcome bonus:** `WELCOME_BONUS_USD_CENTS=10000` ($100), one-time per TG ID, credited on first `/me` upsert
- **Top-up:** out of MVP. UI shows placeholder modal "Coming soon"
- **Future currencies** (V2): `STARS`, `TON` — schema supports via `currency_code varchar`, no migration needed

### 1.3 Rake

- `RAKE_PCT` env var, default `10`
- **Paid contests:** `prize_pool_cents = sum(entry_fees_cents) × (1 - RAKE_PCT/100)`
- **Free contests:** house-funded prize pool, set per contest at creation

### 1.4 Token universe

- **Source:** CoinGecko top-N by market cap
  - `/coins/markets?vs_currency=usd&per_page=250&page=1..2` → top 500
  - Stored fields: `coingecko_id, symbol, name, current_price_usd, pct_change_24h, market_cap_usd, last_updated_at`
- **"Free-for-all" model:** any token from catalog can be picked in any contest
- **No min market cap filter in MVP** — will revisit on first pump-and-dump abuse (record as `qaNNN` pattern)
- **No per-contest whitelist** (V2 feature)

### 1.5 Scoring

- Formula: `score = Σ (allocation_pct / 100 × pct_change_token)`
- Implemented in `packages/shared/scoring/` (already covers Bull and Bear via multiplier)
- `INV-4` (Bear inversion) — **frozen for MVP**, code preserved for V2 activation
- **Tie-break:** `submitted_at ASC` (earlier submission wins ties)
- **Precision:** `numeric(15, 9)` for stored scores

### 1.6 Edge cases

| Case                                 | Behavior                                                                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token rugpull / delisted mid-contest | Fix last known price; use as end-snapshot price. User chose the bag.                                                                                     |
| CoinGecko API outage (short, < 2h)   | Keep stale prices; log incident; live contests continue with stale data                                                                                  |
| CoinGecko API outage (long, ≥ 2h)    | **Halt new contest creation.** Live contests freeze on last known prices and continue scheduled finalization. Backup provider integration deferred (V2). |
| Contest cancelled mid-flight         | Manual admin trigger only. Refund all real-user `ENTRY_FEE` transactions.                                                                                |
| Token reappears after delisting      | Resume from new price; do not back-fix history                                                                                                           |

---

## 2. Contest lifecycle 🟢

### 2.1 States

```
scheduled  →  active  →  finalizing  →  finalized
                                     ↘  cancelled  (manual admin only)
```

### 2.2 Entry rules

- **Lock time:** at `startsAt` (no anti-frontrunning buffer; revisit in V2)
- **Single entry per (user_id, contest_id):** unique constraint
- **Insufficient balance:** reject with `402 insufficient_balance`; frontend opens "Coming soon" top-up modal
- **Real users pay** entry fee from USD balance via `CurrencyService.transact()` (`INV-9`)

### 2.3 Bot fillers 🟢

**Model.** Ghost entries — **no user record**. Schema:

```
entries.user_id    nullable
entries.is_bot     boolean (default false)
entries.bot_handle text (null for real users; e.g. "Bjorn_99")
```

**Picks.** Pure random — 5 random tokens from catalog, random valid allocations (multiples of 5, sum=100, 5–80% per token).

**Spawn timing.** At **lock time** (`startsAt`), in same DB transaction as start-phase price snapshot. Single atomic operation: lock entries → snapshot prices → spawn bots → contest goes `active`.

**Count formula.** `target_bots = max(BOT_MIN_FILLER, real_entries × BOT_RATIO)`.

- Defaults: `BOT_MIN_FILLER=20`, `BOT_RATIO=3` (env-configurable)
- 1 real user → 20 bots; 50 real → 150 bots; 1000 real → 3000 bots (cap by contest `max_capacity`)

**Prizes.** Bots are **display-only**. Excluded from prize distribution. See §3.2.

**Handle pool.** Pre-seeded list of ~200 plausible handles (e.g. "Bjorn_99", "ValkyrieX", "memequeen", "satoshi_jr"). Random per-bot at spawn time. No persistence — handle is per-entry.

### 2.4 Min participants

- **No minimum.** Contest runs even with 1 real participant.
- Bots ensure visual fullness.

### 2.5 Featured contest

- `contests.is_featured` boolean
- Set manually at creation by admin
- One at a time visible on Lobby hero (frontend picks `WHERE is_featured=true LIMIT 1`)

---

## 3. Prize structure 🟢

### 3.1 Payout curve (steep, hardcoded for MVP)

Applied to **real users only**, ranked by `final_score DESC, submitted_at ASC`.

Top 30% of real users pay. Within paying ranks:

| Position       | % of prize pool           |
| -------------- | ------------------------- |
| 1st            | 30%                       |
| 2nd            | 18%                       |
| 3rd            | 12%                       |
| 4th            | 7%                        |
| 5th            | 5%                        |
| 6–10           | 3% each (15% total)       |
| 11–20          | 1% each (10% total)       |
| 21st → top 30% | split remaining 3% evenly |

If `real_count × 0.3 < 21`, the last bucket scales to whatever positions exist. Pool always allocates 100% (rounding remainder goes to 1st).

Rationale: top-heavy creates "winner takes most" excitement (ref: DraftKings GPP). Configurable per-contest in V2.

### 3.2 Bots and prizes

- Top 30% pays applies to **real users only**
- Bot positions in leaderboard are **display-only**
- Example: 10 real users + 50 bots in contest. Display lineup may show bots at ranks #1, #2 (high random scores). Prize distribution computes ranks among the 10 real users only — top 3 real users (top 30% of 10) get prizes.

---

## 4. Currency / money flows 🟢

### 4.1 Schema

```
balances
  PK (user_id, currency_code)
  amount_cents bigint NOT NULL DEFAULT 0
  updated_at

transactions  -- immutable audit log; INV-9 source of truth
  id uuid PK
  user_id FK
  currency_code varchar(16)  -- 'USD' for MVP
  delta_cents bigint signed
  type        -- WELCOME_BONUS | ENTRY_FEE | PRIZE_PAYOUT | REFUND
  ref_type    -- 'contest' | 'entry' | null
  ref_id      -- foreign reference, denormalized
  created_at
```

### 4.2 Transaction types

| Type            | Direction | Trigger                | Reference |
| --------------- | --------- | ---------------------- | --------- |
| `WELCOME_BONUS` | credit    | First `/me` upsert     | null      |
| `ENTRY_FEE`     | debit     | User submits portfolio | entry_id  |
| `PRIZE_PAYOUT`  | credit    | Contest finalization   | entry_id  |
| `REFUND`        | credit    | Contest cancelled      | entry_id  |

### 4.3 Atomicity (`INV-9`)

All currency state changes go through `CurrencyService.transact()` inside DB transaction:

1. `INSERT INTO transactions`
2. `UPSERT balances SET amount_cents = amount_cents + delta`
3. `CHECK amount_cents >= 0` (no overdraft); rollback if violated

Direct `UPDATE balances` forbidden by code review. `balances` is denormalized cache; `transactions` is source of truth (any drift means we trust transactions and fix balances).

---

## 5. Architecture 🟡

### 5.1 Drizzle schemas to add (S1 work)

```ts
users           { id, telegram_id (unique), username, first_name, last_seen_at, created_at }
balances        { user_id FK, currency_code, amount_cents bigint, updated_at;
                  PRIMARY KEY (user_id, currency_code) }
transactions    { id uuid PK, user_id FK, currency_code, delta_cents bigint,
                  type, ref_type, ref_id, created_at }
tokens          { id, coingecko_id (unique), symbol, name,
                  current_price_usd numeric(30,9), pct_change_24h numeric(10,4),
                  market_cap_usd numeric(20,2), last_updated_at }
contests        { id, name, status, entry_fee_cents bigint, prize_pool_cents bigint,
                  max_capacity int, starts_at, ends_at, is_featured boolean,
                  created_by_user_id FK nullable, created_at }
entries         { id, user_id FK NULLABLE, contest_id FK, is_bot boolean default false,
                  bot_handle text NULL, picks jsonb, submitted_at,
                  current_score numeric(15,9), final_score numeric(15,9) NULL,
                  prize_cents bigint default 0, status;
                  UNIQUE (user_id, contest_id) WHERE user_id IS NOT NULL }
price_snapshots { contest_id FK, token_id FK, phase varchar(8),
                  price_usd numeric(30,9), captured_at;
                  PRIMARY KEY (contest_id, token_id, phase) }
```

### 5.2 Backend modules (per `apps/api/src/modules/CLAUDE.md`)

```
modules/users/        /me, upsert on auth, /me/balances
modules/tokens/       catalog list, search; sync via cron
modules/contests/     list, get, (admin) create
modules/entries/      submit, get-mine
modules/leaderboard/  compute live ranks (read-only view)
modules/currency/     transact, balance read
modules/admin/        protected endpoints (TG ID allowlist; see Batch #3)
```

### 5.3 Cron jobs

| Job                   | Frequency    | Action                                                                                                              |
| --------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------- |
| `tokens.sync.catalog` | every 60 min | Refresh full catalog (top 500) — 2 CoinGecko calls per run                                                          |
| `tokens.sync.active`  | every 5 min  | Refresh only tokens currently used in active contests; recompute leaderboards                                       |
| `contests.tick`       | every 1 min  | State transitions; on `lock`: snapshot start prices + spawn bots; on `end`: snapshot end prices + finalize + payout |

**CoinGecko free tier budget** (10K calls/month): catalog 2×24×30 = 1440. Active 1×12×24×30 = 8640 (assuming 1–2 active contests, ~12 calls/hour for sub-sets). Total ≈ 10K — at the edge of free. Headroom for V2 = paid tier ($129/mo Demo) or backup provider.

---

## 6. Invariants impacted (apply to `docs/INVARIANTS.md` after batch #3)

| INV      | Status    | Change                                                                                       |
| -------- | --------- | -------------------------------------------------------------------------------------------- |
| `INV-3`  | rewritten | "Allocations: rівно 5 токенів, multiple of 5 percent, 5–80% each, sum 100%" (was: $100K USD) |
| `INV-4`  | frozen    | Bear formula deferred to V2; code preserved in `packages/shared/scoring/`                    |
| `INV-9`  | new       | Currency state changes only via `CurrencyService.transact()` atomic operation                |
| `INV-10` | new       | Lineup picks immutable after `entries.submitted_at`                                          |

---

## 7. Open questions / batches

| Batch | Topic                                                                       | Status                                    |
| ----- | --------------------------------------------------------------------------- | ----------------------------------------- |
| #1    | Foundation (multi-user, bonus, rake, lock, tokens, cadence)                 | 🟢 locked                                 |
| #2    | Bots, prizes, edge cases                                                    | 🟢 locked                                 |
| #3    | Fallbacks, refresh cadence, performance target, observability, language     | 🟢 locked (some items deferred — see §10) |
| #4+   | (TBD when needed: V2 ramp criteria, growth mechanics, paid currency wiring) | 🔴 not started                            |

---

## 6. Operations 🟢

### 6.1 Observability (interim — MVP scope)

- **Backend logs:** pino structured JSON → Railway stdout. PII redacted via `INV-8` paths.
- **Frontend errors:** `ErrorBoundary` shows error to user; `console.error` lands in TG webview devtools (desktop only) and Vercel function logs (none for static deploy).
- **No Sentry / structured tracking** in MVP. Read Railway/Vercel logs manually when issues reported. Add Sentry in V2 (free tier 5K events/mo) once we have post-launch real users.

**Why interim is OK:** target launch audience = 10–50 alpha users (mostly known to us). When something breaks, we hear about it in TG and dig into logs directly. Investment in structured error tracking pays off post-soft-launch.

### 6.2 Admin auth (interim — MVP scope)

**Goal:** unblock S6 (admin endpoints for contest creation/cancellation) without designing the full admin model.

**Interim approach:**

- `ADMIN_TG_IDS` env var = comma-separated TG IDs. Example: `ADMIN_TG_IDS=61804306,141036202`.
- Backend middleware on `/admin/*` checks `if not (validatedUser.id in adminTgIds) → 403`.
- No admin UI in MVP — admin uses curl/Postman against `/admin/*` endpoints.

**Properly designed later:** admin scopes/roles, audit log of admin actions, admin UI inside Mini App with separate route gated by allowlist. Pending separate design pass; tracked in §10.

**Why interim is safe:**

- INV-1 still applies — admin requests still pass HMAC validation.
- Allowlist is in env, not in code; rotating means restart.
- Replacing with real admin model = 1 middleware change, rest of `/admin/*` code untouched.

### 6.3 UI language

- **MVP:** English only. No i18n machinery (`i18next`, key files, etc).
- All copy in components hardcoded.
- TG `language_code` ignored.
- **V2:** Ukrainian + auto-detect. Add `react-intl` or `i18next` then.

### 6.4 Performance targets (interim)

- **Concurrent users at launch:** 10–50 (closed alpha)
- **API:** Postgres pool size 10 (current default), no Redis cache, no CDN for API.
- **Polling load:** 30s × 50 users = ~1.7 req/s sustained. Trivial for Railway.
- **Scale-up trigger:** if concurrent active users >200 → consider Redis cache, larger pool, paid CoinGecko tier.

---

## 8. Sprint plan (preliminary, refined post-Batch #3)

| Sprint | Output                                                                                                                          | Status |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- | ------ |
| S1     | Drizzle schemas + migration; `/me` upsert + welcome bonus + balances; `CurrencyService` with tests; `/contests` list with seeds | 🔴     |
| S2     | CoinGecko sync + Lobby UI with live data                                                                                        | 🔴     |
| S3     | Team Builder: token search, allocation UI, entry submit                                                                         | 🔴     |
| S4     | Bot spawning at lock + price snapshots + Live UI with leaderboard                                                               | 🔴     |
| S5     | Contest finalization + prize distribution + Result UI + share-card                                                              | 🔴     |
| S6     | Admin endpoints (interim allowlist) for contest creation + tooling                                                              | 🔴     |

---

## 10. Deferred decisions

These were considered but pushed out of MVP scope. Each has a "trigger" — a signal indicating it's time to revisit.

| Topic                                 | Default placeholder for MVP                                                     | Trigger to revisit                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Notifications (TG bot DMs + push)** | None. User opens app manually.                                                  | Soft-launch metrics show return rate < target → introduce DMs for "contest starting" + "you won".                     |
| **Share-card (server-rendered PNG)**  | "Share" button on Result either disabled or text-only `t.me/share/url`.         | When organic referrals become a meaningful funnel; design a card layout + render via `@vercel/og` or `satori`.        |
| **Admin proper UI / roles**           | Interim allowlist via `ADMIN_TG_IDS` env, curl/Postman.                         | When >2 ops people need to create contests, OR when audit trail becomes required. Design separately.                  |
| **Sentry / error tracking**           | Pino logs + Railway/Vercel manual reading.                                      | Concurrent users >200 OR first incident where logs aren't enough to diagnose.                                         |
| **i18n**                              | English only, no machinery.                                                     | First UA user complaint OR before broader launch in UA-speaking crypto communities.                                   |
| **CoinGecko backup provider**         | Halt on long outage.                                                            | First sustained outage that affects scheduled contests.                                                               |
| **Real Stars / TON payments**         | USD virtual only. Top-up modal = "Coming soon".                                 | When MVP gameplay loop validated and gameplay metrics show paying intent (e.g., users repeatedly hitting top-up CTA). |
| **Bull/Bear distinction**             | Bull-only. Code preserved in `packages/shared/scoring/`.                        | When MVP retention stable; Bear leagues = differentiator for V2 launch.                                               |
| **Per-contest token whitelist**       | Free-for-all. Any catalog token can be picked.                                  | Theme-based contests ("Memecoin Madness", "L1 only", etc.) when product needs more variety.                           |
| **Min market cap filter**             | None. `MIN_TOKEN_MARKET_CAP_USD` constant exists in `packages/shared` as no-op. | First pump-and-dump abuse incident.                                                                                   |
| **Cron-based contest auto-creation**  | Manual via admin endpoint.                                                      | Manual creation becomes burden (>1 contest/day).                                                                      |
