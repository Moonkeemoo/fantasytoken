# qa008 — Postgres volume full masquerades as API "CONNECT_TIMEOUT"

**First seen:** 2026-05-02 — production prod-down, ~1.5h. API service in
crash-loop with apparent network failure to `postgres.railway.internal`.
**Recurrence:** 2026-05-03 — same volume cap (500 MB) refilled within
24h of the wipe+reseed, even with bots disabled and cohort=100. Recovery
worse this time: PG could not even complete WAL redo (FATAL inside
recovery, not after), so no DELETE was possible without resize. Required
volume wipe + full reseed.
**Severity:** prod-down — `/health` unreachable, custom domain stopped
resolving (Railway pulled CNAME for unhealthy deployment).
**Fix:** rotation cron `sim.rotate` shipped 2026-05-03 caps the three
known synth-cohort growth sources. See "Structural fix" below.

## Symptom

API container, on every restart, dies during the `pnpm db:migrate` pre-deploy step:

```
[⣽] applying migrations...   ← spinner stalls for 30s
Exit status 1
Error: write CONNECT_TIMEOUT postgres.railway.internal:5432
    at connectTimedOut (postgres/src/connection.js:262:20)
  code: 'CONNECT_TIMEOUT',
  address: 'postgres.railway.internal',
  port: 5432
```

Custom domain stops resolving externally (Railway edge unhooks CNAME
for repeatedly failing deployments). At the surface this looks like a
DNS / internal-networking glitch.

## Root cause

The Postgres service is the actual victim, but its symptom is
invisible to anyone reading API logs. Service log on the Postgres
side shows it stuck in a recovery crash-loop:

```
LOG:  database system was interrupted while in recovery
LOG:  redo starts at 1/64F26F90
LOG:  redo done at 1/6DFFF518   ← recovery itself succeeds
FATAL: could not write to file "pg_wal/xlogtemp.33":
       No space left on device
LOG:  startup process (PID 33) exited with exit code 1
LOG:  shutting down due to startup process failure
```

The `postgres-volume` was at **495 MB / 500 MB** (Railway default for
the Postgres template). Postgres replays WAL successfully but cannot
write the next WAL temp segment, so it never reaches "ready to accept
connections". TCP port 5432 stays unbound for clients (the Railway
TCP proxy port itself is open — that's a process _upstream_ of
Postgres — so a naive `nc -z` probe is misleading).

API container, blind to all of that, just sees TCP `connect()` not
completing within the postgres-js timeout (30 s) and reports
`CONNECT_TIMEOUT`. The chain is:

> volume nospace → Postgres won't bind 5432 → API can't connect →
> deploy fails 3× → Railway gives up → custom domain unhooked →
> "сервак впав".

The data growth that filled the volume was uncapped synthetic-user
activity (TZ-005, ADR-0006): `entries`, `synthetic_actions_log`,
`tick_history`, plus accumulated `pg_wal` from churn. With cohort=2400
and bots disabled (2026-05-01) the sim-only writers had no natural
ceiling.

## Pattern

> **An API "DB connection timeout" in a managed-Postgres setup is
> often the database refusing to bind, not the network refusing to
> route. Always check the Postgres service's own logs and volume
> utilisation before chasing networking.**

Three systemic reasons this hides:

1. **Wire symptom is the same** as a real network outage. `code:
CONNECT_TIMEOUT` does not distinguish "no route" from "process
   never opened the port".
2. **Public TCP proxy stays up** independent of the Postgres process,
   so `nc -zv <proxy>:5432` shows "succeeded" while connections still
   hang. Probe with an actual `psql` / `pg_isready`, not a port scan.
3. **Recovery completes BEFORE the FATAL,** so the log shows
   `redo done` (looks like success) one line before the disk dies.
   Don't stop reading at the first "good" line.

## Diagnosis checklist (run in this order)

1. `railway logs --service Postgres | tail -50` — look for FATAL,
   "shutting down", "No space left".
2. `railway volume list` — anything ≥80% used is a fire.
3. Connect via public proxy: `psql $DATABASE_PUBLIC_URL -c 'SELECT 1'`
   — if this also hangs, Postgres is genuinely down (not networking).
4. Only then suspect Railway internal networking (rare).

## Fix

**Immediate (volume already full):**

- Resize the Railway volume in dashboard (Postgres service → Settings →
  Volume) — at least 4× current ceiling. Volume grow is online; Postgres
  will finish recovery once it has room.
- CLI cannot resize: `railway volume update` only changes name /
  mount-path, no `--size` flag (as of 2026-05).
- If a full wipe is acceptable (Day-0 stage): `DROP SCHEMA public
CASCADE; CREATE SCHEMA public;` then redeploy — `db:migrate` rebuilds
  the schema. We did this on 2026-05-02; took the volume from
  495 MB → 98 MB (post-migration baseline).
- `DELETE` alone does not free disk; bloated tables need `VACUUM FULL`,
  which itself needs free space — so resize first, then vacuum.

**Preventive:**

- Alert at 80% volume utilisation in `prod-health-sentry` (currently
  HTTP-only — see `reference_routines.md`).
- Cap synthetic-data tables in storage budget. INV-17 covers this.

## Structural fix (2026-05-03)

`apps/api/src/sim/rotate.service.ts` — `sim.rotate` cron, every 10 min
(gated on `SIM_ADMIN_ENABLED`, same surface as `sim.tick`). Three
deletes, in order, then `VACUUM` on touched tables:

| Table                   | Retention            | Filter                                                                                                      |
| ----------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `synthetic_actions_log` | 2 h                  | all rows past cutoff (table is synth-only by design)                                                        |
| `transactions`          | 24 h                 | `user_id` is `is_synthetic=true` only — INV-9 protects real-user audit                                      |
| `contests` (finalized)  | 24 h after `ends_at` | iff zero `entries.user_id` belongs to a real user — cascade kills synth + bot entries and `price_snapshots` |

What is intentionally **not** trimmed:

- Synth `users` themselves — sim.config keeps a stable cohort of 100.
  Old log/tx/entry rows for those users still go.
- Real-user anything — INV-9 (transactions) and the contest-history
  guarantee (entries via the EXISTS clause).
- `referrals` / `xp_events` / `friendships` — small enough to be
  bounded by user count, not activity rate. Revisit if they show up in
  `pg_stat_user_tables` post-fix.

Why these three only: the symptom budget was 500 MB / 24h. Code audit
estimated `synthetic_actions_log` at ~100 MB/day (3 indexes + jsonb
payload, per-tick inserts) and synth `transactions` at the next biggest
bucket. Finalized contests piled up because no cleanup existed at all
— even one a minute over 24h is 1440 unused rows plus their
`price_snapshots`+`entries` cascades.

If volume usage continues to creep after this lands, the next probe is
`SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) FROM
pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT
10;` — extend the rotation list with whatever tops it.

## Misleading signals to ignore

- API logs talk about networking; they always will. Postgres logs are
  the source of truth for DB state.
- `nc -z proxy.rlwy.net 5432` succeeds — meaningless, that hits
  Railway's TCP proxy not Postgres.
- `dig` on custom domain returns NXDOMAIN — Railway-edge behaviour for
  unhealthy deployments, not actual DNS deletion. Will return as soon
  as `/health` returns 200 again.

## Related

- INV-17 (volume budget alarm).
- `reference_routines.md` — `prod-health-sentry` should add disk-usage
  probe alongside HTTP.
