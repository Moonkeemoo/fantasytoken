# Lineup Simplification — Equal Split (TZ-003)

> **Контекст:** TZ-001 (Team Builder Redesign) уже реалізований у репо. Цей документ — **наступна ітерація поверх нього**: радикальне спрощення allocation-механіки.
>
> **One-liner:** прибираємо ручний allocation. Гравець обирає 1–5 токенів — бюджет розподіляється рівномірно автоматично.

---

## 1. Що міняється (суть)

**Було (TZ-001, у проді):**

- 5 токенів обов'язково
- Per-token allocation 5–80%, сума = 100%
- AllocSheet модалка для управління кожним пиком
- INV-3: multiples of 5%, sum=100, length=5

**Стає (TZ-003):**

- Гравець обирає **1–5 токенів** (будь-яка кількість)
- Allocation **автоматично** ділиться рівномірно: `100 / picks.length` на кожен токен
- AllocSheet **видаляється повністю** з кодової бази
- Стратегія тепер виражається через **count**:
  - 1 токен = all-in (max conviction)
  - 2 токени = 50/50 hedge
  - 3 = ~33% each (з round-off rule)
  - 4 = 25% each
  - 5 = 20% each

**Чому:**

1. Усуває головне UX-тертя (allocation step)
2. Повертає гру до жанрових конвенцій fantasy ("pick a team", не "trade")
3. Drive-by драфт за 3 секунди
4. Stratégia не зникає — компресуєтся в `lineup.length`

---

## 2. UI behavior changes

### 2.1 Slot interaction

- **Tap на filled slot** → одразу видалення токена. Без модалки. Без меню.
- **Tap на empty slot** → нічого не робить. Empty slots — це візуальний placeholder, не CTA.
- Add токена відбувається тільки через `<TokenResultRow>` у списку.

### 2.2 Token row interaction

- **Tap на token row** (не in-team) → додає до lineup. Якщо lineup повний (5/5) — toast `Lineup full · remove a token first`.
- **Tap на token row** (in-team) → видаляє з lineup. Симетрично.
- Жодних модалок взагалі.
- Візуальний state `in-team` лишається (підсвічування рядка).

### 2.3 Slot display

Кожен filled slot показує:

- Token icon
- Sym
- $ amount (auto-computed: `Math.round(tier * 100 / picks.length / 100)` у centах)
- Без % — бо вже зрозуміло з кількості ("я взяв 2, значить 50/50")

### 2.4 Lineup label

Замість `2/5 · $40K · 40%` — простіше:

```
Your lineup (budget $100K)        2 picks · $50K each
```

### 2.5 GO button states (спрощення)

- `lineup.length === 0` → `PICK 1+ TOKENS` (disabled, paper-deep bg)
- `lineup.length >= 1 && <= 5` → `GO BULL · N 🪙 entry` (active, bull green або bear red)
- Більше **немає** станів `ALLOCATE X% MORE` / `OVER BUDGET BY X%` — вони були artifact'ами allocation-логіки яка зникла.

### 2.6 Allocation bar

**Видаляється.** Раніше показувала прогрес до 100%. Тепер progress нерелевантний (валідація лише по count).

Замість бару — простий лічильник у lineup label `2 picks` з підказкою `up to 5`.

---

## 3. Code changes — file by file

### 3.1 Видаляється повністю

| File                                                                              | Reason                                                                         |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `apps/web/src/features/team-builder/AllocSheet.tsx`                               | Не потрібний                                                                   |
| `apps/web/src/features/team-builder/LineupSlot.tsx` (якщо tap-to-edit логіка там) | Slot стає чистим display компонентом — інтегрувати назад у `LineupSummary.tsx` |

### 3.2 Спрощується

