# Team Builder Redesign — Implementation Handoff

> Готовий до виконання handoff для Claude Code. Консолідовано на основі **TZ-001** (`./TZ.html`) і візуального прототипу (`./prototype.html`).
>
> **Скоуп:** 4 пов'язані стани одного контесту + 1 модалка управління токеном. Решта потоку (lobby, wallet, live-list, rankings) — без змін.
>
> **Ціль:** зробити кожне рішення гравця **розраховуваним у доларах**, а не у відсотках.

---

## 0. TL;DR — що будуємо

**5 нових/оновлених UI-одиниць:**

| ID  | Назва                     | Тип      | Призначення                                                 |
| --- | ------------------------- | -------- | ----------------------------------------------------------- |
| 01  | **Draft**                 | redesign | Контест-aware збір 5 токенів з $-first                      |
| 02  | **Locked / Waiting Room** | new      | Підтвердження + countdown + room fill                       |
| 03  | **Live**                  | redesign | Split hero (rank + PnL), helping/hurting, local leaderboard |
| 04  | **Browse Others**         | new      | Lineups інших гравців pre-kickoff (no PnL/stake)            |
| M1  | **AllocSheet**            | new      | Bottom sheet ~62% з $-input + % slider                      |

**Маршрути:**

- `/lobby/:contestId/build` — Draft (існує — рефактор)
- `/lobby/:contestId/locked` — Locked (нове)
- `/lobby/:contestId/browse` — Browse (нове)
- `/lobby/:contestId/live` — Live (існує — рефактор)

**Точки входу:** після `useSubmitEntry` успіху → `navigate('/lobby/:contestId/locked')`. При `now >= contest.start_time` (polling 30s OK для v1) → `navigate('/lobby/:contestId/live')`.

---

## 1. Як читати reference-матеріали

| Файл                    | Що в ньому                                                                                                                                   | Коли читати                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `./TZ.html`             | Повний дизайн-спек (10 секцій): scope, архітектура, AllocSheet деталі, reducer, live, design tokens, що НЕ робимо, прийняті рішення, питання | **Read first.** Текстова правда першого пріоритету                                                            |
| `./prototype.html`      | Інтерактивний React-мокап. Відкрити у браузері — натискати на тоглери у Tweaks-панелі, перемикати mode/tier/state, тестувати AllocSheet      | Візуальний reference. Точні розміри, поведінка, transitions                                                   |
| `./jsx-reference/*.jsx` | Витягнуті JSX-компоненти з прототипу (DraftScreen, LockedScreen, LiveScreen, BrowseScreen, AllocSheet, PhoneShell)                           | **Найважливіше для імплементації.** Реальний код, який можна портувати у TS-стрикт + TanStack Query + Zustand |

**Правило:** при конфлікті між TZ і JSX — TZ авторитетніший за `Decisions` (секція 09) і `Свідомо відкладено` (секція 08). У всьому іншому JSX точніший (бо це власне код).

---

## 2. Маппінг на існуючий код (`apps/web/src/features/`)

### 2.1 Файли для рефактора

| Файл                              | Дія      | Деталі                                                                                                                               |
| --------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `team-builder/TeamBuilder.tsx`    | refactor | Замінити `TokenSearch` + `LineupSummary` на новий `<DraftScreen>`. Тригерити `<AllocSheet>` з обох: `TokenResultRow` та `LineupSlot` |
| `team-builder/lineupReducer.ts`   | extend   | Додати `UPDATE_ALLOC`, `RESET`, `APPLY_PRESET`. Існуючі `ADD_PICK` / `REMOVE_PICK` — лишити                                          |
| `team-builder/ConfirmBar.tsx`     | replace  | Стає sticky CTA внизу Draft. Стани: `PICK N MORE` → `ALLOCATE X% MORE` → `OVER BUDGET` → `GO BULL · 50 ⭐ entry`                     |
| `team-builder/useDraft.ts`        | extend   | Додати `openSheet(token)` / `closeSheet()` та selector `remainingPct`                                                                |
| `team-builder/useSubmitEntry.ts`  | reuse    | Без змін. Після успіху — `navigate('/lobby/:contestId/locked')`                                                                      |
| `team-builder/LineupSummary.tsx`  | replace  | Стає `<LineupGrid>` усередині DraftScreen — 5 slots з $-сумами                                                                       |
| `team-builder/TokenResultRow.tsx` | refactor | Додати inline `🔥 N% picked` + ✓/✗ contest-fit tag. При тапі — викликати AllocSheet                                                  |
| `live/Live.tsx`                   | refactor | Замінити `Scoreboard` на новий `<LiveHero>` (split rank/PnL) + `<LiveTeam>` + `<LocalLeaderboard>`                                   |
| `live/MiniLeaderboard.tsx`        | replace  | Новий `<LocalLeaderboard>` з divider'ом між top-3 і навколо мене                                                                     |

### 2.2 Нові компоненти

| Компонент            | Файл                              | Призначення                                   |
| -------------------- | --------------------------------- | --------------------------------------------- |
| `<DraftScreen>`      | `team-builder/DraftScreen.tsx`    | Новий root для Draft state                    |
| `<AllocSheet>`       | `team-builder/AllocSheet.tsx`     | Bottom sheet управління allocation            |
| `<LineupSlot>`       | `team-builder/LineupSlot.tsx`     | Один з 5 слотів. Tap → AllocSheet             |
| `<StartFromStrip>`   | `team-builder/StartFromStrip.tsx` | Об'єднана панель recents + presets            |
| `<LockedScreen>`     | `lobby/LockedScreen.tsx`          | Waiting room                                  |
| `<BrowseScreen>`     | `lobby/BrowseScreen.tsx`          | Список чужих lineups pre-kickoff              |
| `<LiveHero>`         | `live/LiveHero.tsx`               | Split rank + PnL                              |
| `<LiveTeam>`         | `live/LiveTeam.tsx`               | Per-token PnL list                            |
| `<LocalLeaderboard>` | `live/LocalLeaderboard.tsx`       | Top-3 + навколо мене                          |
| `<MomentBanner>`     | `live/MomentBanner.tsx`           | Top-10 / climbing-fast / dropping-fast banner |

