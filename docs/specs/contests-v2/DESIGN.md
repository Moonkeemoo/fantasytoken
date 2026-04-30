# Contests v2 — Design

> Status: Approved (concept) · Date: 2026-04-30 · Owner: tomoonkee
> Implementation: see `Milestones` at the bottom.

## TL;DR

Заміна "ladder-snapshot" (16 однотипних slots, kickoff кожні 5 хв) на **контест-матрицю**:
кожен контест — унікальний live-instance в комірці `(тривалість × стейк × мод)`.
Заходити можна у скільки завгодно одночасно, але в одну комірку — **лише раз**.
Прогресія по рангу відкриває **варіативність** (нові lanes / stakes), а не лише вищий стейк.

---

## Goals

1. **Paralel multi-entry:** гравець заходить у скільки завгодно лайв-контестів одночасно, але в кожен унікальний — раз.
2. **Унікальність instance'ів:** Quick Match не дублюється — поки один біжить, наступний не стартує.
3. **Cadence:** у будь-який момент є що дивитися · у що зайти зараз · до чого готуватися · що очікувати як result.
4. **Rank-driven variety:** ріст рангу відкриває нові lanes (тривалості), нові стейки, нові моди — **вибір**, не лише розмір.
5. **Spectator mode:** контести де юзер не бере участь — переглядаються в окремому, простому UI.
6. **Без перегину економіки:** prize-curve `top 50% geometric` не чіпаємо. XP-bonus за тривалість стримана.

## Non-goals (свідомо викидаємо)

- Sector / volatility / theme модерація (memecoin-only, DeFi-only тощо). Token pool **єдиний**, назви — лише flavor.
- Winner-takes-most curve. Як зараз — top 50%.
- 12h, 4h lanes. Тільки `10m / 30m / 1h / 24h / 7d`.
- Streak multipliers, prize boosts, first-of-lane bonuses.
- Token heatmaps, sector breakdowns у spectator.
- Reveal top-1 lineup до lock — anti-copycat.

---

## 1. Контест-матриця

Дві осі: **lane** (тривалість) × **stake**. Кожна заповнена комірка — одна або дві (bull/bear) **окремі instances**.

| Lane    | Cap | Free        | 🪙 1   | 🪙 5   | 🪙 25  | 🪙 100      | 🪙 500              |
| ------- | --: | ----------- | ------ | ------ | ------ | ----------- | ------------------- |
| **10m** |  20 | ✅ Practice | ✅ B/B | ✅ B/B | —      | —           | ✅ Lightning (R25+) |
| **30m** |  30 | —           | —      | ✅ B/B | ✅ B/B | —           | —                   |
| **1h**  |  50 | —           | —      | —      | ✅ B/B | ✅ B/B      | —                   |
| **24h** | 100 | —           | —      | —      | ✅ B/B | ✅ B/B      | ✅ Mythic           |
| **7d**  | 500 | —           | —      | —      | —      | ✅ Marathon | —                   |

`B/B` = bull AND bear → це **дві окремі комірки** (відповідно — два instances).

Загалом ~19 комірок одночасно живуть.

### Capacity logic

| Lane | Cap | Чому                                                                        |
| ---- | --: | --------------------------------------------------------------------------- |
| 10m  |  20 | Тісно, snappy result. Малий cap → легко bot-fill.                           |
| 30m  |  30 | +50% часу → +50% room.                                                      |
| 1h   |  50 | Година дає спільноті час сформуватися. Bot-fill не потрібен.                |
| 24h  | 100 | День → достатньо органічного потоку. **Не наповнюється → cancel + refund.** |
| 7d   | 500 | Подія тижня, концентрує увагу. Floor 250 — інакше skip + refund.            |

### Total live capacity

`6×20 + 4×30 + 4×50 + 4×100 + 1×500 = 1 340` слотів відкритих у будь-який момент.

---

## 2. Анлок по рангу

```
R1   →  10m Free + 10m 🪙 1 (Quick, Bear Trap)
R3   →  + 10m 🪙 5 (Memecoin, Bear Cup)
R5   →  + 30m 🪙 5
R8   →  + 30m 🪙 25  ← перший крок у "довгу гру"
R10  →  + 1h 🪙 25 (Trader Cup)
R13  →  + 1h 🪙 100 (Whale Hour)
R15  →  + 24h 🪙 25 (Daily)  ← добовий ритм
R18  →  + 24h 🪙 100 (Daily Whale)
R22  →  + 7d Marathon  ← тижневий тентпол
R25  →  + 10m 🪙 500 (Lightning sprint-whale) + 24h 🪙 500 (Mythic)
```

Логіка прогресії: спочатку росте **варіативність тривалості**, далі — стейк. Юзер сам обирає **куди йти**:
швидко-дешево / повільно-серйозно / швидко-дорого.

UX:

