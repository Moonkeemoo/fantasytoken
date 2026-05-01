# qa001 — Substring HTTP-status match in error handlers

**First seen:** 2026-05-01 — TopUp modal opening on free contest submit.
**Severity:** product-visible — wrong UI surface on real-user error.
**Fix commit:** `7b406e6` (apps/web/src/features/team-builder/TeamBuilder.tsx).

## Symptom

User submits lineup on a free Practice contest. Backend returns
`CONTEST_CLOSED` (409). Frontend opens the **Top Up Coins** modal
instead of showing the closed-contest error.

## Root cause

`api-client.ts` formats errors as `Error: API ${status} ${path}: ${body}`.
The team-builder submit handler matched
`msg.includes('INSUFFICIENT_COINS') || msg.includes('INSUFFICIENT_BALANCE') || msg.includes('402')`
to decide whether to open the top-up modal.

The path embeds a contest UUID. Roughly **1% of UUIDs contain the
substring "402"** (16-hex × 32 chars). The Practice contest had id
`7ea13272-8ae2-4362-a402-9bcbb77c877a` — the literal `a402`. Pattern
matched, modal opened, real `CONTEST_CLOSED` swallowed.

## Pattern

> **Don't substring-match HTTP status codes (or any short numeric
> token) inside arbitrary stringified URLs/payloads.** Hex UUIDs,
> price values, IDs, request paths — any of them can collide with
> short numeric patterns. False positives are stochastic but
> guaranteed at scale.

Match the explicit error code from the structured body, or extract
the status with a strict regex (`/^Error: API (\d+) /`).

## How to spot in review

Grep for `.includes('4` or `.includes('5` (HTTP status code shorthand)
inside error handlers. Replace with code-only matches.