### 2.3 Shared primitives (нові)

| Утиліта                      | Файл                            | Призначення                                |
| ---------------------------- | ------------------------------- | ------------------------------------------ |
| `fmtMoney(n)`                | `packages/shared/src/format.ts` | `$1.2K`, `$100K`, `$1.5M` (compact)        |
| `fmtMoneyExact(n)`           | `packages/shared/src/format.ts` | `$1,234,567` (з commas)                    |
| `fmtPnL(n)`                  | `packages/shared/src/format.ts` | `+$96`, `−$1.2K`, `+$420` (signed compact) |
| `dollarsFor(allocPct, tier)` | `packages/shared/src/format.ts` | `Math.round(tier * pct / 100)`             |
| `sparkPath(seed, isUp)`      | `packages/shared/src/spark.ts`  | Детерміністична SVG-path для sparkline     |

---

## 3. Порядок імплементації (milestones)

Виконувати **строго послідовно**. AllocSheet (M1) — central primitive, від нього залежать Draft і Live edit-режим у v1.1.

### Milestone 1 — Foundation

- Add design tokens: `--bull`, `--bear`, `--gold` у `tailwind.config.ts` + CSS-vars
- Type scales: countdown (56px JBM 700), big-number (32px JBM 700), pnl-big (24px JBM 700), label (10px Inter 700 +.08em uppercase)
- Add `JetBrains Mono` font to Vite deps + `index.html` preload
- Build `packages/shared/src/format.ts` з усіма утилітами + unit tests
- Build `packages/shared/src/spark.ts`

**Acceptance:** `pnpm typecheck && pnpm test` пасує. Жодного UI ще не змінилося.

### Milestone 2 — AllocSheet (M1)

**Найважливіший новий примітив — блокує все інше.** Реализувати по `./jsx-reference/AllocSheet.jsx` повністю, портуючи на TS strict.

Деталі — секція 4.

**Acceptance:** Standalone Storybook-story (або dev route) з AllocSheet. Можна:

- Відкрити для нового токена (alloc=20% default, або min(20, remaining))
- Edit існуючого pick (alloc беремо з payload)
- Slide-up animation 220ms cubic-bezier(.2,.8,.25,1)
- Backdrop tap / Esc / Cancel — закривають
- $-input ↔ % slider синхронні
- Quick chips 10/25/50/max (приховуються коли > cap)
- Cap-marker на slider rail
- Confirm CTA disabled коли alloc=0 або lineup full && !isEdit
- Remove тільки при isEdit
- Focus trap, ARIA correct

### Milestone 3 — Reducer + useDraft extension

