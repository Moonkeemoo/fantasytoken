# Contest Token Rows Cleanup (TZ-004)

> Косметичний фікс token-row'ів через 3 стани контесту. Базується на TZ-001 + TZ-003 (equal split). Один PR, малий ризик.

---

## Загальна структура рядка (всі 3 стани)

```
[icon] SYM                                                  HERO
       <left subtitle>                                      <sub>
```

- Border-left **2px** (не 3px) у `--bull` (helping) / `--bear` (hurting). На neutral (zero/no-data) — без border'у.
- Right column hero — JBM 17px 500, color-coded.
- Left subtitle — 13px `--ink-soft`, JBM моно для чисел.
- `$0` PnL → показуємо `—` (em-dash, `--text-tertiary`).

---

## 1. Live screen — `LiveTeam.tsx`

**Layout (своя версія, не симетрична Complete):**

```
[icon] WBT                                                  −$2
       $57.62  −0.09%                                     −0.09%
```

| Поле                              | Source                                                                        | Format                                |
| --------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------- |
| Left subtitle: current price      | `token.price` (live, оновлюється з 30s polling)                               | `$57.62`                              |
| Left subtitle: change since entry | `(price - entryPrice) / entryPrice × 100`                                     | `−0.09%` (color-coded, sign included) |
| Right hero: $ PnL                 | `(price - entryPrice) × allocDollars / entryPrice`, mode-aware (bear inverts) | `−$2` (signed, color-coded)           |
| Right sub: score %                | `pnl / tier × 100` (mode-aware)                                               | `−0.09%` (color-coded)                |

**Drop:**

- ❌ Allocation `20%` біля sym (uniform під equal-split, redundant)
- ❌ Allocation `20%` справа під PnL (дубль)
- ❌ `vs entry` label (implicit — нема іншого baseline)
- ❌ `↓` / `↑` arrow (sign на % вже є)

**Sort:** rows by `$ PnL` desc (winner up top, losers вниз).

**Bull/Bear pill regression** — у `LiveHero.tsx` чи `TopHeader.tsx` десь повернувся `BULL` pill. Видалити: mode зашитий у назву контесту (`Memecoin Madness · Bull`), окремий pill не потрібен.

**fmtPct rounding bug** — у `packages/shared/src/format.ts` функція що показує `-0.00%` для `-0.16`. Замінити на mode що показує мін 2 значущі знаки після нуля: `-0.16%` правильно. Перевірити `fmtPct(-0.0016)` = `'-0.16%'`, не `'-0.00%'`.

---

## 2. Locked screen — `LockedScreen.tsx` (або де рендериться lineup row)

**Layout:**

```
[icon] ZEC                                                $42.18
       $2,000 · 20%
```

**Зміни:**

- ❌ **Видалити progress bar** (uniform = useless)
- ✅ **Додати entry price справа** як hero (`token.price` поточна, оновлюється до kickoff)
- ✅ Section subheader: `YOUR TEAM` ↔ `prices lock at kickoff` (`--text-tertiary`, 11px uppercase)
- ✅ Після kickoff (`status === 'live'`) subheader → `locked at HH:MM:SS UTC` зі snapshot timestamp

**Залишити:** `$2,000 · 20%` як left subtitle. Allocation у %% — це OK тут, бо це момент підтвердження.

---

## 3. Complete screen — results/contest-final view

**Layout (entry → final price journey):**

```
[icon] SOL                                                  +$46
       $145.20 → $148.50                                  +2.27%
```

| Поле                      | Source                    | Format              |
| ------------------------- | ------------------------- | ------------------- |
| Left subtitle: journey    | `entryPrice → finalPrice` | `$145.20 → $148.50` |
| Right hero: $ PnL final   | frozen                    | `+$46`              |
| Right sub: token % change | frozen                    | `+2.27%`            |

**Зміни:**

- 🐛 **BUG FIX:** іконка біля PnL — поточно `🪙` (Coins glyph), має бути `$`. Ці валюти не можна змішувати: PnL це fantasy dollars, а Coins це real soft-currency для entries.
- ❌ Allocation `20%` біля sym (дубль)
- ❌ `token` suffix після % (`-0.1% token` → `-0.1%`)
- ✅ Left subtitle тепер показує price journey замість `$2,000 · 20%`. Allocation summary йде в section subheader: `YOUR LINEUP · FINAL · $10,000 committed`

**Sort:** by `$ PnL` desc (winner first, story works better).

---

## 4. Files to touch

| File                                                     | Change                                                                              |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- | --- | ------------------------------- |
| `apps/web/src/features/live/LiveTeam.tsx`                | Row layout (drop alloc, drop arrow, drop vs-entry label, sort by PnL)               |
| `apps/web/src/features/live/LiveHero.tsx` (or TopHeader) | Видалити Bull/Bear pill (regression)                                                |
| `apps/web/src/features/lobby/LockedScreen.tsx`           | Replace progress bar with entry price; section subheader logic                      |
| `apps/web/src/features/results/...` (find existing)      | Same row layout as Live but with `entry → final` journey + bug fix coin→dollar icon |
| `packages/shared/src/format.ts`                          | Fix `fmtPct` rounding для                                                           | x   | < 0.005 (показувати 2 sig figs) |

---

## 5. Acceptance

**Live:**

- [ ] Per-row: icon + sym | (price + change-since-entry) | $ PnL hero + score %
- [ ] Жодних `20%` allocation labels
- [ ] Жодних `vs entry` / `↓` / `↑` text
- [ ] Border-left 2px (not 3px), no border on neutral rows
- [ ] Rows sorted by $ PnL desc
- [ ] No Bull/Bear pill in header
- [ ] `fmtPct(-0.0016)` returns `'-0.16%'`

**Locked:**

- [ ] Progress bar removed
- [ ] Entry price visible right side, JBM 17px
- [ ] Section subheader `prices lock at kickoff` / `locked at <ts>`

**Complete:**

- [ ] Coin glyph next to PnL replaced with `$`
- [ ] Left subtitle shows `entry → final`
- [ ] Allocation totals only in section subheader, not per row
- [ ] No `token` suffix on %
- [ ] Rows sorted by $ PnL desc

**Cross-cutting:**

- [ ] `pnpm typecheck && pnpm lint && pnpm test` зелені
- [ ] Симетрія Live↔Complete: однакова структура (icon + sym + left subtitle | $ PnL + %), але Live = `current + delta`, Complete = `journey`. Це навмисне.

---

## 6. Не робимо (deferred)

- Memecoin price truncation / subscript notation для дуже малих цін типу `$0.0000060` — punt for now. Якщо в проді layout ламається — зробимо окремим фіксом.
- Animation transitions при зміні значень — не потрібно.
- Sparkline у row'ах — V2.

---

**TZ-004 · v1 · 30 квіт 2026**
**Базується на:** TZ-001, TZ-003 (equal split). Не зачіпає TZ-002.