- Lobby показує всі комірки. Залочені — silhouette + 🔒 + `unlocks at R N`.
- ≤ 2 ranks нижче поточного → warm orange ("almost"). > 2 → grey.
- Rank-up splash: одна toast `🔓 30m unlocked → Try it now`. Без bonus pools.

---

## 3. Cadence

Множинні комірки **рознесені у часі** (staggered) — щоб у юзера завжди було що робити.

| Lane            | Aggregate kickoff cadence             | Як рознесено                     |
| --------------- | ------------------------------------- | -------------------------------- |
| **10m**         | новий instance кожні **~2 хв**        | 6 cells, staggered ~100s apart   |
| **30m**         | кожні **~7-8 хв**                     | 4 cells                          |
| **1h**          | кожні **~15 хв**                      | 4 cells                          |
| **24h**         | **00:00 / 06:00 / 12:00 / 18:00 UTC** | fixed clock — 4 щоденні події    |
| **7d Marathon** | **Monday 00:00 UTC**                  | один на тиждень, mode чергується |

З погляду юзера:

- 🎯 Прямо зараз — 19 live, всі spectate-able.
- ⏱ За 2 хв — наступний 10m → entry.
- ⏰ За 25 хв — наступний 30m → time to think.
- 🌅 За 4 год — Daily Whale → daily ritual.
- 🏆 За 3 дні — Marathon фініш → big result moment.

---

## 4. Lobby UX — 4 зони

```
╔══════════════════════════════════════════════╗
║  Lobby                       🪙 142  R 10   ║
║  🎯 3 live · ⏰ 5 soon · 👀 9 watching      ║
╠══════════════════════════════════════════════╣
║                                              ║
║  ┌─ MY CONTESTS · 3 live ─────────────────┐ ║
║  │ ⚡ Quick · 10m 🪙 1 · 6m  🥈 #2 +4.2%  │ ║
║  │ 🌅 Daily Bull · 24h 🪙 25 · 14h #19    │ ║
║  │ 🏆 Marathon · 7d 🪙 100 · 4d #142      │ ║
║  └────────────────────────────────────────┘ ║
║                                              ║
║  ┌─ STARTING SOON · join now ─────────────┐ ║
║  │ ⚡ Quick Bear · 10m · 1m52s · 17/20    │ ║
║  │ 📊 30m Bull · 30m · 8m04s  · 12/30    │ ║
║  │ 💼 Trader Cup · 1h · 18m   · 24/50    │ ║
║  └────────────────────────────────────────┘ ║
║                                              ║
║  ┌─ WATCH LIVE · 9 running ───────────────┐ ║
║  │ 👀 Bear Trap · 4m · 🥇 +6.1%           │ ║
║  │ 👀 Daily Whale · 3h · 🥇 +9.4%         │ ║
║  │            ▾ show all (9)              │ ║
║  └────────────────────────────────────────┘ ║
║                                              ║
║  ┌─ LOCKED · keep playing to unlock ──────┐ ║
║  │ 🔒 Whale Hour · 1h 🪙 100 · R 13       │ ║
║  │ 🔒 Marathon · 7d 🪙 100 · R 22         │ ║
║  └────────────────────────────────────────┘ ║
╚══════════════════════════════════════════════╝
```

### Стани

```
       ┌─ scheduled, not joined  →  STARTING SOON  → JOIN
       ├─ scheduled, joined      →  MY CONTESTS    "kicks off in…"
contest┤
       ├─ active, joined         →  MY CONTESTS    "live · your rank"
       ├─ active, not joined     →  WATCH LIVE     spectator
       └─ rank > user.rank       →  LOCKED         "unlock at R…"
```

### Сортування всередині зон

- **My contests:** за `ends_at ASC` — що закінчується першим, зверху.
- **Starting soon:** за `starts_at ASC` — найближчий kickoff перший.
- **Watch live:** за `ends_at ASC` + bias на high-stakes (whale-watching value).
- **Locked:** за rank-distance ASC — те, що скоро відкриється, зверху.

### Header summary

`🎯 3 live · ⏰ 5 soon · 👀 9 watching` — постійний bar нагорі. Tap → respective section scrolls into view.

---

## 5. Spectator mode

Watch-only картка для контестів де юзер не бере участі:

```
┌──────────────────────────┐
│ Daily Whale Bull · 🪙100 │
│ ████░░░░  14h 22m left   │
│ 73 / 100 entries         │
│                          │
│ 🥇 +18.4%  CryptoNinja   │
│ 🥈 +14.1%  trader_42     │
│ 🥉 +11.8%  anon          │
│                          │
│ ▷ Watch                  │
└──────────────────────────┘
```

Watch screen — мінімум:

- Top 10 leaderboard (15s polling як зараз).
- Прогресс-bar часу.
- CTA `Next slot in Xh Ym → Notify me` → DM на kickoff (funnel у наступний slot).

