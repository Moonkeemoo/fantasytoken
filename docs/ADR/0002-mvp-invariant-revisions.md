# ADR-0002: MVP Invariant Revisions

**Status:** Accepted
**Date:** 2026-04-28

## Context

MVP spec (`docs/MVP.md`) фіксує:

- Single virtual currency USD у cents (не Stars/TON, не $100K budget).
- Allocation у percentage points 5–80 multiples of 5, sum=100.
- Bull-only ліги; Bear deferred to V2.
- Currency state changes через єдиний atomic-transact patern.
- Lineup immutability після submit.

`docs/INVARIANTS.md` v1 (2026-04-27) описував старі правила: $100K budget (INV-3), Bear як активна механіка (INV-4); і не мав інваріантів про currency atomicity або lineup immutability.

## Decision

- **INV-3** переписаний: рівно 5 токенів, multiples of 5%, 5–80% per token, sum 100%. Будж $100K концептуально замінено на 100% allocation.
- **INV-4** позначений як `FROZEN for MVP`. Код у `packages/shared/scoring/` зберігаємо для V2 unfreeze; UI нічого не показує юзеру з Bear.
- **INV-9** додано: `CurrencyService.transact()` — єдина точка зміни currency state; transaction-rollback при overdraft.
- **INV-10** додано: lineup picks immutable після submit.

## Why

- INV-3 v1 описував концепцію, яку MVP не реалізує. Залишити стару форму = розхождення між інваріантом і кодом → INV перестає бути контрактом.
- INV-4 freeze фіксує що код у `scoring/` не "мертвий" — він зберігається свідомо під V2.
- INV-9 кодує найкритичніший money-invariant; без нього легко поламати атомарність payout flow.
- INV-10 фіксує контракт що хто-небудь міг би "не помітити" — `entries.picks` JSONB виглядає мутабельно.

## Consequences

- `packages/shared/scoring/scoring.test.ts` продовжує тестувати Bull і Bear, бо код не видаляється.
- Існуюча константа `PORTFOLIO_BUDGET_USD = 100_000` вже не описує MVP-реальність; зберігаємо як технічний параметр функції scoring (вона все ще приймає `totalBudgetUsd: number`), додаємо нові MVP-константи (`PORTFOLIO_PCT_TOTAL = 100`, `ALLOCATION_STEP_PCT = 5`, `ALLOCATION_MIN_PCT = 5`, `ALLOCATION_MAX_PCT = 80`).
- Будь-яка зміна `currency` flow без `CurrencyService.transact()` ловиться code review (INV-9).

## Alternatives considered

- **Видалити INV-4 повністю:** відкинуто — тоді код у `scoring/` виглядає як мертвий, і хтось може його прибрати. FROZEN marker зберігає намір.
- **Залишити INV-3 як є:** відкинуто — старий інваріант ($100K) не збігається з реалізацією (% allocation) → INV перестає бути контрактом на практиці.