| File                                                    | Change                                                                                                                                                                                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/team-builder/lineupReducer.ts`   | **Видалити** `UPDATE_ALLOC` action. Залишити `ADD_PICK`, `REMOVE_PICK`, `RESET`, `APPLY_PRESET`. У `ADD_PICK` тепер payload тільки `{ sym }` — alloc не передається. У `APPLY_PRESET` payload `{ syms: string[] }` — без alloc'ів |
| `apps/web/src/features/team-builder/useDraft.ts`        | **Видалити** `openSheet` / `closeSheet` / `remainingPct` selector. Додати `evenAllocPct = lineup.length > 0 ? 100 / lineup.length : 0` selector                                                                                   |
| `apps/web/src/features/team-builder/DraftScreen.tsx`    | Прибрати рендер `<AllocSheet>`. Прибрати state `sheetToken`. Token row `onClick={() => addOrRemove(t)}`. Slot `onClick={() => removeBySlotIdx(i)}`                                                                                |
| `apps/web/src/features/team-builder/TokenResultRow.tsx` | onClick тепер toggle (add/remove). Visual state `in-team` без змін                                                                                                                                                                |
| `apps/web/src/features/team-builder/ConfirmBar.tsx`     | Спрощений GO state machine: тільки `idle` (lineup empty) і `ready` (lineup 1–5). Без `alloc` / `over`                                                                                                                             |
| `apps/web/src/features/team-builder/LineupSummary.tsx`  | Slot tap = remove. Без alloc% всередині slot. Compact `$amount each` під лайн label'ом                                                                                                                                            |

### 3.3 API contract change

**POST /entries — новий payload:**

```ts
// БУЛО (TZ-001):
{
  contestId: string,
  picks: [
    { sym: 'PEPE', allocPct: 30 },
    { sym: 'SOL', allocPct: 25 },
    ...
  ]
}