- Розширити `lineupReducer.ts` діями `UPDATE_ALLOC`, `RESET`, `APPLY_PRESET`
- Розширити `useDraft.ts` selectorами + `openSheet`/`closeSheet`
- Покрити reducer unit-тестами (TDD per CLAUDE.md rule #5)

**Acceptance:** Reducer-тести покривають всі 5 дій + edge cases (over-budget, full lineup).

### Milestone 4 — DraftScreen refactor

Перенести з прототипу `DraftScreen.jsx` → `DraftScreen.tsx`. Підключити existing `useTokenSearch`, `useDraft`, `useSubmitEntry`. Замінити modal/page route.

Деталі — секція 5.

**Acceptance:** Можна зайти на `/lobby/:contestId/build`, набрати лайнап через AllocSheet, тапнути GO → перейти на `/locked`.

### Milestone 5 — LockedScreen

По `./jsx-reference/LockedScreen.jsx`. Полінг `GET /contests/:id/state` кожні 30s для room-fill / activity / countdown. Detect kickoff → navigate to `/live`.

Деталі — секція 6.

**Acceptance:** Після submit — користувач на `/locked`, бачить countdown що тікає, players counter росте, після start_time автоматично переходить на `/live`.

### Milestone 6 — BrowseScreen

По `./jsx-reference/BrowseScreen.jsx`. Простий list-view з фільтрами (Friends/Just locked — UI-only у v1).

Деталі — секція 7.

**Acceptance:** З Locked можна зайти на `/browse`, повернутися назад. Filter chips перемикаються (data-only фільтрація v1).

### Milestone 7 — LiveScreen refactor

По `./jsx-reference/LiveScreen.jsx`. Split hero, per-token helping/hurting borders, local leaderboard з divider'ом, moment banner.

Деталі — секція 8.

**Acceptance:** На `/live` бачимо split hero, моя команда з $ PnL per row, local leaderboard з top-3 + сусіди. Polling rank/PnL раз на 30s.

### Milestone 8 — Routes + Polish

- Routes wiring у `apps/web/src/router.tsx`
- Transition guards (Locked не дозволяє назад на Build, INV-10)
- Smoke test full flow Build → Lock → Live
- A11y pass на AllocSheet (focus trap, ARIA)

**Acceptance:** Повний path працює без помилок. `pnpm typecheck && pnpm lint && pnpm test` зелені.

---

## 4. AllocSheet (M1) — детальна спека

> Source-of-truth: `./TZ.html` секція 03 + `./jsx-reference/AllocSheet.jsx`.

### 4.1 Тригери

```ts
// 1. Tap на token row у Browse tokens (Draft) — додати або підправити
<TokenResultRow onClick={() => openSheet(token)} />

// 2. Tap на slot у lineup (Draft) — підправити alloc
<LineupSlot onClick={() => openSheet(token)} />

// 3. Tap на token row у Live — read-only режим (v1.1, не зараз)
```

### 4.2 Props interface

```ts
interface AllocSheetProps {
  open: boolean;
  mode: 'bull' | 'bear';
  tier: number; // virtual budget, e.g. 100_000
  lineup: Pick[]; // current full lineup
  token: Token | null; // null коли open=false
  onClose: () => void;
  onConfirm: (action: { sym: string; alloc: number } | { remove: true; sym: string }) => void;
}

interface Pick {
  sym: string;
  alloc: number;
} // alloc — % від tier
interface Token {
  sym: string;
  name: string;
  icon: string;
  price: string;
  d24: number; // d24 — % зміни ціни за 24h
  pickedBy: number; // % гравців контесту з цим токеном
}
```

### 4.3 Поведінка (повна таблиця)

| Аспект                 | Специфікація                                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Анімація відкриття** | Slide-up з низу, `cubic-bezier(.2,.8,.25,1)`, **220ms**. Backdrop fade-in 180ms, opacity 0 → 0.42                                                                     |
| **Висота**             | `max-height: 62vh`. Контент скролиться всередині якщо overflow                                                                                                        |
| **Закриття**           | Tap по backdrop · swipe-down handle · Cancel · Confirm (apply + close) · Esc                                                                                          |
| **Default $ amount**   | Якщо edit → `existing.alloc`. Якщо новий і lineup порожній → 20%. Якщо є інші → `min(20, remaining)`. Якщо `remaining < 20` → max it (`remaining`)                    |
| **Cap**                | `slider.max = 100 - sum(other.alloc)`. Cap-маркер на rail у позиції cap. **Не дозволяти ввід > cap** — обрізаємо у `onChange`                                         |
| **$ ↔ % bind**         | `dollars = round(tier × alloc / 100)`. Інверсія: `alloc = round(dollars / tier × 100)`. На each input — synchronize обидва                                            |
| **Quick chips**        | 10 / 25 / 50 / `max(remaining)`. Приховувати числові chips що > cap (max — завжди показуємо, навіть коли = 0)                                                         |
| **Contest fit**        | Bull + d24>0 → `✓ Rising — fits your bull contest`. Bull + d24<0 → `✗ Falling — fights your bull contest`. Bear — інверсія сигналу                                    |
| **Confirm CTA**        | Колір по mode (bull зелений / bear червоний). Текст: `Add · $20,000` або `Update · $20,000`. Disabled при `alloc=0` або `lineup.length>=5 && !isEdit` (`Lineup full`) |
| **Remove**             | Видима тільки якщо `isEdit`. Не disabled. Викликає `onConfirm({ remove: true, sym })`                                                                                 |

### 4.4 Edge cases

- **Lineup повний (5/5) + новий токен** → CTA `Lineup full`, disabled. Підказка: `Remove a token first or tap a slot to swap`
- **Remaining = 0** (інші alloc дають 100%) → тільки edit існуючого; новий додати неможливо. Slider max=0, числові chips disabled, тільки `max (0%)` показано
- **Користувач набирає > budget у $-input** → auto-clamp до remaining. Без помилок, без shake — просто значення обрізається
- **Token ціна змінилась поки sheet відкритий** → оновлюємо `price` та `d24` live (через TanStack Query refetch). Alloc% (вибір) не чіпаємо
- **Backdrop tap із незбереженими змінами** → закриваємо без confirm. Зміни втрачаються (тримаємо легкість, не робимо confirm dialog у v1)

### 4.5 A11y

```tsx
<div role="dialog" aria-modal="true" aria-labelledby="alloc-sheet-token-sym">
  <div id="alloc-sheet-token-sym">PEPE</div>
  ...
</div>
```

- Focus trap всередині sheet (`focus-trap-react` або hand-rolled)
- Перший focus — на `$-input`
- Esc — закрити (як backdrop tap)
- Slider — keyboard nav (←→ ±1%, ↑↓ ±5%)

---

## 5. DraftScreen — детальна спека

> Source: `./jsx-reference/DraftScreen.jsx` + TZ секція 01.

### 5.1 Layout (зверху-вниз)

```
┌─ TopHeader ──────────────────────────────────────┐
│ ‹  Sprint #284 · Bull   $100K                    │
│    24h · ends Sat 10:00                          │
├─ StatusRow ──────────────────────────────────────┤
│ ● 47:12 to start    347 in            $ 1.2K    │
├─ Lineup wrap ────────────────────────────────────┤
│ Your lineup (budget $100K)        2/5 · $40K · 40% │
│ [+] [+] [PEPE $20K 20%] [SOL $20K 20%] [+]       │
│ ━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░░░░░░░░         │
├─ Content (scrollable) ───────────────────────────┤
│ 🔍 Search ticker or paste contract…              │
│                                                  │
│ Browse tokens                    1H | 24H | 7D   │
│ [Token row · sparkline · ✓ rising · +12.4% 24h]  │
│ ...                                              │
├─ Dock ───────────────────────────────────────────┤
│ START FROM                                       │
│ [Last team +12.4%] [⚖️ Balanced (preset)] [...] │
│                                                  │
│ ┌──────────── GO BULL · 50 ⭐ entry ────────────┐ │
│ └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### 5.2 Ключові правила

- **Slot empty** → tap відкриває AllocSheet з `token = null` (не зробимо у v1; залишимо empty state кліком на token у списку)
- **Slot filled** → tap відкриває AllocSheet з `token = picked`, в edit-режимі
- **Token row у Browse tokens** → tap відкриває AllocSheet
- **GO button states (sticky bottom):**
  - `lineup.length < 5` → `PICK N MORE` (disabled, paper-deep bg)
  - `length=5 && totalAlloc<100` → `ALLOCATE X% MORE` (disabled)
  - `length=5 && totalAlloc>100` → `OVER BUDGET BY X%` (disabled, error-tinted)
  - `length=5 && totalAlloc=100` → `GO BULL · 50 ⭐ entry` (зелений, active)
  - У bear контесті — `GO BEAR · 50 ⭐ entry` (червоний)
- **Token sort:** Bull → desc by `d24`. Bear → asc by `d24`
- **Token contest-tag:** Bull + `d24>0` → `✓ rising`. Bull + `d24<0` → `✗ falling`. Bear інвертує
- **Token color (price):** **завжди** зелений для +, червоний для − (це market price, не score). Контест-fit (✓/✗) — гравецька інтерпретація
- **picked-by:** `≥30%` → `🔥 N% picked`. `≥15%` → `· N% picked`. `<15%` — не показуємо
- **Sparkline color:** наслідує знак `d24` (не mode)

### 5.3 Start From strip

Об'єднана горизонтальна стрічка карток:

- **Personal** (recents) — solid border, paper bg. Дані: `label`, `pnl` (з PnL з минулого контесту), `picks[]`, `sub` (e.g., `Sprint #283 · 2d ago`)
- **System presets** — dashed border, paper-dim bg. Дані: `label` (e.g., `⚖️ Balanced`), `desc`, `picks[]`. Лейбл-meta: italic muted "preset"
- **Сортування:** Personal спочатку (свіжіші ціннiші), presets після
- **Tap** → `dispatch({ type: 'APPLY_PRESET', payload: { picks } })`. Заповнює лайнап одним рухом

### 5.4 INV-3 conflict — flag для product

**TZ AllocSheet** використовує:

- `step=1` на slider (1% increments)
- `min=0` на slider, max=remaining
- Quick chips 10/25/50/max

**INV-3** (поточний invariant): allocations multiples of 5%, **5–80% per token**, sum=100%.

**Конфлікт.** Дві опції:

1. **Адаптувати дизайн до INV-3** — `step=5` на slider, chips 10/25/50/75 (multiples of 5), min=5
2. **Змінити INV-3** через ADR — обґрунтувати чому 1% steps і min=0% дають кращий UX

Я б рекомендував **варіант 2** (1% більш гнучкий, "мікро-pick" 1-2% — реальна стратегія в fantasy). Але це продуктове рішення.

**До прийняття рішення** — реалізувати по TZ (`step=1`, `min=0`), і одразу написати `docs/ADR/0XXX-alloc-step-min.md` з обґрунтуванням. Якщо product не погодиться — ADR rejected, переробити на `step=5, min=5`.

---

## 6. LockedScreen — детальна спека

> Source: `./jsx-reference/LockedScreen.jsx` + TZ секція 01 (state 02).

### 6.1 Layout

```
┌─ TopHeader (no back) ────────────────────────────┐
│    Sprint #284 · Bull   $100K                    │
│    24h · ends Sat 10:00                          │
├─ Locked banner ──────────────────────────────────┤
│         ● ───── YOU'RE LOCKED IN ─────           │
├─ Countdown block ────────────────────────────────┤
│              KICKOFF IN                          │
│                47:12                             │ ← 56px JBM
│       Sprint #284 · 24h · ends Sat 10:00         │
├─ Room fill ──────────────────────────────────────┤
│  347 PLAYERS IN          $1.2K PRIZE POOL        │
│  ─────────────────────────────────────────       │
│  ● @neonbat just locked in            12s ago    │
├─ Locked lineup ──────────────────────────────────┤
│ YOUR TEAM            5 picks · $100K committed   │
│ 🐸 PEPE   $30,000 · 30%   ━━━━━━━━━━              │
│ ◎  SOL    $25,000 · 25%   ━━━━━━━━                │
│ ...                                              │
├─ Locked actions ─────────────────────────────────┤
│ [📤 Share lineup]    [Browse others →]           │
└──────────────────────────────────────────────────┘
```

### 6.2 Ключові правила

- **Banner** — нейтральний "You're locked in" без Bull/Bear suffix (mode визначається назвою контесту в шапці)
- **Big countdown** — 56px JetBrains Mono Bold, центровано, двокрапка з `animation: blink 1s infinite`
- **Room fill** — два числа поряд: players count (флешить акцентом коли тікає +1), prize pool (gold). Activity row внизу — однорядкова ротація
- **Lineup read-only** — без drift, без PnL preview, без % зміни цін. Лише: icon, sym, $-сума, alloc%, alloc-bar. Це навмисно — pre-game drift створює "не те вибрав" вайб
- **Actions** — `Share lineup` (UI v1, native share API → v1.1). `Browse others` (primary, ink bg)

### 6.3 Поллінг

```ts
// useLockedState — кожні 30s
const { data } = useQuery({
  queryKey: ['contest-state', contestId],
  queryFn: () => api.getContestState(contestId),
  refetchInterval: 30_000,
});

// Detect kickoff
useEffect(() => {
  if (data?.status === 'live') {
    navigate(`/lobby/${contestId}/live`);
  }
}, [data?.status]);
```

---

## 7. BrowseScreen — детальна спека

> Source: `./jsx-reference/BrowseScreen.jsx` + TZ секція 01 (state 04).

### 7.1 Layout

```
┌─ TopHeader (no back) ────────────────────────────┐
│    Sprint #284 · Bull   $100K                    │
├─ Browse header ──────────────────────────────────┤
│ ‹  Lineups in #284                               │
│    347 players · kickoff 47:12                   │
├─ Filter chips ───────────────────────────────────┤
│ [All]  [Friends]  [Just locked]                  │
├─ Disclaimer ─────────────────────────────────────┤
│ Lineups only · stake size & PnL hidden until kickoff │
├─ List ───────────────────────────────────────────┤
│ @cryptoking            🐸 ◎ 🚀 🐱 🦴               │
│ 3m ago                                           │
│ @whaleboy              ₿ Ξ ◎ 🐸 🐶                │
│ 8m ago                                           │
│ ...                                              │
└──────────────────────────────────────────────────┘
```

### 7.2 Ключові правила

- **Тільки склад команди** — username, time ago, 5 mini-icons
- **НЕ показуємо:** stake size (entry fee), PnL (бо pre-game), allocation breakdown, win history, follower count, mode pill (всі в одному контесті)
- **Disclaimer** — поясни юзеру `Lineups only · stake size & PnL hidden until kickoff`. Це фіча, не баг
- **Filter chips** (UI у v1, логіка → v1.1):
  - `All` — всі lineups
  - `Friends` — referral-tree гравці (логіка v1.1)
  - `Just locked` — останні 10 entries
- **Tap на рядок** — нічого у v1. У v1.1 розглянемо: розгортання allocations / open profile / copy lineup

### 7.3 API

```ts
GET /contests/:contestId/lineups?filter=all|friends|recent&limit=50

Response: {
  lineups: Array<{
    user: string;     // anonymized handle
    ago: string;      // "3m ago"
    picks: string[];  // 5 syms, no allocations
  }>;
  total: number;
}
```

---

## 8. LiveScreen — детальна спека

> Source: `./jsx-reference/LiveScreen.jsx` + TZ секція 05.

### 8.1 Layout

```
┌─ TopHeader (no back) ────────────────────────────┐
│    Sprint #284 · Bull   $100K                    │
├─ Live banner ────────────────────────────────────┤
│ ● LIVE                       Ends in 14:23:08    │
├─ Moment banner (умовний) ────────────────────────┤
│ 🏆 You broke into top 10! Keep the lead.         │ ← gold gradient
├─ Split hero ─────────────────────────────────────┤
│ ┌─ Your rank ─────┐  ┌─ Your portfolio ────────┐ │
│ │      #8         │  │     +$340               │ │
│ │   of 347        │  │     +0.34%              │ │
│ │  ↑ +12 / 1h     │  │     prize est. $61      │ │
│ └─────────────────┘  └─────────────────────────┘ │
├─ Your team ──────────────────────────────────────┤
│ YOUR TEAM     ⭐ MOG carrying · +$3,800          │
│ ┃ 🐸 PEPE  $30K · 30%       +$3,800   +12.67%    │ ← helping (зелений border)
│ ┃ 🐶 WIF   $20K · 20%       −$240     −1.20%     │ ← hurting (червоний border)
│ ...                                              │
├─ Around you ─────────────────────────────────────┤
│ AROUND YOU            tap for full board →       │
│ #1   @whaleboy                +24.70%            │
│ #2   @cryptoking              +19.20%            │
│ #3   @nyx                     +16.80%            │
│ ↕ skip · ranks 4–6                               │
│ #7   @neonbat                 +9.20%             │
│ #8   You                      +8.40%   ← me      │
│ #9   @hodler420               +7.80%             │
│ #10  @tetra                   +7.00%             │
└──────────────────────────────────────────────────┘
```

### 8.2 Split hero — обидва рівноваги

**TZ Decision:** rank і PnL — однакова вага. Не одна головна метрика. Гравцю важливо знати **і** де він у таблиці, **і** скільки заробляє.

- **Rank card:** `#8` (32px JBM 700) + `of 347` (11px) + delta pill (`↑ +12 / 1h` зелений / `↓ -3 / 1h` червоний / `— flat` сірий)
- **PnL card:** `+$340` (24px JBM 700, color-coded) + `+0.34%` (11px) + `prize est. $61` (тільки якщо в призовій зоні, top 30%)

### 8.3 Per-token PnL row

- **Лівий border 3px:** `helping` (bull-зелений) / `hurting` (bear-червоний)
- **"Helping" логіка:** з врахуванням mode. Bear contest → падіння токена = helping. Тобто `helping = (mode === 'bull' ? d24 > 0 : d24 < 0)`
- **TOP badge:** на токен з найбільшим $-PnL коли `winner.pnl > 0`
- **Per-row PnL display:** `+$3,800` великим (14px JBM Bold) + `+12.67%` дрібним (10px muted)

### 8.4 Local leaderboard — формат

```
Top-3 (rank 1, 2, 3)
─── divider: "↕ skip · ranks 4–{myRank-2}"
1 user above me (rank myRank-1)
ME (rank myRank, ink border + bold)
2 users below (rank myRank+1, myRank+2)
```

При `myRank ≤ 5` — divider не показуємо, просто послідовно top-3 + сусіди.
При `myRank > 5` — divider обов'язковий.

### 8.5 Moment banner — тригери (один за раз, top priority)

- `myRank ≤ 10` → `🏆 You broke into top 10! Keep the lead.` (gold gradient)
- `rankDelta ≥ +10 за 1h` → `🚀 Climbing fast — N ranks in an hour` (bull green)
- `rankDelta ≤ −20 за 1h` → `⚠️ Dropping fast — review your team` (мутний amber)
- Інакше — banner не показується

### 8.6 API

```ts
GET /contests/:contestId/live-state

Response: {
  status: 'pending' | 'live' | 'ended';
  endsAt: string;          // ISO timestamp
  myRank: number;
  totalEntries: number;
  rankDelta: number;       // change in last hour
  myPnL: number;           // dollars
  myPctChange: number;     // %
  prizeEst: number | null;
  team: Array<{
    sym: string;
    alloc: number;
    pnl: number;            // $
    scorePct: number;       // % (mode-aware)
    helping: boolean;
  }>;
  leaderboard: {
    top3: Array<{ rank: number; user: string; pct: number; }>;
    around: Array<{ rank: number; user: string; pct: number; isMe?: boolean; }>;
  };
}
```

Polling: 30s interval (v1). WebSocket — v2.

---

## 9. Reducer + типи

```ts
// packages/shared/src/lineup.ts

export interface Pick {
  sym: string;
  alloc: number; // 0–100, % від tier
}

export type LineupAction =
  | { type: 'ADD_PICK'; payload: Pick }
  | { type: 'UPDATE_ALLOC'; payload: Pick } // нова
  | { type: 'REMOVE_PICK'; payload: { sym: string } }
  | { type: 'RESET' } // нова
  | { type: 'APPLY_PRESET'; payload: { picks: Pick[] } }; // нова

export function lineupReducer(state: Pick[], action: LineupAction): Pick[] {
  switch (action.type) {
    case 'ADD_PICK': {
      if (state.length >= 5) throw new Error('Lineup full');
      const sum = state.reduce((s, p) => s + p.alloc, 0);
      if (sum + action.payload.alloc > 100) throw new Error('Over budget');
      return [...state, action.payload];
    }
    case 'UPDATE_ALLOC': {
      const idx = state.findIndex((p) => p.sym === action.payload.sym);
      if (idx === -1) throw new Error('Pick not found');
      const others = state.filter((p) => p.sym !== action.payload.sym);
      const sum = others.reduce((s, p) => s + p.alloc, 0);
      if (sum + action.payload.alloc > 100) throw new Error('Over budget');
      return state.map((p) => (p.sym === action.payload.sym ? action.payload : p));
    }
    case 'REMOVE_PICK':
      return state.filter((p) => p.sym !== action.payload.sym);
    case 'RESET':
      return [];
    case 'APPLY_PRESET': {
      const sum = action.payload.picks.reduce((s, p) => s + p.alloc, 0);
      if (sum !== 100) throw new Error('Preset must sum to 100');
      if (action.payload.picks.length !== 5) throw new Error('Preset must be 5 picks');
      return action.payload.picks;
    }
  }
}
```

### 9.1 Selectors (через `useDraft`)

```ts
const totalAlloc = lineup.reduce((s, p) => s + p.alloc, 0);
const totalDollars = dollarsFor(totalAlloc, tier);
const remainingPct = 100 - totalAlloc;
const isValid = lineup.length === 5 && totalAlloc === 100;

// CTA derivation
const cta = (() => {
  if (isValid) return { mode: 'ready', label: `GO ${mode.toUpperCase()} · 50 ⭐ entry` };
  if (lineup.length < 5) return { mode: 'pick', label: `PICK ${5 - lineup.length} MORE` };
  if (totalAlloc < 100) return { mode: 'alloc', label: `ALLOCATE ${100 - totalAlloc}% MORE` };
  return { mode: 'over', label: `OVER BUDGET BY ${totalAlloc - 100}%` };
})();
```

---

## 10. API контракти

### 10.1 Submit lineup (existing — без змін)

```ts
POST /entries
{
  contestId: string,
  picks: [
    { sym: 'PEPE', allocPct: 30 },  // % від tier, не $
    ...
  ]
}

Response:
  201 Created → { entryId: string }
  402 Payment Required → { error: 'INSUFFICIENT_BALANCE', topUpUrl?: string }
  400 → { error: 'VALIDATION_FAILED', details: { ... } }
```

Сервер сам обчислює $-equivalent на момент `kickoff`. Клієнт показує $-precomputed для UX.

### 10.2 Contest state (Locked + Live)

```ts
GET /contests/:contestId/state

Response: {
  status: 'pending' | 'live' | 'ended';
  startsAt: string;        // ISO
  endsAt: string;          // ISO
  // Pending only:
  pendingState?: {
    playersCount: number;
    prizePool: number;
    activity: Array<{ user: string; action: string; ago: string; }>;
  };
  // Live only:
  liveState?: { /* див. 8.6 */ };
}
```

### 10.3 Browse lineups (нове)

```ts
GET /contests/:contestId/lineups?filter=all|friends|recent&limit=50

Response: {
  lineups: Array<{
    user: string;
    ago: string;
    picks: string[];      // 5 syms only
  }>;
  total: number;
}
```

**Privacy contract:** до `status='live'` — НЕ повертаємо `entry_fee`, `allocations`, `pnl`, `rank`. Тільки `user`, `picks` (syms), `ago`. Після `live` — можна повертати додаткові поля.

### 10.4 Contest meta (нові поля)

```ts
GET /contests/:contestId

Response: {
  id, name, mode: 'bull' | 'bear', format: 'sprint' | 'marathon' | ...,
  // НОВЕ:
  virtualBudget: number;     // tier — 100_000, 1_000_000, etc.
  entryFee: number;          // у Stars
  // existing fields...
}
```

---

## 11. Дизайн-токени

Додати в `apps/web/tailwind.config.ts`:

```ts
theme: {
  extend: {
    colors: {
      paper:      '#f6f1e8',
      'paper-dim': '#ede6d8',
      'paper-deep':'#e0d7c5',
      ink:        '#1a1814',
      'ink-soft': '#4a463e',
      muted:      '#8a8478',
      line:       '#d8cfbd',
      bull:       '#1f8a3e',  // НОВЕ
      bear:       '#c0392b',  // НОВЕ
      gold:       '#b8842c',  // НОВЕ (prize)
      accent:     '#d4441c',
    },
    fontFamily: {
      sans: ['Inter', 'system-ui', 'sans-serif'],
      mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
    },
    fontSize: {
      // existing scales +
      'countdown':  ['56px', { fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em' }],
      'big-number': ['32px', { fontWeight: 700, lineHeight: 1.05 }],
      'pnl-big':    ['24px', { fontWeight: 700 }],
      'label':      ['10px', { fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }],
    },
  },
},
```

CSS-vars (для не-Tailwind стилів — sheet animation, наприклад):

```css
:root {
  --paper: #f6f1e8;
  --paper-dim: #ede6d8;
  --paper-deep: #e0d7c5;
  --ink: #1a1814;
  --ink-soft: #4a463e;
  --muted: #8a8478;
  --line: #d8cfbd;
  --bull: #1f8a3e;
  --bear: #c0392b;
  --gold: #b8842c;
  --accent: #d4441c;

  --easing-sheet: cubic-bezier(0.2, 0.8, 0.25, 1);
  --duration-sheet: 220ms;
}
```

Шрифти: додати в `apps/web/index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap"
/>
```

---

## 12. Що НЕ робимо у v1 (свідомо)

| Що                                                             | Причина                                                           | Версія |
| -------------------------------------------------------------- | ----------------------------------------------------------------- | ------ |
| Read-only AllocSheet у Live (з PnL + history)                  | Ускладнює AllocSheet API. Tap по live-token нічого не робить у v1 | v1.1   |
| Friends filter logic у Browse                                  | Немає referral-graph endpoint. UI є                               | v1.1   |
| Native share API integration                                   | Кнопка є, але `onClick` no-op у v1                                | v1.1   |
| Push notifications (rank-change moments)                       | Backend infrastructure                                            | v1.2   |
| Анімація переходу Locked → Live при kickoff                    | Polish, не критично                                               | v1.2   |
| **Prediction helpers у AllocSheet** ("якщо +10% → заробиш $X") | **Підтверджено НЕ робимо взагалі**                                | —      |
| WebSocket для live updates                                     | Polling 30s достатньо для v1                                      | v2     |
| Hold-to-confirm GO button                                      | Single tap достатньо. Без modal-підтверджень                      | —      |
| Bull/Bear pills у UI                                           | Mode зашитий у назву контесту + колір CTA                         | —      |
| Pre-game drift у Locked                                        | Створює "не те вибрав" вайб                                       | —      |
| Drag-to-reorder slots                                          | Не потрібно для 5-slot lineup                                     | —      |

---

## 13. Open questions (для product/backend перед стартом)

| #   | Питання                                                                          | Запропоноване рішення                                                                 |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | **INV-3 conflict** — alloc step (1% vs 5%), min (0% vs 5%)                       | Адаптувати INV-3 через ADR. Step=1, min=0. Обґрунтування: 1% дає мікро-pick стратегії |
| 2   | Live update частота — polling vs WebSocket                                       | Polling 30s у v1. WS у v2                                                             |
| 3   | "Around you" leaderboard — окремий endpoint чи slice на клієнті                  | Бекенд робить slice (повертає 4-7 рядків). Економимо bandwidth                        |
| 4   | Activity feed у Locked — джерело? Тільки великі ставки чи всі дії                | Великі ставки (top 10 entry size) + останні N entries. Бекенд формує ротуючий feed    |
| 5   | Browse Others до kickoff — privacy. Тільки склад чи stake size теж               | **Тільки склад.** Stake/PnL після kickoff                                             |
| 6   | Prize estimate у Live — формула на клієнті чи з бекенду                          | З бекенду. Залежить від сітки призів контесту, складно дублювати                      |
| 7   | Locked → Live — клієнт polling'ує kickoff чи push event                          | Polling у v1. Push у v1.2                                                             |
| 8   | Tier-mechanic — як гравець потрапляє в $1M контест? Ranking-gated чи vote-based? | Окремий продуктовий ADR. Не блокує v1 (показуємо tier як параметр контесту)           |

---

## 14. Acceptance criteria — повний чек-лист

### Foundation

- [ ] `--bull`, `--bear`, `--gold` додані у Tailwind config + CSS vars
- [ ] `JetBrains Mono` font preloaded
- [ ] `fmtMoney`, `fmtMoneyExact`, `fmtPnL`, `dollarsFor`, `sparkPath` в `packages/shared/`
- [ ] Unit tests на формат-утиліти (включно з edge cases: 0, 999, 1000, 999_999, 1_000_000)

### AllocSheet (M1)

- [ ] Slide-up animation 220ms cubic-bezier(.2,.8,.25,1)
- [ ] Backdrop fade-in 180ms, opacity 0→0.42
- [ ] `max-height: 62vh` з internal scroll
- [ ] Default alloc: 20% / `min(20, remaining)` / `remaining`
- [ ] Cap behavior: `slider.max = remaining`, cap-marker visible, обрізає при ввід > cap
- [ ] $ ↔ % bind two-way синхронні
- [ ] Quick chips 10/25/50/max — приховуються коли > cap, max завжди
- [ ] Contest-fit hint правильно адаптується до mode
- [ ] Confirm CTA: `Add · $X` / `Update · $X` / `Lineup full` (disabled)
- [ ] Remove видима тільки при `isEdit`
- [ ] `role="dialog"` + `aria-modal="true"` + `aria-labelledby`
- [ ] Focus trap, Esc закриває, slider keyboard nav

### Draft

- [ ] $-сума у кожному slot, lineup label, GO button states
- [ ] Tier badge поряд з contest name
- [ ] Bull/Bear baked у contest name; жодних окремих pills
- [ ] AllocSheet відкривається з token row + slot tap
- [ ] Token rows: ✓/✗ contest-fit + inline `🔥 N% picked`
- [ ] Token sort: bull desc by d24, bear asc by d24
- [ ] Start From strip об'єднує personal + presets з різним візуалом
- [ ] GO button states: PICK N MORE → ALLOCATE X% MORE → OVER BUDGET → GO BULL
- [ ] Submit success → navigate to `/locked`

### Locked

- [ ] Big countdown 56px JBM по центру з blink colon
- [ ] Room fill з live counter (полінг 30s)
- [ ] Activity feed rotating (single row)
- [ ] Lineup read-only — без drift, без PnL preview, без % зміни цін
- [ ] Status row сховано
- [ ] Auto-navigate to `/live` при `status='live'`

### Live

- [ ] Live banner з ends countdown
- [ ] Split hero — rank і PnL обидва прикметні (рівноваги)
- [ ] Moment banner: топ-10 / climbing-fast / dropping-fast (один за раз)
- [ ] Token rows з лівим border (3px helping/hurting)
- [ ] TOP badge на winner row коли winner.pnl > 0
- [ ] Local leaderboard з divider'ом між top-3 і навколо мене
- [ ] Polling 30s

### Browse

- [ ] Тільки lineups (іконки), без allocations, без stake, без PnL
- [ ] Disclaimer line про "hidden until kickoff"
- [ ] Filter chips: All / Friends / Just locked (Friends та Just locked — UI only у v1)
- [ ] Back navigation до Locked

### Cross-cutting

- [ ] Status row сховано в locked/live/browse станах
- [ ] Усі $-форматування через утиліти
- [ ] Жодних Bull/Bear pills у UI
- [ ] `pnpm typecheck && pnpm lint && pnpm test` зелені
- [ ] INV-3 ADR написаний і прийнятий

---

## 15. Файлова структура (фінальна)

```
apps/web/src/features/
├── team-builder/                 # рефактор
│   ├── DraftScreen.tsx           # NEW (root)
│   ├── AllocSheet.tsx            # NEW
│   ├── LineupSlot.tsx            # NEW
│   ├── StartFromStrip.tsx        # NEW
│   ├── TokenResultRow.tsx        # refactor
│   ├── ConfirmBar.tsx            # replace
│   ├── lineupReducer.ts          # extend
│   ├── useDraft.ts               # extend
│   ├── useSubmitEntry.ts         # reuse
│   └── useTokenSearch.ts         # reuse
├── lobby/                        # NEW folder
│   ├── LockedScreen.tsx          # NEW
│   ├── BrowseScreen.tsx          # NEW
│   └── useLockedState.ts         # NEW (полінг)
└── live/                         # рефактор
    ├── LiveScreen.tsx            # refactor
    ├── LiveHero.tsx              # NEW
    ├── LiveTeam.tsx              # NEW
    ├── LocalLeaderboard.tsx      # NEW (заміна MiniLeaderboard)
    ├── MomentBanner.tsx          # NEW
    └── useLiveState.ts           # extend (полінг)

packages/shared/src/
├── format.ts                     # NEW: fmtMoney, fmtPnL, dollarsFor
├── spark.ts                      # NEW: sparkPath
├── lineup.ts                     # NEW: Pick type, lineupReducer (extracted)
└── constants.ts                  # extend (FONT_STACK, ANIMATION_TIMINGS)

docs/
├── ADR/
│   └── 0XXX-alloc-step-one-percent.md   # NEW (для INV-3 conflict)
└── specs/team-builder-redesign/
    ├── HANDOFF.md                # ← цей файл
    ├── TZ.html                   # повний дизайн-спек
    ├── prototype.html            # інтерактивний мокап
    └── jsx-reference/            # extracted JSX from prototype
        ├── DraftScreen.jsx
        ├── AllocSheet.jsx
        ├── LockedScreen.jsx
        ├── BrowseScreen.jsx
        ├── LiveScreen.jsx
        ├── PhoneShell.jsx
        ├── App.jsx
        └── tweaks-panel.jsx
```

---

## 16. Перші кроки для Claude Code

1. **Read** `./TZ.html`, `./prototype.html`, `./jsx-reference/*.jsx`
2. **Read** `apps/web/src/features/team-builder/CLAUDE.md`, `apps/web/CLAUDE.md`, `docs/INVARIANTS.md`
3. **Decide on INV-3** (Open question #1) — або згенеруй ADR з `step=1, min=0`, або переконвертуй мокап на `step=5, min=5`
4. **Start Milestone 1** (Foundation): tailwind config, format utils, sparkline. Один PR
5. **Milestone 2** (AllocSheet): окремий PR з standalone story / dev route. Це найважливіший компонент — приділи увагу деталям

Після кожного milestone:

- `pnpm typecheck && pnpm lint && pnpm test`
- Перевірити acceptance criteria для цього milestone
- 1 коміт = 1 milestone (per CLAUDE.md rule #5)

---

**Документ:** TZ-001 · v1 · 30 квіт 2026
**Статус:** Готовий до імплементації. Заблокований на Open Question #1 (INV-3) — потрібне рішення продукту перед початком M2.
