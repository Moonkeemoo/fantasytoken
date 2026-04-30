# ADR-0004: Contests v2 — Matrix Concept, Multi-Entry, Duration-XP

**Status:** Accepted
**Date:** 2026-04-30

## Context

MVP-ladder (16 однотипних slots з kickoff кожні 5 хв) виконав свою функцію — підтвердив, що contest UX працює. Але прод-метрики показують obvious проблеми:

1. **Дублікати плутають.** 16 cells у lobby — це 5 контестів × ~3 копії. Юзер не розуміє, чому є три "Quick Match" і який обирати.
2. **Cadence одноманітна.** Все стартує та фіналізується синхронно (10m intervals). Гравцю нема чого "чекати" чи "готуватися" — лише grind.
3. **Прогресія однопланова.** Анлок по рангу відкриває **тільки вищий стейк**, не варіативність. Гравець на R20 робить те саме що на R5, лише дорожче.
4. **Немає spectate.** Контести де юзер не бере участі — невидимі. Це рве social proof loop.
5. **Немає long-form.** Все — 10m. Жоден формат не дає "про що думати тиждень".

Бренд-обіцянка ("DraftKings для крипто, нативно в TG") вимагає рясного, диференційованого формат-середовища, а не trivial-loop.

## Decision

### 1. Контест-матриця замість ladder

Кожен контест — унікальний live-instance в комірці `(duration_lane × stake_tier × mode)`.

- **Lanes:** `10m / 30m / 1h / 24h / 7d`
- **Stakes:** `Free / 🪙 1 / 🪙 5 / 🪙 25 / 🪙 100 / 🪙 500`
- **Modes:** `bull / bear`

Не всі клітинки існують — тільки осмислені (див. `docs/specs/contests-v2/DESIGN.md` §1). Загалом ~19 cells одночасно живуть.

**Інваріант (новий, INV-13):** в одному `(duration_lane × stake_tier × mode)` — рівно один live-instance зі статусом ∈ {scheduled, active}. Коли finalized, scheduler створює наступний з тим самим `matrix_cell_key`.

### 2. Multi-entry без обмежень

Гравець може бути одночасно у скількох завгодно лайв-контестах. `entries (user_id, contest_id)` UNIQUE інваріант — обмежує **одне entry per контест**, не паралелізм.

Жодних "you have an active contest" blocks. Soft warning при ≥ 6 live, але без hard cap.

### 3. Rank-driven variety progression

Анлок по рангу відкриває **спершу варіативність тривалості**, потім стейк. Гравець на R10 має вибір "швидко-дешево / повільно-серйозно", не лише "дорожче".

Перші три ранки (R1→R3) — **action-gated** (X games done), не лише XP-gated. Це onboarding curriculum.

### 4. Duration XP multiplier

`contests.xp_multiplier` (вже існує у схемі) заповнюється scheduler'ом за таблицею:

```
10m Practice  0.5×
10m paid      1.0×
30m           1.15×
1h            1.3×
24h           1.6×
7d Marathon   2.0×
```

Стеля — 2.0×. Marathon **навмисно НЕ XP-efficient** — заходять заради призу, не XP.
10m grinder за тиждень = 2 100 XP, Marathon солітер = 20 XP. Це orthogonal lanes.

### 5. Spectator mode

Окремий tab у lobby для контестів де юзер не бере участі. Top-10 leaderboard + час + CTA на наступний slot. Lineup top-1 — НЕ розкривається до finalize (anti-copycat).

### 6. Pay-curve без змін

`top 50% geometric` (commit cd70d43) — не чіпаємо. Ризик/виграш не гіпертюнімо за тривалістю; різниця у досвіді — за **розміром cap**, **частотою події**, **варіативністю lineup**.

## Consequences

### Positive