// СТАЄ (TZ-003):
{
  contestId: string,
  picks: ['PEPE', 'SOL', 'WIF']   // sym list, 1–5 items
}
```

**Backend logic:**

- Validation: `picks.length >= 1 && picks.length <= 5`, всі sym унікальні
- Compute allocations evenly з round-off rule (див. §4)
- Зберігати в `entries.picks` як array з allocations як раніше — це internal representation:
  ```ts
  // після обчислення
  picks: [
    { sym: 'PEPE', allocCents: 3334 }, // 33.34% = 3334 basis points (cents)
    { sym: 'SOL', allocCents: 3333 }, // 33.33%
    { sym: 'WIF', allocCents: 3333 },
  ];
  ```

**Backwards compatibility:** старий payload format (з `allocPct`) сервер може **відхиляти** з `400 Bad Request` — новий клієнт ніколи його не надсилатиме після deploy. Або тимчасово підтримувати обидва форми у v1, видалити в v1.1.

---

## 4. Round-off rule

**Точне зберігання:** allocation як integer cents/basis points (1% = 100 basis points = 100 "alloc cents"). 100% = 10000.

**Distribution:**

- 1 token: `[10000]`
- 2: `[5000, 5000]`
- 3: `[3334, 3333, 3333]` ← remainder (1 cent) у перший
- 4: `[2500, 2500, 2500, 2500]`
- 5: `[2000, 2000, 2000, 2000, 2000]`

**Rule:** залишок (`10000 % length`) розподіляється у перші `remainder` токенів по 1 cent. Перший = найперший доданий (за `created_at` у lineup, або за порядком у `picks` array).

**Чому перший:** predictable, deterministic. Гравець не звертає уваги, але якщо хтось перевіряє — завжди той самий пік отримує bonus.

**UI display:** компактно, без деталізації:

- 3 токени → `$33K each` (не "$33K, $33K, $34K")
- Internal $ exact для PnL — на live screen все одно `+$112` показується точно з правильної бази

---

## 5. INV update — потрібен ADR

**INV-3** (поточний у `docs/INVARIANTS.md`):

> Portfolio is exactly 5 tokens, allocations multiples of 5%, sum = 100%, each 5–80%.

**Стає:**

> Portfolio is 1–5 unique tokens. Allocations are auto-distributed evenly (no user input). Sum of allocations always equals 100%. Stored as integer "alloc cents" (10000 = 100%) on backend. Round-off (when 10000 % length != 0) distributed to picks in `created_at` order.

**ADR потрібен:** `docs/ADR/0XXX-equal-split-allocation.md` — документує перехід від manual до auto allocation, причини (UX simplification, fantasy genre alignment), що було розглянуто і відхилено (Pro Mode → V2 опція).

---

## 6. Onboarding hint (важливий nuance)

Без guidance юзери інстинктивно беруть 5 токенів (бо "заповни форму"). Це **втрачає** all-in психологію.

**Hint у first-time draft state:**

- Empty lineup view показує дрібну плашку:
  ```
  Tip: 1 token = all-in conviction · 5 = max spread
  ```
- 11px Inter 500, `--muted` колір, центрована під empty slots
- Показується тільки якщо `lineup.length === 0` і user has < 3 lifetime entries (perfeked у `users.lifetime_entries < 3`)
- Зникає назавжди після третього сабмиту

**Альтернатива:** `localStorage.dismissedHint('equal-split-tip')` — показуємо першу сесію, потім ніколи. Простіше, без бекенду.

---

## 7. Migration considerations

**Existing data в проді:**

- `entries.picks[].allocPct` лишається у БД (історичні записи)
- Нові entries записуються без `allocPct`, але з `allocCents` (точніше)
- Або: тримати `allocPct` як computed view: `allocCents / 100`

**Прийняте рішення:** додати колонку `entries.picks[].allocCents`, не міняти `allocPct`. Live screen / leaderboard читає `allocCents` для нових entries (точніше), `allocPct` для legacy. Через 30 днів після релізу — drop `allocPct`.

**Active contests на момент deploy:**

- Не торкаємося. Існуючі entries з manual allocation працюють до закінчення контесту
- Нові entries (after deploy) — нова логіка
- Mixed entries в одному контесті — OK, scoring formula однакова (alloc-weighted PnL)

---

## 8. Acceptance criteria

### Reducer + types

- [ ] `UPDATE_ALLOC` action видалено з `lineupReducer.ts`
- [ ] `ADD_PICK` payload скорочено до `{ sym }`
- [ ] `APPLY_PRESET` payload скорочено до `{ syms: string[] }`
- [ ] Unit tests pass з оновленим API

### UI

- [ ] AllocSheet файл видалено
- [ ] Tap по slot → remove (no modal)
- [ ] Tap по token row → toggle add/remove (no modal)
- [ ] Slot показує icon + sym + $-amount, без %
- [ ] Lineup label `N picks · $X each` (compact)
- [ ] Allocation bar видалено
- [ ] GO states: `PICK 1+ TOKENS` / `GO BULL · X 🪙 entry`
- [ ] Onboarding hint показується first 3 entries

### API

- [ ] `POST /entries` приймає `{ contestId, picks: string[] }`
- [ ] Backend computes even allocations з round-off rule
- [ ] Стара форма (`allocPct` у payload) повертає 400 (або тимчасово приймається у v1)
- [ ] `entries.picks[].allocCents` зберігається на бекенді

### Cross-cutting

- [ ] ADR `0XXX-equal-split-allocation.md` написаний і затверджений
- [ ] INV-3 у `docs/INVARIANTS.md` оновлений
- [ ] Live screen, Browse Others — автоматично адаптуються (читають `allocCents`)
- [ ] `pnpm typecheck && pnpm lint && pnpm test` зелені

---

## 9. Decisions taken (defaults applied)

| Decision               | Default                      | Rationale                              |
| ---------------------- | ---------------------------- | -------------------------------------- |
| Min tokens             | 1                            | All-in psychology preserved            |
| Max tokens             | 5                            | UI grid constraint, INV-3 спадщина     |
| Round-off direction    | First pick gets +1 cent      | Deterministic, predictable             |
| Storage precision      | Integer cents (basis points) | Avoid float drift                      |
| API field name         | `picks: string[]`            | Simplest forward-compat                |
| Onboarding hint        | Show first 3 entries         | Localized via lifetime_entries counter |
| Old payload acceptance | Reject (400) у v1            | Cleaner cutover                        |

---

## 10. What's NOT in scope (не плутати)

- **Pro Mode** з manual allocation — V2 окрема фіча, окремий ADR. Поки що не існує
- **Multi-entry** в одному контесті — окреме рішення (V1 = single, V2 = можливо)
- **TZ-002 (Coins Economy)** — не зачіпається. Entry в Coins, payout в Coins. Сума alloc'у не впливає на entry fee
- **Live moment banners, leaderboard logic** — без змін, працює на нових allocCents значеннях

---

**Документ:** TZ-003 · v1 · 30 квіт 2026
**Базується на:** TZ-001 (Team Builder Redesign, реалізовано), TZ-002 (Coins Economy)
**Статус:** Готовий до імплементації. Передує — погодити ADR на INV-3 update.