**НЕ показуємо:** lineup картки до finalize, token heatmaps, sector breakdowns. Простота важливіша.

---

## 6. Marathon (7d) — деталі

- **Entry:** 🪙 100. Cap 500. Один instance на тиждень.
- **Schedule:** Monday 00:00 UTC → Sunday 23:59 UTC.
- **Mode:** чергується тиждень-у-тиждень. Тиждень bull, наступний bear.
- **Pay-curve:** той самий top 50% geometric. Без винятків.
- **Cancel:** якщо <250 entries за 6 днів → Sunday refund + skip week. Краще skip ніж фейк.
- **No early exit:** заходиш — на 7 днів. Інакше Marathon втрачає сенс.

---

## 7. XP — duration multiplier

`contests.xp_multiplier` (numeric 3.2, вже є у схемі) — заповнюється scheduler'ом за матрицею:

| Lane        | Stake              |     XP × | Чому                    |
| ----------- | ------------------ | -------: | ----------------------- |
| 10m         | Practice (Free)    |  **0.5** | Risk-free training      |
| 10m         | 🪙 1 / 🪙 5        |  **1.0** | Baseline                |
| 10m         | 🪙 500 (Lightning) |  **1.2** | Sprint-whale flavor     |
| 30m         | будь-який          | **1.15** | +15% за патієнс         |
| 1h          | будь-який          |  **1.3** | +30% — година рішень    |
| 24h         | будь-який          |  **1.6** | +60% — добова прив'язка |
| 7d Marathon | 🪙 100             |  **2.0** | Стеля. Не вище.         |

### Sanity check (week-grind comparison)

Припустимо `base_entry_xp = 10`:

| Сценарій тижня                         |   XP harvest |
| -------------------------------------- | -----------: |
| 10m grinder · 30/day × 7 = 210 entries | **2 100 XP** |
| 1h player · 4/day × 7 = 28 entries     |   **364 XP** |
| Daily Whale · 7 entries                |   **112 XP** |
| Marathon солітер · 1 entry             |    **20 XP** |

Marathon **навмисно НЕ XP-efficient** — заходять заради призу, не XP. 10m grinder отримує 100× більше XP за тиждень. Хочеш ранг — гриндь короткі; хочеш великий приз — почекай тиждень. Це навмисно ortogonal.

---

## 8. Onboarding R1 → R3

### Time budget

| T+  | Стан гравця                                 |
| --- | ------------------------------------------- |
| 0   | Tutorial / RefereeWelcome                   |
| 5m  | Lineup залочено у Practice                  |
| 15m | Перший result · R1→R2 · Quick Match unlocks |
| 30m | Перший **paid** lineup залочено             |
| 45m | Другий result · R2→R3 · Bear Trap unlocks   |
| 1h  | Self-directed, розуміє bull/bear            |

### Action-gated unlocks (рання частина)

```
R1 (start)        →  Practice 10m Free
R2 (1 done)       →  + Quick Match 10m 🪙 1   ← перший paid
R3 (3 done)       →  + Bear Trap 10m 🪙 1     ← перший bear
R4 (~8 done)      →  + 🪙 5 cells (Memecoin / Bear Cup)
R5+               →  далі за матрицею
```

Перші три ранки прив'язані до **дій (X games done)**, не лише до XP. Це learning curriculum, не grind.

### R1 — спрощений lobby

Тільки одна card видима — Practice. Інші зони (Starting soon / Watch / Locked) **сховано** до першого result.

### Wait engagement (10-min idle)

- Live P&L 15s polling
- 3 tip-cards rotate: bear-mode · allocation tactics · rank progression
- Внизу discreet CTA `▷ Watch a live whale battle` → spectator на 24h

### R2 — risk-acknowledge modal (one-time)

Перед AllocSheet першого paid:

```
🪙 1 entry — your real coins.
Top 50% wins. If you finish bottom half, the entry is gone.
[Cancel]   [I understand →]
```

### R3 — bear explainer (one-time, full-screen)

```
🐻 Bear contest
Same lineup. Reversed math.
You WIN when your tokens FALL.
[got it →]
```

### Result wording (R2)

| Outcome      | Headline                                                   |
| ------------ | ---------------------------------------------------------- |
| **Won**      | `+🪙 N earned. Now try a Bear contest — short the market.` |
| **No prize** | `Close one. Each contest builds your read. Try Bear Trap.` |

Обидва ведуть до того ж unlock. Empathy у формулюванні, не в money.

### XP thresholds R1-R3

`base_entry_xp = 10`, `placement_top50% = +5`.

| Lane            |   × | Avg XP/contest |
| --------------- | --: | -------------: |
| Practice (Free) | 0.5 |             ~7 |
| 🪙 1 paid       | 1.0 |            ~13 |

