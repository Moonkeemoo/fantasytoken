# qa004 — FK column-name drift in cascade-delete logic

**First seen:** 2026-05-01 — `pnpm sim:wipe` failed at runtime against prod.
**Severity:** ops-blocking — wipe operation rolled back, no data lost,
but operator stuck.
**Fix commit:** `0babc62` (apps/api/src/sim/wipe.repo.ts).

## Symptom

```
PostgresError: column "user_id" does not exist
```

inside the wipe transaction, after most of the cascade had succeeded.

## Root cause

The wipe.repo issued `DELETE` statements against multiple tables that
held FKs to `users`. Two of them used different column names than the
hand-written wipe queries assumed:

| table              | wipe assumed                                                 | actual                                |
| ------------------ | ------------------------------------------------------------ | ------------------------------------- |
| `bot_dm_queue`     | `user_id`                                                    | `recipient_user_id`                   |
| `referral_payouts` | `recruiter_user_id`, `recruit_user_id`, `created_by_user_id` | `recipient_user_id`, `source_user_id` |

The unit tests for `wipe.service` used a fake repo (no SQL ran), so
nothing caught the column-name drift until the SQL hit real Postgres.

## Pattern

> **Hand-written cascade-delete queries that name columns directly are
> brittle against schema drift.** Even with TypeScript types they
> bypass the type system because the SQL is in a `sql\`` template.

Two mitigations:

- **Use Drizzle's typed query builder** for cascade deletes when feasible;
  it catches column-name drift at compile time.
- **Integration test the repo against a real DB** at least once per CI
  run. Service-level tests with fake repos don't catch SQL drift.

## How to spot in review

Search for `DELETE FROM <table> WHERE <col>` in raw SQL templates.
Cross-check `<col>` against the corresponding `db/schema/<table>.ts`
file. Mismatches should be rare; when found, refactor to typed
Drizzle calls if possible.
