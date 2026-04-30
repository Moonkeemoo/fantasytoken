# ADR-0003: Team Builder Allocation Granularity and Virtual Budget UX

**Status:** Accepted
**Date:** 2026-04-30

## Context

TZ-001 Team Builder redesign (`docs/specs/team-builder-redesign/`) переосмислює UX вибору лайнапу: рішення гравця має бути **розраховуване в доларах**, а не у відсотках. Дві з закладених у дизайн механік суперечать ADR-0002 (прийнято 2026-04-28):

1. **Allocation granularity.** Прототип використовує `step=1%`, `min=0%`, `max=100%` per token. ADR-0002 закріпив `step=5`, `min=5`, `max=80`.
2. **Virtual budget surface.** Прототип робить `$100K` (а в подальшому `$1M`) видимим параметром контесту і будує весь Draft/Live навколо $-сум. ADR-0002 свідомо прибрав $-budget як концепт ("замінено на 100% allocation").

ADR-0002 зробив правильний крок — позбавив старий інваріант розриву з реалізацією. Але дизайн-роботa, виконана після нього, показала що:

- 5%-step з 5–80% range — не математична властивість гри, а UX-милиця ери "fixed budget slider". Він обмежує мікро-стратегії (1–3% pick як спекулятивний "lottery slot"), які природно з'являються коли є $ як одиниця мислення.
- Сума у $ як головна цифра дає гравцю **calculable** рішення ("якщо PEPE +20%, я зароблю $4K"). Це core differentiator проти %-only поглядів типу "Paper Trade".

## Decision

### 1. INV-3 ревізія (друга версія MVP)

**Old (ADR-0002, 2026-04-28):**

> Allocation портфеля: рівно 5 токенів, кожен % є multiple of 5, range 5–80%, сума всіх часток рівно 100%.

**New (ADR-0003, 2026-04-30):**

> Allocation портфеля: рівно 5 токенів, кожен alloc — ціле число (`step=1`), `0 ≤ alloc ≤ 100`, сума всіх часток рівно 100%.

Що залишається священним: **5 токенів, sum=100, integers**. Що знімається: жорсткий [5,80] коридор та multiple-of-5.

### 2. Virtual budget як UX-layer

Контест отримує поле `virtualBudget: number` (USD-cents-equivalent для display). Frontend конвертує `alloc%` ↔ `$` для всіх ключових сум (slot, hero, AllocSheet input). **Backend не змінюється** — score-функції, snapshot цін, payout розрахунок продовжують жити в `alloc%` як абстракції портфеля. `virtualBudget` — суто display-параметр.

Це не повертає старий "fixed $100K budget" концепт. Це **другий UX-layer над тим самим %-domain'ом**.

### 3. Bot-generated lineups зберігають свою логіку

`apps/api/src/lib/random-picks.ts` отримує **приватні** константи `BOT_STEP=5, BOT_MIN=5, BOT_MAX=80`. Public-constants з `@fantasytoken/shared` керують лише user-input валідацією. Причина: random allocation з step=1 на 5 слотах генерує bizarre-розподіли типу `[3, 47, 12, 31, 7]`, які виглядають як шум у leaderboard. Боти повинні виглядати як гравці, а не як random-noise generators.

## Why

- **Stratification value of 1%-step:** з step=5 у гравця 16 валідних "ваг" (5,10,…,80). З step=1 — 80+. Це не overload — більшість гравців тримається round-чисел, але ті хто хочуть мікро-pick (1% PEPE як lottery, 99% рознесено серед мейджорів) отримують справжню стратегічну глибину. У DraftKings analog'ах 0.1%-step не приходить тому що там salary cap, а не % — у нашій моделі обмеження немає.
- **Min=0 спрощує AllocSheet UX:** немає окремого state "що робити з невикористаним слотом". Slider може дотягнутись до 0 → користувач натискає Remove. Один state, одна модель.
- **$-first calculability — основна теза TZ.** % дають _вагу_ але не _ставку_; $ дають обоє. У всіх тестах прототипу гравці інтуїтивно розуміють "$30K на PEPE" швидше ніж "30% на PEPE". Це не косметика — це core UX-thesis. ADR-0002 не міг це передбачити, бо TZ-001 ще не існував.
- **Backend stability:** оскільки `virtualBudget` — display-only, ніяких міграцій DB чи зміни scoring не потрібно. INV-2 (price snapshot immutability) не торкаємо. INV-9 (CurrencyService) не торкаємо. Це чистий зсув UX-layer'а.

## Consequences

- `packages/shared/src/constants.ts`:
  - `ALLOCATION_STEP_PCT` 5 → 1
  - `ALLOCATION_MIN_PCT` 5 → 0
  - `ALLOCATION_MAX_PCT` 80 → 100
  - `PORTFOLIO_TOKEN_COUNT`, `PORTFOLIO_PCT_TOTAL` — без змін
- `packages/shared/src/schemas/entry.ts` — zod-валідація релаксується автоматично через нові константи. Старі entries (multiples-of-5, [5,80]) залишаються валідними; нові entries отримують більше свободи. Зворотна сумісність забезпечена.
- `apps/web/src/features/team-builder/lineupReducer.ts` — внутрішня логіка `addToken`/`bumpAlloc`/`isValid` не змінюється структурно (всі читають константи). Перший токен тепер отримує 100% (у попередньому контракті обрізалося до 80%). Тести оновлюються.
- `apps/web/src/features/team-builder/TokenResultRow.tsx` — `±` buttons тимчасово стають `±1%`. Перебудовується у Milestone 4 (заміна на AllocSheet trigger).
- `apps/api/src/lib/random-picks.ts` — переходить на приватні константи `BOT_STEP=5, BOT_MIN=5, BOT_MAX=80`. Поведінка bot-lineup'ів зберігається бітова, тести не змінюються.
- `apps/web/tailwind.config.ts` — додаються `--bull`, `--bear`, `--gold` для $-first колірної мови (Milestone 1).
- Нове поле `virtualBudget` додається до contest API response у міру виконання Milestone 4. Поки відсутнє — frontend fallback'ить на `100_000`.

## Alternatives considered

- **Залишити INV-3 жорстким (`step=5, min=5, max=80`):** відкинуто — змушує дизайн TZ-001 регресувати до ери "fixed budget slider", вбиває мікро-pick стратегії, конфліктує з $-first thesis.
- **`step=1, min=1, max=99`:** відкинуто — `min=1` створює edge case "5 токенів × 1% = 5% sum", який ламає sum=100. `max=99` неупорядкований: чому не 95? Найпростіше — `[0, 100]`. Лайнап з 100% на одному токені — це "valid but degenerate strategy", це не наша справа дизайну блокувати.
- **Drop `5 токенів exactly`, дозволити 1–5:** відкинуто — це ламає ціль контесту як "diversify-or-concentrate trade-off". Кількість слотів — фундамент гри.
- **Reintroduce `PORTFOLIO_BUDGET_USD=100_000` як inviolable constant:** відкинуто — `virtualBudget` per-contest потрібен для tier-mechanic (різні контести з різними бюджетами). Hard-coded constant суперечить це.

## Migration

- Жодних DB-міграцій.
- Жодних API breaking changes (zod просто релаксується).
- Старі lineup'и в production продовжують validate-итись (multiples-of-5 — це підмножина step=1).
- TZ-001 implementation продовжує з Milestone 1.