- Lobby читається за 5 секунд: 4 зони (My / Soon / Watch / Locked).
- Cadence заповнена: kickoff 10m кожні 2 хв, 30m кожні 7 хв, 1h кожні 15 хв, 24h fixed UTC, Marathon Monday.
- Variety progression дає reason повертатися: новий lane відчувається як reward.
- Spectator закриває social-proof loop: гравець бачить "там кипить життя", навіть коли сам не грає.
- Marathon — naturalний engagement hook на тиждень.

### Negative / risks

- **24h може не наповнюватися** при малій user base. Mitigation: cancel + refund з cap=100; floor для cancel = 30 entries.
- **Marathon — single-shot еxperiment.** При <250 entries skip week. Ship behind feature-flag `MARATHON_ENABLED` для першого місяця.
- **Multi-entry → passive losses.** Юзер заходить у 8 контестів, забуває про них, ловить bottom-50% усюди. Mitigation: soft warning + DM-bundle на finalize.
- **Schema migration:** додаємо `duration_lane`, `stake_tier`, `mode`, `matrix_cell_key` колонки. Existing live ladder cells мігрують у нову схему через one-shot SQL. Risk: drift cron-jobs під час migration → запускаємо у window де ladder paused.
- **Lobby grid 19 cards може бути overwhelming** для R20+. Mitigation: default tab "My + soon" (3-5 cards), повний grid за `Browse all` гестом.

### Trade-offs explicitly не взяті

- **Sector / theme контести** (DeFi, Memes only): викинуто бо обмежує token pool, додає complexity без чіткого engagement signal.
- **Winner-takes-most curve:** залишаємо top 50%. Геометрична крива вже даємо stratification у виплатах; перегин у whale-take-all робить контести "лотереями", що шкодить retention.
- **12h, 4h lanes:** з 5 lanes густина cadence вже достатня; добавляти проміжки = decision fatigue.

## Invariant changes

### Add INV-13

> **INV-13** — Унікальність матричної комірки. У будь-який момент часу для конкретного `(duration_lane, stake_tier, mode)` існує ≤ 1 контестів зі `status ∈ ('scheduled', 'active')`. Coverage через `UNIQUE INDEX idx_one_live_per_cell ON contests(matrix_cell_key) WHERE status IN ('scheduled','active')`. Consequence if violated: дубльовані instances, lobby плутає юзера, scheduler stuck у race condition.

(Раніше INV-13 фігурував у деяких файлах щодо referrer immutability — перевірити та переномерувати при впровадженні.)

## Alternatives considered

1. **Залишити ladder, додати tier-tags.** Найпростіше — нічого не міняти, лише lobby filter. Відкинуто: дубльовані cells лишаються, cadence не змінюється, marathon некуди вставити.

2. **Tournament brackets** (qualify→semi→final). Цікаво, але вимагає round-based логіки, scheduling кошмар, copy не "DraftKings". Викинуто.

3. **Sector/theme as core differentiator** (Memecoin lane, DeFi lane). Викинуто: обмежує token pool, додає правила вибору, копірайт-тертя ("ви не можете додати $BTC у мемекоін кубок"). Назви залишаємо як cosmetic flavor.

4. **Прогресія тільки за стейком (без variety lanes).** Простіше, але гравець на R30 робить те ж саме що на R5. Викинуто бо фундаментально не вирішує "чому повертатися".

## Migration notes

Schema-change плануємо як zero-downtime:

1. Додати nullable колонки `duration_lane`, `stake_tier`, `mode`, `matrix_cell_key`.
2. Backfill existing live cells (10m bull/bear ladder) у нову схему.
3. Додати UNIQUE INDEX (вже після backfill — щоб не зламати legacy cells).
4. Замінити ladder cron на matrix scheduler.
5. (Optional) drop legacy ladder columns у v2.1.

Existing entries / contests не торкаються — лише нові поля заповнюються.

## References

- Full design: `docs/specs/contests-v2/DESIGN.md`
- Onboarding plan (R1→R3): same file, §8
- Pay-curve (unchanged): commit `cd70d43`
- INV-3 (allocation rules): ADR-0003
- Coins economy: TZ-002 (`docs/specs/coins-economy/`)
