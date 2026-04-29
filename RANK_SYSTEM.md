# Rank System — Design Spec

> XP-driven progression система. Замикає onboarding (gate-via-rank), retention (рости daily) і соц. proof (rank скрізь видно).
>
> **Status:** 🟢 design locked, 🔴 implementation not started
> **Last update:** 2026-04-29
> **Visual reference:** [docs/mockups/rank-system.html](mockups/rank-system.html) — інтерактивний дашборд з ladder, графіками XP curve, симулятором progression, mockup-ами 4 UI surfaces
> **Cross-refs:** [INVARIANTS.md](INVARIANTS.md), [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §Game Design > Progression, [MVP.md](MVP.md) §10 Deferred (Achievements/XP/levels було deferred — цей doc розморожує)

---

## TL;DR

- **30 рангів** у 6 tier groups (Newbie → Trader → Degen → Whale → Legend → Mythic)
- Display формат: `Rank 7 · Trader II`
- XP заробляється у `contests.finalize` від участі (10) + position bonus (#1 = +100, top-30% = +5)
- Bear contests дають **×1.5 multiplier** (incentivize INV-4 диференціатор)
- Контест має `min_rank` поле — gating контенту через ранг
- Season = 4 тижні, в кінці **soft reset**: drop 5 ranks, capped at Rank 5 minimum
- `xp_total` (career) і `xp_season` (поточний сезон) трекаються окремо
- Career-highest зберігається як persistent achievement

---

## 1. Architecture

### 1.1 Rank ladder (30 ranks, 6 tier groups)

| Tier   | Ranks | Color     | Тематичний образ          |
| ------ | ----- | --------- | ------------------------- |
| Newbie | 1-5   | `#8a8478` | Сірий — ще не визначився  |
| Trader | 6-10  | `#6b8e6b` | Зелений — ростуть         |
| Degen  | 11-15 | `#5a7ba8` | Синій — серйозний         |
| Whale  | 16-20 | `#8a5fa8` | Фіолетовий — рідкісний    |
| Legend | 21-25 | `#c97a3a` | Бронзовий — досвід        |
| Mythic | 26-30 | `#d4441c` | Червоний — endgame, рідкі |

### 1.2 Naming convention

Display: **`Rank N · Tier Roman`**

- `Rank 1 · Newbie I`
- `Rank 12 · Degen II`
- `Rank 30 · Mythic V`

Roman numeral = position у tier (I-V). Кожен tier має 5 sub-ranks.

### 1.3 XP thresholds (cumulative)

```ts
// packages/shared/src/ranks/rank-curve.ts
export const RANK_THRESHOLDS = [
  0,
  30,
  80,
  150,
  250, // Newbie I-V
  400,
  600,
  850,
  1150,
  1500, // Trader I-V
  2000,
  2600,
  3300,
  4100,
  5000, // Degen I-V
  6200,
  7500,
  9000,
  10800,
  12800, // Whale I-V
  15000,
  17500,
  20500,
  24000,
  28000, // Legend I-V
  33000,
  39000,
  46000,
  54000,
  65000, // Mythic I-V
] as const;
```

Curve: ~геометричний ріст з base=1.22, вручну скоригованo для psychologically nice numbers.
Можна tune: `b=1.18` для softer (швидший Mythic), `b=1.27` для steeper grind.

### 1.4 Player progression projection (4-тижневий сезон)

| Profile  | Поведінка                    | Реальна distribution за сезон |
| -------- | ---------------------------- | ----------------------------- |
| Casual   | 1 контест/день, ~15 XP avg   | → Rank 5 (Newbie V)           |
| Engaged  | 3 контести/день, ~30 XP avg  | → Rank 14 (Degen IV)          |
| Hardcore | 5 контестів/день, ~80 XP avg | → Rank 27 (Mythic II)         |

**Critical for design:** Casual юзер встигає отримати Bear unlock (Rank 5) у перший сезон — це core differentiator має бути доступним усім.

---

## 2. XP Economy

### 2.1 Award formula

```
xp = ceil((10 + position_bonus) × contest_multiplier)
```

### 2.2 Position bonus (1-based position проти `realEntries.length`)

| Position      | Bonus | Logic                          |
| ------------- | ----- | ------------------------------ |
| #1 (winner)   | +100  | top spot                       |
| #2            | +60   |                                |
| #3            | +40   |                                |
| #4-5          | +25   |                                |
| #6-10         | +15   |                                |
| #11 → top 30% | +5    | still in prizes                |
| Below top 30% | +0    | just participation reward (10) |

`top 30%` = `floor(realEntries.length * 0.3)`. Узгоджено з prize curve у MVP.md §3.1.

### 2.3 Contest multipliers

`contest.xp_multiplier` поле — final multiplier стора в DB. Розраховується при створенні контесту. Базові:

| Modifier                 | ×    | Why                              |
| ------------------------ | ---- | -------------------------------- |
| Bull contest (default)   | 1.0  | baseline                         |
| Bear contest             | 1.5  | incentivize INV-4 differentiator |
| Quick Match (low stakes) | 1.0  | baseline                         |
| Degen-tier contest       | 1.25 | reward stake                     |
| Whale Vault              | 1.5  | premium tier                     |
| Legend League            | 2.0  | endgame                          |

Multipliers множаться сумарно. Top-3 у Bear Whale Vault: `(10 + 40) × 1.5 × 1.5 = 112.5` → ceil = **113 XP**.

### 2.4 Examples

| Scenario                                  | XP  |
| ----------------------------------------- | --- |
| Quick Match, finished #15 of 20           | 10  |
| Quick Match, finished #5                  | 35  |
| Quick Match, finished #1                  | 110 |
| Bear Trap, finished #3                    | 75  |
| Bear Apocalypse (Degen-tier), finished #1 | 206 |
| Whale Vault, finished #2                  | 158 |
| Legend League (Bear), finished #1         | 330 |

---

## 3. Content unlocks per rank

Це тіло onboarding-funnel + long-term retention loop. Кожен рейтинг (окрім деяких filler-ranks) щось відкриває.

### 3.1 Onboarding (Ranks 1-5)

| Rank           | Unlock                                | Effect                                               |
| -------------- | ------------------------------------- | ---------------------------------------------------- |
| 1 · Newbie I   | **Welcome Match** (single free intro) | Юзер змушений зіграти один раз. Розуміє правила.     |
| 2 · Newbie II  | **Quick Match** ($1 entry)            | Перший paid контест. Виходить з tutorial.            |
| 3 · Newbie III | **Memecoin Madness** ($5 entry)       | Theme variety відкривається.                         |
| 4 · Newbie IV  | **Profile badge slot** (cosmetic)     | Можна обрати badge для display.                      |
| 5 · Newbie V   | **Bear Trap** — перший Bear контест   | Core диференціатор відкривається. Ідеальний таймінг. |

### 3.2 Mid-game (Ranks 6-15)

| Rank           | Unlock                                           |
| -------------- | ------------------------------------------------ |
| 7 · Trader II  | High-Stakes Quick Match ($10 entry)              |
| 8 · Trader III | Custom share-card themes (3 visual variants)     |
| 10 · Trader V  | Trader Cup — weekly tournament for ranks 10-14   |
| 12 · Degen II  | Bear Apocalypse ($25 Bear contest)               |
| 14 · Degen IV  | Animated badge effects (premium look)            |
| 15 · Degen V   | Degen-only contests (gated entry, higher prizes) |

### 3.3 End-game (Ranks 16-30)

| Rank            | Unlock                                               |
| --------------- | ---------------------------------------------------- |
| 18 · Whale III  | Whale Vault — premium contests з largest prize pools |
| 20 · Whale V    | Username color на leaderboards (gold accent)         |
| 23 · Legend III | Legend League — exclusive monthly tournament         |
| 30 · Mythic V   | Mythic Cup — monthly, top stake, "I am the storm"    |

### 3.4 Як це працює як onboarding driver

Юзер новий → бачить лобі з **одним unlocked-контестом** + **4-5 locked teasers нижче** з "🔒 Unlocks at Rank 2-5". Це не frustrating — це **aspirational**. Юзер чітко бачить shortest path: "грай → ранк → відкрилось". Перший контест дає 110 XP (winner) або 35 XP (top-5) → одразу Rank 2. Іnstant gratification + immediate next goal.

---

## 4. Season mechanic

### 4.1 Тривалість

4 тижні (28 днів). Прив'язка до календарних місяців:

- Season 1 = April 2026 (2026-04-01 → 2026-04-30)
- Season 2 = May 2026
- ...

### 4.2 Що скидається при season end

- `users.xp_season` → 0
- `users.current_rank` → `MAX(5, current_rank - 5)` (soft reset, capped мінімум на Rank 5)

### 4.3 Що зберігається

- `users.xp_total` (career — never resets)
- `users.career_highest_rank` (max ranking ever achieved)
- Усі trophy-badges за минулі сезони ("Reached Rank 24 in Season 1")

### 4.4 Що нагороджується

- **Top-100 за `xp_season`** → bonus prize pool (Stars розділяються)
- **Top-10 за `xp_season`** → permanent "Season Champion" badge з номером сезону + special username effect

### 4.5 Чому soft reset (rationale)

Hard reset (всі → Rank 1) ламає content gating — veteran знову не може грати у Whale Vault. Soft drop робить fresh grind, але baseline access зберігається. Це Hearthstone-pattern, перевірений у production.

Cap at Rank 5 = новачок який досягнув Rank 6 за 1 контест не повертається у "1 free контест" tutorial. Onboarding одноразовий.

---

## 5. UI Surfaces

Усі mockup-и: див. [docs/mockups/rank-system.html](mockups/rank-system.html) tab "UI surfaces".

### 5.1 Lobby — rank chip (always visible)

**Місце:** в існуючому `apps/web/src/features/lobby/Header.tsx`, праворуч (де зараз `+ Top up` button).

**Візуал:** mini-pill з чорним bg, accent-red rank circle: `(7) Trader II · 240/350 XP`.

**Tap:** `navigate('/me/rank')` — відкриває окремий screen з повною ladder + history.

**Інтегрується в:** Lobby, Live (через існуючий header pattern), Result.

### 5.2 Lobby — next-rank teaser banner

**Місце:** новий компонент `apps/web/src/features/lobby/NextRankTeaser.tsx`. Render після `<Header />`, перед `<Tabs />`.

**Візуал:** жовтий paper note (як streak widget у профайлі mockup'ах). Headline формула:

> Reach **Rank N · TierName** to unlock **UnlockName**

Progress-bar показує `(xp_total - prev_threshold) / (next_threshold - prev_threshold)`.

**Edge case Mythic V:** замінюється на "Defend your Mythic crown — N XP за сезон".

**Data source:** новий endpoint `GET /lobby/teaser` (див. §7).

### 5.3 Lobby — locked contest cards

**Місце:** existing `apps/web/src/features/lobby/ContestList.tsx`, додати рендер для `min_rank > current_rank` контестів.

**Візуал:** `opacity: 0.85` + `bg-paper-dim` + чорна "🔒 RANK N" plate у top-right corner. Ціна/тип dimmed.

**Сортування:** unlocked спочатку, потім locked у порядку зростання `min_rank`. **Не ховай locked** — вони aspirational, не frustrating.

**Tap на locked card:** show toast/modal з рангом + XP лишилось. Не navigate.

### 5.4 Result — XP breakdown block

**Місце:** новий блок у `apps/web/src/features/result/Result.tsx`, після основного prize-summary.

**Візуал:** окремий блок з `bg-code-bg` background. Показує breakdown по черзі (stagger 100ms):

- "Participation +10"
- "3rd place bonus +40"
- "Bear contest ×1.5 +25" ← bonus modifiers кольоровані в `text-ftl` (purple) щоб підкреслити
- "Total +75" (великим accent)

Прогрес-bar показує **both:** де був до (full bg) + скільки додалось (накладений yellow segment) — visceral feedback.

**Data source:** server повертає `xp_award.breakdown[]` у result response.

### 5.5 Result — RANK UP overlay (the killer moment)

**Місце:** окремий full-screen overlay у `Result.tsx`. Триггериться **ТІЛЬКИ якщо rank changed** після цього контесту.

**Trigger order:**

1. Спочатку показуємо звичайний result + XP breakdown
2. Bar заповнюється до 100% (animate 600ms)
3. Show overlay (full-bleed, accent gradient): `★ RANK UP ★ / RANK 8 / TRADER III`
4. Block з NEW UNLOCK (назва + 1-line опис)
5. CTA `Customize now →` веде юзера ВІДРАЗУ туди де новий unlock

**Tactile:** TG SDK `HapticFeedback.notificationOccurred('success')` при show.

**Не лиши момент висіти.** Якщо unlock = новий контест → CTA веде у `/lobby` з підсвіченим card. Якщо cosmetic → веде у `/me/customize`.

### 5.6 Profile — rank section

**Місце:** новий блок у Profile screen, **ПЕРЕД stats grid** (вище секції 4 з [profile mockup](mockups/profile-screen.html)).

**Візуал:**

- Великий tier icon (48px, color = tier color)
- "Rank 7 · Trader II" жирно
- "SEASON 1 · APRIL 2026" mono uppercase
- Progress bar з XP до наступного rank
- Trophy line: `CAREER HIGH: RANK 12 · DEGEN II · S1 TROPHIES: 0`

**Tap на tier icon:** opens `/me/rank` (повна ladder з історією).

### 5.7 Leaderboards — rank поряд з username

**Місце:** existing `apps/web/src/features/rankings/Rankings.tsx` row component.

**Візуал:** mini rank-badge біля імені: `(12) Andriy`. Для Whale+ tier — gold-accent username (cosmetic unlock at Rank 20).

**Optional V2 filters:** "Show only Whale+", "My league" (current rank ±2).

### 5.8 Visual continuity (важливо для дизайнера)

**Rank chip (Lobby) і Profile rank section мають бути ВІЗУАЛЬНО CONNECTED.** Той самий tier icon, той самий progress bar style. Юзер натискає chip → бачить розгорнуту версію того ж самого. Continuity → mental model.

Tier icons можуть еволюціонувати від простих квадратів (Newbie) до складних геральдичних форм (Mythic) — це додаткова тиха progression visualization.

---

## 6. DB schema changes

Migration `0005_xp_ranks.sql`:

```sql
-- 1. Extend users table
ALTER TABLE users ADD COLUMN xp_total bigint NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN xp_season bigint NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN current_rank int NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN career_highest_rank int NOT NULL DEFAULT 1;

-- 2. XP audit log (immutable, like transactions per INV-9 pattern)
CREATE TABLE xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  contest_id uuid REFERENCES contests(id),
  delta_xp int NOT NULL,
  reason varchar(32) NOT NULL,  -- 'participation' | 'position' | 'bonus' | 'season_reset'
  breakdown jsonb,              -- structured: { participation: 10, position: 40, bear_mult: 1.5 }
  season_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX xp_events_user_created_idx ON xp_events(user_id, created_at DESC);

-- 3. Seasons
CREATE TABLE seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number int NOT NULL UNIQUE,
  name text NOT NULL,            -- "April 2026"
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active'  -- 'active' | 'finalized'
);

-- 4. Extend contests for gating + XP multiplier
ALTER TABLE contests ADD COLUMN min_rank int NOT NULL DEFAULT 1;
ALTER TABLE contests ADD COLUMN xp_multiplier numeric(3,2) NOT NULL DEFAULT 1.0;
```

Drizzle schema файли:

- `apps/api/src/db/schema/users.ts` — додати 4 columns
- `apps/api/src/db/schema/xp_events.ts` — новий
- `apps/api/src/db/schema/seasons.ts` — новий
- `apps/api/src/db/schema/contests.ts` — додати 2 columns
- `apps/api/src/db/schema/index.ts` — re-export нового

---

## 7. Pure functions у `packages/shared/src/ranks/`

### 7.1 `rank-curve.ts`

```ts
export const RANK_THRESHOLDS = [
  /* див. §1.3 */
] as const;
export const MAX_RANK = 30;

export const TIER_GROUPS = [
  { name: 'Newbie', ranks: [1, 5], color: '#8a8478' },
  { name: 'Trader', ranks: [6, 10], color: '#6b8e6b' },
  { name: 'Degen', ranks: [11, 15], color: '#5a7ba8' },
  { name: 'Whale', ranks: [16, 20], color: '#8a5fa8' },
  { name: 'Legend', ranks: [21, 25], color: '#c97a3a' },
  { name: 'Mythic', ranks: [26, 30], color: '#d4441c' },
] as const;

export interface RankInfo {
  rank: number; // 1..30
  tier: string; // "Trader"
  tierRoman: string; // "II"
  display: string; // "Trader II"
}

/** Pure: O(log N) binary search через RANK_THRESHOLDS. */
export function rankFromXp(xp: number): RankInfo;

/** Pure: returns { current_xp_in_rank, total_xp_for_next, remaining }. */
export function xpToNextRank(xp: number): {
  current: number;
  next: number;
  remaining: number;
};

/** Pure: soft reset formula. */
export function applySeasonReset(currentRank: number): number {
  return Math.max(5, currentRank - 5);
}
```

### 7.2 `xp-award.ts`

```ts
export interface ContestResult {
  position: number; // 1-based
  totalRealUsers: number;
  contestType: 'bull' | 'bear';
  contestMultiplier: number; // contest.xp_multiplier (already accounts for tier/bear)
}

export interface XpBreakdown {
  reason: string; // "Participation" | "3rd place bonus" | "Bear contest ×1.5"
  amount: number; // delta added by this line
}

export interface XpAward {
  participation: number; // 10
  position: number; // 0..100
  bonusMultiplier: number; // 1.0..3.0 (effective from contestMultiplier)
  total: number; // ceil((participation + position) * bonusMultiplier)
  breakdown: XpBreakdown[]; // for UI display
}

/** Pure: Compute XP award from contest result. */
export function awardXp(r: ContestResult): XpAward;
```

### 7.3 Test plan

`packages/shared/src/ranks/rank-curve.test.ts`:

- `rankFromXp(0) → Rank 1 · Newbie I`
- `rankFromXp(30) → Rank 2 · Newbie II`
- `rankFromXp(29) → Rank 1 · Newbie I`
- `rankFromXp(64999) → Rank 29 · Mythic IV`
- `rankFromXp(65000) → Rank 30 · Mythic V`
- `rankFromXp(999999) → Rank 30 · Mythic V` (cap)
- `applySeasonReset(7) → 5`
- `applySeasonReset(20) → 15`
- `applySeasonReset(3) → 5` (cap)

`packages/shared/src/ranks/xp-award.test.ts`:

- All examples from §2.4

---

## 8. Backend wiring

### 8.1 Hook into `contests.finalize`

`apps/api/src/modules/contests/contests.finalize.ts` — extend existing function.

```ts
async finalize(contestId: string) {
  // ... existing finalization (compute final_score, distribute prizes)
  for (const entry of realEntries) {
    const award = awardXp({
      position: entry.position,
      totalRealUsers: realEntries.length,
      contestType: contest.type,
      contestMultiplier: Number(contest.xpMultiplier),
    });
    await db.transaction(async (tx) => {
      // 1. Audit log (immutable per new INV-11)
      await tx.insert(xpEvents).values({
        userId: entry.userId,
        contestId,
        deltaXp: award.total,
        reason: 'contest_finalized',
        breakdown: award.breakdown,
        seasonId: currentSeasonId,
      });
      // 2. Update denormalized counters + rank
      const newXpTotal = currentXpTotal + award.total;
      const newRank = rankFromXp(newXpTotal).rank;
      await tx.update(users)
        .set({
          xpTotal: sql`xp_total + ${award.total}`,
          xpSeason: sql`xp_season + ${award.total}`,
          currentRank: sql`GREATEST(current_rank, ${newRank})`,
          careerHighestRank: sql`GREATEST(career_highest_rank, ${newRank})`,
        })
        .where(eq(users.id, entry.userId));
    });
  }
}
```

**INV-7 logging:** wrap у `try/catch` з `logger.error`. Failure XP award не повинен блокувати prize distribution — обидва у різних transactions.

### 8.2 Backfill XP for existing finalized contests

One-shot script `apps/api/src/scripts/backfill-xp.ts` — iterate через всі `entries WHERE status = 'finalized'`, compute XP, insert events. Run once після migration.

---

## 9. New API endpoints

### 9.1 `GET /me/rank`

```ts
// response
{
  currentRank: number,        // 1..30
  currentTier: string,        // "Trader"
  currentTierRoman: string,   // "II"
  display: string,            // "Trader II"
  xpTotal: number,
  xpSeason: number,
  xpInCurrentRank: number,    // progress within current rank
  xpForNextRank: number,      // total needed for next rank threshold
  careerHighestRank: number,
}
```

### 9.2 `GET /me/rank/events?limit=20`

Recent XP events для "rank history" UI (V2). Returns `xp_events` rows for current user.

### 9.3 `GET /seasons/current`

```ts
{
  id: string,
  number: number,             // 1, 2, 3, ...
  name: string,               // "April 2026"
  startsAt: string,           // ISO
  endsAt: string,             // ISO
  daysLeft: number,
}
```

### 9.4 `GET /lobby/teaser`

```ts
// response
{
  nextRank: number,           // current_rank + 1, or null if Mythic V
  xpToNext: number,
  nextUnlock: {
    name: string,             // "Custom Share-Card themes"
    type: 'contest' | 'cosmetic' | 'feature',
    description: string,      // 1-line for banner
  } | null,
} | null  // null if user at Mythic V (no more unlocks)
```

### 9.5 `GET /contests` — extension

Add query param `include_locked: boolean` (default: `true`). Each contest item now includes `min_rank: number`. Frontend filters/sorts based on user's current rank.

---

## 10. Cron / season management

### 10.1 New cron у `apps/api/src/server.ts`

```ts
const stopSeasonCheck = scheduleEvery({
  intervalMs: HOUR,
  fn: async () => {
    await seasons.tick();
  },
});
```

### 10.2 `seasons.service.ts`

```ts
async tick() {
  const current = await this.getCurrentSeason();
  if (!current || Date.now() < current.endsAt.getTime()) return;

  await this.db.transaction(async (tx) => {
    // 1. Distribute season prizes (top-100 by xp_season) — INV-9 currency
    // 2. Award "Season Champion" badges to top-10
    // 3. Soft reset all users:
    //    UPDATE users SET
    //      current_rank = GREATEST(5, current_rank - 5),
    //      xp_season = 0;
    // 4. Mark current season as finalized
    // 5. INSERT next season (auto by month)
  });
}
```

**For MVP:** можна defer cron — Season 1 створити manual через admin endpoint (`POST /admin/seasons/init`). Реальний season tick потрібен лише наприкінці першого місяця.

---

## 11. Proposed new INVARIANTS

Додати у [INVARIANTS.md](INVARIANTS.md):

**INV-11** — XP awards immutable. Once written to `xp_events`, never UPDATE. Усі зміни XP підуть як новий event row (REVERSAL для виправлень). `users.xp_total` / `users.xp_season` — denormalized cache; `xp_events` — source of truth. Pattern скопійовано з INV-9 (currency). Consequence: XP drift від audit log → дисputable rank, неможливо відтворити стан.

**INV-12** — Rank може йти тільки вгору в межах сезону. Outside season-end soft reset, `current_rank` ніколи не зменшується. Backend гарантує через `GREATEST(current_rank, new_rank)` у contest.finalize. Consequence: юзер втрачає прогрес і кидає app.

---

## 12. Implementation order — ~5-7 днів

1. **Day 1.** Migration + `packages/shared/src/ranks/` pure functions + tests for rank curve. Drizzle schemas updated.
2. **Day 2.** Wire `awardXp` into `contests.finalize`. Backfill XP script для existing finalized contests.
3. **Day 3.** API endpoints (`/me/rank`, `/lobby/teaser`, `/seasons/current`). Update existing `/contests` to return `min_rank` + sort logic.
4. **Day 4.** Frontend: Lobby rank chip + teaser banner + locked contest cards.
5. **Day 5.** Frontend: Result XP breakdown + RANK UP overlay (з haptic feedback).
6. **Day 6.** Frontend: Profile rank section + Leaderboards rank badge.
7. **Day 7 (optional).** Season cron + season finalize logic. Можна defer на пізніше — Season 1 manual через admin.

---

## 13. Open questions / decisions deferred

| Topic                            | Default for V1                           | Trigger to revisit                                                  |
| -------------------------------- | ---------------------------------------- | ------------------------------------------------------------------- |
| Curve steepness (`b` parameter)  | b=1.22 (геометричний)                    | Якщо аналітика покаже >40% юзерів стопориться <Rank 5               |
| Bear multiplier value            | ×1.5                                     | Якщо Bear contests залишаться underplayed → bump до ×2.0            |
| Min position for any XP          | top 30% (else just +10 participation)    | Може скоригувати на top 50% якщо погано retain'имо low-skill юзерів |
| Season prize pool source         | TBD — house-funded або % з paid contests | Перед season 1 launch                                               |
| Season trophy badges visual      | Тільки текстовий "Season 1 Champion" V1  | V2 — animated badges, custom borders                                |
| Mid-season rank changes (manual) | Тільки через admin endpoint              | Якщо exploit або rollback потрібен                                  |

---

## 14. Cross-references

- **Visual mockup:** [docs/mockups/rank-system.html](mockups/rank-system.html) — 5 інтерактивних tabs з ladder, графіками, mockups, implementation spec
- **Profile screen:** [docs/mockups/profile-screen.html](mockups/profile-screen.html) — там Rank section повинна йти ПЕРЕД Stats grid (секція 4)
- **Invariants:** INV-4 (Bear formula — XP multiplier гармонізує з ним), INV-7 (logging — wrap awardXp в try/catch), INV-9 (currency atomic — XP audit іде тим же pattern), INV-11/12 (нові, цим документом проponуються)
- **MVP.md §10 Deferred:** "Achievements, XP, levels, streaks, badges" — цей doc розморожує XP/levels компонент. Achievements/badges — окремий доc TBD.
- **MVP.md §11 Beyond original MVP:** додати рядок "XP/Rank system — designed 2026-04-29" коли почнемо implement.