| Перехід | XP threshold | Реалістично         |
| ------- | -----------: | ------------------- |
| R1 → R2 |            7 | 1 Practice          |
| R2 → R3 |           30 | 1 Practice + 2 paid |
| R3 → R4 |           90 | ~5 paid (mix)       |

R1→R2 свідомо легкий. R3→R4 уже вимагає stamina.

### State recovery

Якщо юзер повертається через день і нема активного entry:

- `tutorial_done_at` set → не показуємо tutorial.
- 0 finalized contests → ще R1 lobby (one card).
- ≥ 1 finalized → R2 lobby (Quick highlighted).

Tобто **state-driven**, не лише time-driven.

---

## 9. Multi-entry — правила

- `entries (user_id, contest_id)` UNIQUE — інваріант (вже є).
- Жодних блоків «у вас активний контест».
- Header: `🎯 N live` → dropdown зі списком + sparkline P&L.
- Soft warning при ≥ 6 live: toast `🪙 N at risk across X contests`. Без cap.
- DM-bundling: коли ≥ 3 контестів фіналізуються одночасно — одне зведене DM «3 of 5 finished — view results».

---

## 10. Tradeoffs / open

| Точка ризику                    | Default                                        | Якщо ламається                     |
| ------------------------------- | ---------------------------------------------- | ---------------------------------- |
| 24h порожні (cap 100, real <30) | Cancel + refund                                | Cap = 50, прибрати 🪙 25 lane      |
| Marathon порожній (<250)        | Skip week, refund                              | Pin до v2.1                        |
| Bot-fill на 10m не встигає      | OK, lane короткий                              | Ratio 5:1                          |
| Юзер пропускає kickoff          | Push DM за 5 хв                                | Auto-watch reminder для favourites |
| Lobby 19 cards = довго          | Default tab "My + soon", повне за `Browse all` | Pre-collapse Watch/Locked зони     |

---

## 11. Schema delta (high-level)

`contests` table — нові колонки:

```
duration_lane    text  CHECK IN ('10m','30m','1h','24h','7d')   -- categorize
stake_tier       text  CHECK IN ('free','c1','c5','c25','c100','c500')
mode             text  CHECK IN ('bull','bear')                 -- explicit
matrix_cell_key  text  GENERATED (duration_lane || ':' || stake_tier || ':' || mode)
```

Уніqueness: `UNIQUE INDEX idx_one_active_per_cell ON contests(matrix_cell_key) WHERE status IN ('scheduled','active')`.

`xp_multiplier` (вже є) — заповнюється scheduler'ом за table в §7.

`min_rank` (вже є) — заповнюється за §2.

`pay_curve` (`pay_all` boolean уже є) — для Practice = true, інші = false.

Нічого не drop'аємо. Бекенд міняється тільки в **scheduler** і **lobby query**.

---

## Milestones

| M      | Scope                                                                                                                                          | Acceptance                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **M1** | Schema delta + matrix-aware scheduler. Replace ladder cron з matrix-cron, який підтримує invariant "1 live per cell". 5 lanes, всі 19 cells.   | DB має 19 unique cells live одночасно. Test: створити 19, видалити 1, побачити replacement. |
| **M2** | Lobby grid: 4 зони (My / Soon / Watch / Locked). Header summary. Sorting per zone.                                                             | Юзер R10 бачить корректну розкладку. Multi-entry дозволено.                                 |
| **M3** | Spectator mode: watch tab, top-10 leaderboard, "next slot" CTA + DM-нагадування.                                                               | Spectator не показує lineup до lock; полінг 15s; DM приходить за 5 хв до kickoff.           |
| **M4** | XP duration multiplier (per lane). Заповнення scheduler'ом.                                                                                    | Marathon entry дає 20 XP, Practice — 7. Sanity тест на формулу.                             |
| **M5** | Onboarding R1→R3 flow: action-gated unlocks (1 done → R2, 3 done → R3), simplified R1 lobby, risk-modal, bear explainer, R3-completion splash. | Новий юзер за 1 годину доходить до R3. State recovery після reload.                         |
| **M6** | Marathon: weekly Monday kickoff, mode-rotation, cancel-on-undersold logic, no-early-exit guard.                                                | Перший Marathon стартує наступного понеділка після ship.                                    |

Залежності: M1 блокує всіх інших. M2-M5 паралельні. M6 — після M2 (потрібен lobby slot для Marathon card).

---

## Out of scope (свідомо вибикнуті, не v2)

- Sector / theme contests (DeFi, Memes, L1) — додамо коли бачимо engagement gap.
- 12h, 4h, 3-day lanes — щільність вже достатня з 5 lanes.
- Volatility mode — separate game, не в контест-grid.
- Pause/resume entries (early exit refund) — anti-griff.
- Cross-contest leaderboard (season-wide) — окремий епік.
