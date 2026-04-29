# Referral System — Design Spec

> Multi-tier viral mechanic. Запросив новачка → ти його L1 referrer. Він запросив когось → той L2 для тебе. Ти заробляєш % від prizes своїх рефералів. Замикає viral acquisition + retention loop. Окремо від `friendships` (social tie).
>
> **Status:** 🟢 design locked, 🔴 implementation not started
> **Last update:** 2026-04-29
> **Visual references:**
>
> - [docs/mockups/referral-system.html](mockups/referral-system.html) — UI mockups для 5 surfaces (Profile, Lobby teaser, Bot DM, Result toast, Welcome screen) + architecture/economy
> - [docs/mockups/referral-economics.html](mockups/referral-economics.html) — interactive simulator з business model: acquisition, welcome economy, engagement, contest mix, per-currency rates, 12-month projection, monthly P&L, soft USD inflation tracker
>
> **Cross-refs:** [INVARIANTS.md](INVARIANTS.md), [PRODUCT_SPEC.md](PRODUCT_SPEC.md), [MVP.md](MVP.md), [RANK_SYSTEM.md](RANK_SYSTEM.md)

---

## TL;DR

- **2 tiers (L1 + L2 only).** Walk up max 2 hops від призера. L3+ не tracked.
- **Per-currency rates:** USD soft 5%/1%, Stars 3%/0.5%, **TON 2.5%/0.5%** від prize.
- **House-funded з rake.** Друг отримує повний приз. Ти отримуєш cut з house pocket.
- **Mutual welcome bonus** (тільки soft USD): $25 referee + $25 recruiter, unlock після першої гри referee.
- **Welcome bonus expires через 7 днів** якщо не використаний — anti-inflation для soft USD.
- **Bots тільки у soft USD** контестах. TON/Stars — only real users.
- **Attribution refined:**
  - Новий юзер (created_at < 60s, 0 finalized entries) → **Referral + Friend**
  - Існуючий юзер → **Friend only** (anti-abuse: friends не можуть "крутити" один одного)
- **Referrals ≠ Friendships** — окремі сутності. Asymmetric attribution vs symmetric social tie.

---

## 1. Attribution rules

### 1.1 Two outcomes from invite link

При відкритті app з `start_param=ref_<inviter_tg_id>`:

| Стан юзера                                    | Створюється                                                |
| --------------------------------------------- | ---------------------------------------------------------- |
| **Новий** (вперше в app, 0 finalized entries) | `users.referrer_user_id` ← inviter + `friendships` row     |
| **Існуючий** (вже грав ≥1 контест)            | `friendships` row only (referrer_user_id залишається NULL) |

### 1.2 Detection rule (backend)

`referrer_user_id` set'иться тільки якщо:

```ts
users.created_at > (now - 60s)  // первинний auth
AND
0 finalized entries у user'а
```

60-секундне вікно — це attribution window для першого open. Поза ним → friend only.

### 1.3 Why this matters

Запобігає abuse: 2 існуючі друзі обмінюються лінками і починають "крутити" один одного для commission. У новому attribution — реферальний зв'язок неможливо ретроактивно встановити.

### 1.4 Self-referral

Заблоковано на backend: `if inviter_user_id === user.id → no-op`.

### 1.5 Referrals vs Friendships

| Концепт     | Referrals (new)                      | Friendships (existing)               |
| ----------- | ------------------------------------ | ------------------------------------ |
| Структура   | Asymmetric ("я тебе привів")         | Symmetric ("ми друзі")               |
| Storage     | `users.referrer_user_id` FK nullable | `friendships` table (unordered pair) |
| Кількість   | One per user (immutable після set)   | Many per user                        |
| Mutability  | Set один раз, never change           | Created на запит, never deleted      |
| Purpose     | Attribution + commission economics   | Social — friends leaderboard         |
| Створюється | First auth з ref + 0 entries         | First auth з ref + manual add (V2)   |

---

## 2. Multi-tier architecture

### 2.1 Tier depth

**L1 + L2 only.** `MAX_REFERRAL_DEPTH = 2` (constant у shared/).

Walk up referrer chain від призера: L1 = direct inviter, L2 = inviter's inviter. Stop at depth 2.

**Чому не глибше:** регуляторна відсутність "pyramid scheme" feel + sustainable economics. L3+ дав би ≤0.5% additional viral leverage at significant compliance risk.

### 2.2 Commission rates per currency

| Currency | L1 (% of prize) | L2 (% of prize) | Why                                              |
| -------- | --------------- | --------------- | ------------------------------------------------ |
| USD soft | **5%**          | **1%**          | Виральність > маржа. Printed money — affordable. |
| Stars    | **3%**          | **0.5%**        | Real money, sustainable margin                   |
| TON      | **2.5%**        | **0.5%**        | Crypto, тонкий margin потрібен safety buffer     |

Math invariant: total commissions across всіх winners = `(L1 × pen + L2 × pen) × pool`, незалежно від prize curve.

### 2.3 Source of commission

**House-funded з rake.** Friend отримує **повний приз**. Ти отримуєш cut з house's rake pocket.

Розрахунок per-contest sustainability (TON, 20 players × 2 TON, rake 15%, peak penetration):

```
Pool = 36 TON (20 × 2 × 0.85, no bots)
Rake = 6 TON
L1 commissions = 5% × 100% × 36 = 1.80 TON  (with default 5% — стресс-тест)
                 2.5% × 100% × 36 = 0.90 TON (з TON-recommended 2.5%)
L2 commissions = 1% × 70% × 36 = 0.252 TON
                 0.5% × 70% × 36 = 0.126 TON
Total commissions @ 2.5%/0.5% = 1.026 TON
Net house = 6 - 1.026 = 4.974 TON  (12.4% margin vs cash IN)
```

При recommended ставках — 12-13% margin per contest, sustainable.

### 2.4 Why % of prize (not % of entry / rake)

Розглянуті 3 моделі (див. economics simulator):

| Model            | Pros                                        | Cons                               |
| ---------------- | ------------------------------------------- | ---------------------------------- |
| **% of prize** ✓ | Strong emotion ("друг виграв $100 → ти $5") | Variance, залежить від win частоти |
| % of entry fee   | Predictable, легше моделювати               | Слабша emotion ("$0.04 за entry")  |
| % of rake        | Math-guaranteed sustainability              | Дуже дрібні числа, поганий UX      |

**Обираємо % of prize** — найсильніший viral driver через emotional cause-effect. Sustainability забезпечується per-currency calibration ставок.

### 2.5 Steady-state penetration assumption

Для economic forecasting:

- **L1 penetration** = 100% (за 6+ місяців майже всі юзери прийдуть через рефералів)
- **L2 penetration** = 70% (subset L1 — інвітер також мав інвітера)

Initially (перші 1-2 місяці) — penetration майже 0% (немає chain'ів).

---

## 3. Welcome economy

### 3.1 Three bonuses (soft USD only)

| Подія                                   | Хто отримує    | Сума     | Currency |
| --------------------------------------- | -------------- | -------- | -------- |
| First `/me` upsert                      | Будь-який юзер | **$25**  | USD soft |
| Joined via ref-link, played 1st contest | Новий юзер     | **+$25** | USD soft |
| Твій реферал зіграв перший контест      | Recruiter      | **+$25** | USD soft |

Total для new ref pair: $25 + $25 + $25 = **$75 minted у soft USD**.

### 3.2 Important: НІКОЛИ не у real currency

**TON / Stars welcome bonuses = $0.** Усі promos у soft USD virtual. Юзер може використати у free / низькостейкових контестах. Не cashable у real currency.

Це critical для:

- Real money sustainability (per-contest ROI не страждає)
- Anti-fraud (не платимо real money за account-creation)
- Compliance (soft USD = entertainment credit, не fiat-like обіцянка)

### 3.3 Anti-fraud

#### 3.3.1 Required completion

Bonuses unlock тільки після того як referee зіграв `≥1 finalized contest`. Просто запросити account який нічого не робить = $0.

Можливе посилення: вимагати ≥3-5 contests (адаптується через config).

#### 3.3.2 Welcome expiry

Welcome bonus **expires через 7 днів** якщо не використаний (не зіграв жодного контесту).

**Чому критично:** без expiry, кожен новий юзер = +$25 mint у circulating supply навіть якщо ніколи не повертається. Через рік накопичення вб'є економіку.

Implementation: track `welcome_credited_at`, daily cron перевіряє і списує неактивні welcome bonuses через CurrencyService.transact() з типом `WELCOME_EXPIRED`.

#### 3.3.3 Same-IP detection

Soft heuristic: якщо N+ accounts з однієї IP за 24h → flag for manual review. Не автоматичний block, бо легко обійти і створює false positives для families/networks.

### 3.4 System-level inflation control

Soft USD має drain'итись більше ніж mint'итись на cumulative basis. Tracking via `xp_events`-like audit:

```
mint = welcome + referee + recruiter
drain = rake_collected - referral_commissions_paid (з soft USD контестів)
circulating = cumulative_mint - cumulative_drain
```

**Якщо `circulating` росте лінійно** → треба:

- Знизити welcome bonus
- Підвищити rake на soft USD контестах
- Скоротити expiry window
- Збільшити required contests для unlock

Daily cron публікує `circulating_supply` метрику в admin dashboard.

---

## 4. Bots policy

### 4.1 Per-currency rules

| Currency | Bots allowed? | Why                                          |
| -------- | ------------- | -------------------------------------------- |
| USD soft | ✅ Yes        | Printed money — bot subsidies безкоштовні    |
| Stars    | ❌ No         | Real money — house fundит entries, real loss |
| TON      | ❌ No         | Real money — house fundит entries, real loss |

### 4.2 Чому bots коштують real money

За формулою: `pool = (real + bots) × entry × (1 - rake)`. Pool повністю розподіляється real winners. Тобто bot entries — це house cash що йде у real users prizes.

Приклад: 5 real + 15 bots × 2 TON, rake 10%:

```
Pool = 20 × 2 × 0.9 = 36 TON
Real cash IN = 10 TON
Bot subsidy = 30 TON (house pays)
Pool to real winners = 36 TON
House net = 10 + 0.1×40 (rake) - 30 = -16 TON loss per contest
```

### 4.3 Cold start стратегія для real money

Якщо TON контест не наповнюється — варіанти:

1. **Reduce max_capacity** — 20-player контест → 10-player
2. **Guaranteed pool seed** — house платить fixed amount (наприклад 5 TON guaranteed) як CAC investment, обмежений budget
3. **Wait for organic fill** — scheduled контести з пізнішим start_time

**НЕ використовувати bots у real-money контестах** — це гарантована втрата.

---

## 5. Per-currency rate matrix (canonical)

Frozen defaults для production:

| Setting             | USD soft | Stars     | TON     |
| ------------------- | -------- | --------- | ------- |
| Entry fee (typical) | $1-10    | 100 stars | 1-5 TON |
| Rake %              | 10%      | 12%       | 15%     |
| L1 commission       | 5%       | 3%        | 2.5%    |
| L2 commission       | 1%       | 0.5%      | 0.5%    |
| Welcome bonus       | $25      | -         | -       |
| Referee bonus       | $25      | -         | -       |
| Recruiter bonus     | $25      | -         | -       |
| Bots allowed?       | Yes      | No        | No      |
| Min real users      | 1        | 3         | 3       |
| Premium tier rake   | -        | 15%       | 18-20%  |

Premium tiers (Whale Vault, Legend League, Mythic Cup) можуть використовувати вищий rake — юзери на цьому level acceptable з вищим house edge.

---

## 6. UI Surfaces

Visual mockups: див. [docs/mockups/referral-system.html](mockups/referral-system.html) tab "UI surfaces".

### 6.1 Profile — Referrals section

**Місце:** новий блок у Profile screen. Розташовується після Stats grid.

**Візуал (paper aesthetic, бачи mockup):**

- Headline cifri: `12 invited · $487 earned`
- Earnings breakdown box (`bg-code-bg`): `L1: $398 (5% × 8 active)` + `L2: $89 (1% × 4 active)`
- Tree visualization: 2 рядки (L1, L2) з mini-аватарами + active count
- Top earners list (3-5 friends з найбільшим contribution)
- 3 CTA: primary `📨 Invite friends · earn 5% from wins`, secondary `Copy link`, secondary `Show QR`

**Data source:** `GET /me/referrals`, `GET /me/referrals/tree`

**Behaviors:**

- Tap на friend avatar → drill-in (V2)
- Tap на "Invite friends" → opens TG share sheet з referral link
- Pull to refresh

### 6.2 Lobby — Invite teaser banner

**Місце:** новий компонент у `apps/web/src/features/lobby/`. Render після `<Header />`, перед `<Tabs />`.

**Coniditional:** показується **тільки якщо у юзера 0 active referrals**.

**Візуал:** жовтий paper note (bg-note), як rank teaser banner.

**Headline:** `Invite 1 friend → +$50 and 5% from their wins forever`. Слово "forever" — критичний emotional anchor.

**Sub:** `When they join via your link and play 1 contest, you both get +$50.`

**CTA:** `📨 Send invite link` (primary).

**Зникає:** коли юзер інвайтить свого першого друга і той зіграв.

**Data source:** `GET /me/referrals` (check `l1ActiveCount > 0`).

### 6.3 Bot DM on friend's win

**Це найсильніший viral retention loop trigger.**

**Trigger:** після `contests.finalize`, для кожного entry з prize > 0, walk up referrer chain і send DM кожному referrer'у через grammY.

**Format:**

```
🎉 Andriy just won $87 in Bear Trap
L1 commission: 5% of his prize
+$4.35 to your balance

[Open app] [Invite more]
```

**Frequency cap:** **1 message per recipient per hour**. Якщо за hour приходить N wins — group в 1 message ("3 friends won, +$X total").

**Implementation:** окремий queue (Postgres or in-memory) з debounce.

### 6.4 In-app toast on friend's win

**Місце:** будь-де в app коли юзер активний.

**Trigger:** real-time push через WebSocket (V2) або polling кожні 30s (V1 fallback).

**Візуал:** slide-down (500ms) з top, чорний bg + accent-red border:

```
💸 +$4.35 from Andriy's win
   L1 commission · 5% of $87 prize           ›
```

Click → opens `/me` з focus на referrals section.

**Не auto-dismiss** — це гроші, юзер сам закриває.

### 6.5 Welcome screen for referee

**Місце:** перший екран нового юзера ЯКИЙ ПРИЙШОВ ЗА REF-ЛІНКОМ. Replaces existing tutorial flow для цих users.

**Візуал:**

- 👋 emoji
- "Welcome, Bohdan!" (з name з TG)
- "**Andriy** invited you to Fantasy Token League." — соц. proof critical
- Bonus card (yellow note bg):
  - Welcome bonus: $100
  - Referral bonus (after 1st game): +$50
  - **Total ready to play: $150**
- CTA: `Find a contest →` веде у Lobby

**Data source:** check `users.referrer_user_id` + `users.created_at` recency.

### 6.6 Visual continuity

**Referral teaser у Lobby + Referrals section у Profile** мають бути візуально connected. Той самий accent color, той самий "earn 5%" headline. Юзер натискає у Lobby → бачить розширену версію у Profile.

---

## 7. DB Schema

Migration `0006_referrals.sql`:

```sql
-- 1. Asymmetric referrer attribution (immutable після set)
ALTER TABLE users ADD COLUMN referrer_user_id uuid REFERENCES users(id);
CREATE INDEX users_referrer_idx ON users(referrer_user_id) WHERE referrer_user_id IS NOT NULL;

-- 2. Audit log of all commission payouts (immutable, like xp_events / transactions)
CREATE TABLE referral_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES users(id),  -- хто отримав commission
  source_user_id uuid NOT NULL REFERENCES users(id),     -- хто виграв контест
  source_contest_id uuid NOT NULL REFERENCES contests(id),
  source_entry_id uuid NOT NULL REFERENCES entries(id),
  level smallint NOT NULL CHECK (level IN (1, 2)),
  commission_pct_bps int NOT NULL,        -- 500 = 5%, 100 = 1%
  source_prize_cents bigint NOT NULL,     -- friend's gross prize
  payout_cents bigint NOT NULL,           -- what we paid out
  currency_code varchar(16) NOT NULL,     -- 'USD' | 'STARS' | 'TON'
  transaction_id uuid REFERENCES transactions(id),  -- link to currency tx (INV-9)
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rp_recipient_idx ON referral_payouts(recipient_user_id, created_at DESC);
CREATE INDEX rp_source_entry_idx ON referral_payouts(source_entry_id);

-- 3. Welcome bonus tracking (для expiry)
ALTER TABLE users ADD COLUMN welcome_credited_at timestamptz;
ALTER TABLE users ADD COLUMN welcome_expired_at timestamptz;

-- 4. Referral signup bonus tracking
CREATE TABLE referral_signup_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),  -- хто отримує
  source_user_id uuid REFERENCES users(id),    -- referee (для recruiter bonus); NULL для referee bonus
  bonus_type varchar(16) NOT NULL,             -- 'REFEREE' | 'RECRUITER'
  amount_cents bigint NOT NULL,
  currency_code varchar(16) NOT NULL DEFAULT 'USD',
  unlocked_at timestamptz,                     -- NULL якщо ще не unlocked
  triggered_by_entry_id uuid REFERENCES entries(id),  -- entry яка unlock'ала
  transaction_id uuid REFERENCES transactions(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX rsb_unique_idx ON referral_signup_bonuses(user_id, bonus_type, source_user_id);
```

Drizzle schema файли:

- `apps/api/src/db/schema/users.ts` — додати `referrer_user_id`, `welcome_credited_at`, `welcome_expired_at`
- `apps/api/src/db/schema/referral_payouts.ts` — новий
- `apps/api/src/db/schema/referral_signup_bonuses.ts` — новий
- `apps/api/src/db/schema/index.ts` — re-export нового

---

## 8. Pure functions у `packages/shared/src/referrals/`

### 8.1 `referral-rates.ts`

```ts
export const MAX_REFERRAL_DEPTH = 2;

// Per-currency commission rates (basis points)
export const REFERRAL_RATES = {
  USD: { l1Bps: 500, l2Bps: 100 }, // 5%, 1%
  STARS: { l1Bps: 300, l2Bps: 50 }, // 3%, 0.5%
  TON: { l1Bps: 250, l2Bps: 50 }, // 2.5%, 0.5%
} as const;

export function getReferralRates(currency: 'USD' | 'STARS' | 'TON') {
  return REFERRAL_RATES[currency];
}
```

### 8.2 `welcome-bonuses.ts`

```ts
// All bonuses у soft USD only (cents)
export const WELCOME_BONUS_CENTS = 2500; // $25
export const REFEREE_SIGNUP_BONUS_CENTS = 2500; // $25 to new user (after 1st game)
export const RECRUITER_SIGNUP_BONUS_CENTS = 2500; // $25 to inviter (after referee's 1st game)

export const WELCOME_EXPIRY_DAYS = 7;
export const REQUIRED_CONTESTS_FOR_BONUS = 1; // anti-fraud, can be tightened
```

### 8.3 `commission-calc.ts`

```ts
export interface PrizePayoutContext {
  prizecents: bigint;
  currency: 'USD' | 'STARS' | 'TON';
}

export interface CommissionCalc {
  level: 1 | 2;
  pctBps: number;
  payoutCents: bigint;
}

/** Pure: compute commission amount for a single level. */
export function computeCommission(ctx: PrizePayoutContext, level: 1 | 2): CommissionCalc {
  const rates = getReferralRates(ctx.currency);
  const pctBps = level === 1 ? rates.l1Bps : rates.l2Bps;
  const payoutCents = (ctx.prizecents * BigInt(pctBps)) / 10000n;
  return { level, pctBps, payoutCents };
}
```

### 8.4 Test plan

`packages/shared/src/referrals/commission-calc.test.ts`:

- L1 5% USD: 100 cents prize → 5 cents
- L1 2.5% TON: 200 TON-units (cents) → 5 TON-units
- L2 1% USD: 100 cents → 1 cent
- L2 0.5% TON: 200 TON-units → 1 TON-unit
- Edge: 0 prize → 0 commission
- Edge: bigint overflow safety (use BigInt throughout)

---

## 9. Backend wiring

### 9.1 Hook into `users.upsertOnAuth`

`apps/api/src/modules/users/users.service.ts` — extend existing upsert.

```ts
async upsertOnAuth(args, opts?: { inviterTelegramId?: number }) {
  const isNew = /* existing check */;
  const userId = await this.repo.upsert(args);

  if (isNew) {
    // Welcome bonus through CurrencyService (INV-9)
    await this.currency.transact({
      userId, currency: 'USD', deltaCents: WELCOME_BONUS_CENTS,
      type: 'WELCOME_BONUS',
    });
    await this.repo.markWelcomeCredited(userId);
  }

  // Attribution: only if NEW user via ref + 60s window + 0 finalized entries
  if (isNew && opts?.inviterTelegramId) {
    const inviterUserId = await this.repo.findUserIdByTelegramId(opts.inviterTelegramId);
    if (inviterUserId && inviterUserId !== userId) {
      // Set referrer (immutable per INV-13)
      await this.db.update(users)
        .set({ referrerUserId: inviterUserId })
        .where(and(eq(users.id, userId), isNull(users.referrerUserId)));

      // Create symmetric friendship in same transaction
      await this.friends.addByInviter({ userId, inviterUserId });

      // Pre-create signup bonus rows (unlocked: null)
      await this.referrals.preCreateSignupBonuses({ userId, inviterUserId });
    }
  }
}
```

### 9.2 Hook into `entries.submitEntry`

`apps/api/src/modules/entries/entries.service.ts`:

```ts
async submitEntry(args) {
  // ... existing entry validation + insert ...

  // Check if this is user's 1st-Nth contest entry (for bonus unlock)
  const finalizedCount = await this.repo.countFinalizedForUser(args.userId);
  if (finalizedCount + 1 >= REQUIRED_CONTESTS_FOR_BONUS) {
    await this.referrals.maybeUnlockSignupBonuses(args.userId, entryId);
    // Internal: credits $25 to user + $25 to referrer if exists
    // Both via CurrencyService.transact() with type 'REFERRAL_SIGNUP_BONUS'
  }
}
```

### 9.3 Hook into `contests.finalize`

`apps/api/src/modules/contests/contests.finalize.ts`:

```ts
async finalize(contestId) {
  // ... existing prize distribution ...
  for (const entry of realEntries.filter(e => e.prizeCents > 0n)) {
    await this.referrals.payCommissions({
      sourceEntryId: entry.id,
      sourceUserId: entry.userId,
      sourceContestId: contestId,
      sourcePrizeCents: entry.prizeCents,
      currency: contest.currency, // 'USD' | 'STARS' | 'TON'
    });
  }
}

// referrals.service.ts
async payCommissions(args) {
  const chain = await this.repo.getReferralChain(args.sourceUserId, MAX_REFERRAL_DEPTH);
  // chain = [{ userId: l1Inviter }, { userId: l2Inviter }] (length 0..2)

  for (const [idx, link] of chain.entries()) {
    const level = (idx + 1) as 1 | 2;
    const calc = computeCommission(
      { prizecents: args.sourcePrizeCents, currency: args.currency },
      level,
    );
    if (calc.payoutCents <= 0n) continue;

    await this.db.transaction(async (tx) => {
      // 1. Currency credit through INV-9 atomic op
      const txn = await this.currency.transactInTx(tx, {
        userId: link.userId,
        currencyCode: args.currency,
        deltaCents: calc.payoutCents,
        type: 'REFERRAL_COMMISSION',
        refType: 'entry',
        refId: args.sourceEntryId,
      });
      // 2. Audit log (immutable per INV-14)
      await tx.insert(referralPayouts).values({
        recipientUserId: link.userId,
        sourceUserId: args.sourceUserId,
        sourceContestId: args.sourceContestId,
        sourceEntryId: args.sourceEntryId,
        level,
        commissionPctBps: calc.pctBps,
        sourcePrizeCents: args.sourcePrizeCents,
        payoutCents: calc.payoutCents,
        currencyCode: args.currency,
        transactionId: txn.id,
      });
      // 3. Enqueue bot DM (decoupled — failure тут не повинен блокувати payout)
      await this.botQueue.enqueue('referral_commission', {
        recipientUserId: link.userId,
        sourceUserId: args.sourceUserId,
        sourcePrizeCents: args.sourcePrizeCents,
        payoutCents: calc.payoutCents,
        level,
      });
    });
  }
}
```

**INV-7 logging:** wrap у `try/catch` з `logger.error`. Failure ref payout не повинен блокувати prize distribution — обидва у різних outer transactions.

### 9.4 Welcome bonus expiry cron

`apps/api/src/server.ts` — додати:

```ts
const stopWelcomeExpiry = scheduleEvery({
  intervalMs: 24 * HOUR,
  fn: async () => {
    await users.expireUnusedWelcome();
  },
});

// users.service.ts
async expireUnusedWelcome() {
  const cutoff = new Date(Date.now() - WELCOME_EXPIRY_DAYS * 24 * 3600 * 1000);
  const candidates = await this.repo.findUsersWithUnusedWelcome(cutoff);
  for (const user of candidates) {
    await this.currency.transact({
      userId: user.id,
      currency: 'USD',
      deltaCents: -WELCOME_BONUS_CENTS,  // debit
      type: 'WELCOME_EXPIRED',
    });
    await this.repo.markWelcomeExpired(user.id);
  }
}
```

---

## 10. New API endpoints

### 10.1 `GET /me/referrals`

```ts
// response
{
  l1Count: number,             // total referees
  l2Count: number,             // total L2 (friends-of-friends)
  l1ActiveCount: number,       // played ≥1 contest
  l2ActiveCount: number,
  totalEarnedCents: number,    // all-time
  l1EarnedCents: number,
  l2EarnedCents: number,
  byCurrency: {
    USD: { l1Cents, l2Cents },
    STARS: { l1Cents, l2Cents },
    TON: { l1Cents, l2Cents },
  },
}
```

### 10.2 `GET /me/referrals/tree`

```ts
// response
{
  l1: [{
    userId,
    firstName,
    photoUrl,
    joinedAt,        // ISO
    hasPlayed,       // boolean
    contestsPlayed,
    totalContributedCents,  // sum across currencies (USD-equiv)
  }],
  l2: [{
    userId,
    firstName,
    photoUrl,
    joinedAt,
    hasPlayed,
    contestsPlayed,
    totalContributedCents,
    viaUserId,       // who's the L1 (їх direct inviter)
  }],
}
```

### 10.3 `GET /me/referrals/payouts?limit=20`

Recent commission payouts (для V2 history screen).

### 10.4 `GET /me/referral-link`

```ts
// response
{
  url: "https://t.me/yourbot/app?startapp=ref_12345",
  deepLink: "tg://resolve?domain=yourbot&startapp=ref_12345",
  qrCodeData: "data:image/png;base64,...",  // V2
}
```

### 10.5 `GET /me/welcome-status`

```ts
// response
{
  welcomeBonusCents: number,           // amount credited
  welcomeCreditedAt: string,           // ISO
  welcomeExpiresAt: string | null,     // ISO, null якщо expired
  welcomeUsed: boolean,                // true якщо юзер вже зіграв ≥1
  daysUntilExpiry: number | null,
}
```

---

## 11. Bot DM integration

### 11.1 grammY notification format

```ts
// apps/api/src/modules/bot/notifications.ts
async function notifyReferralCommission(args: {
  recipientTelegramId: number;
  sourceFirstName: string;
  sourcePrizeCents: bigint;
  sourceCurrency: 'USD' | 'STARS' | 'TON';
  payoutCents: bigint;
  level: 1 | 2;
}) {
  const sourceFmt = formatCurrency(args.sourcePrizeCents, args.sourceCurrency);
  const payoutFmt = formatCurrency(args.payoutCents, args.sourceCurrency);

  await bot.api.sendMessage(
    args.recipientTelegramId,
    `🎉 *${args.sourceFirstName}* just won ${sourceFmt}\n` +
      `L${args.level} commission: ${args.level === 1 ? '5%' : '1%'} of prize\n` +
      `*+${payoutFmt}* to your balance`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Open app', web_app: { url: APP_URL } }],
          [{ text: 'Invite more', callback_data: 'invite' }],
        ],
      },
    },
  );
}
```

### 11.2 Frequency cap (per-recipient debounce)

**Rule:** не більше 1 DM per recipient per hour. Якщо 5 commissions за hour — group в один message.

Implementation:

- Queue table: `bot_dm_queue (recipient_user_id, payload jsonb, scheduled_at)`
- Cron every 1 min:
  1. Знаходить рядки де `scheduled_at <= now()`
  2. Для кожного recipient: aggregate всі pending payloads, send 1 message
  3. Update `last_dm_sent_at` per user
- На enqueue: `scheduled_at = max(now() + 1 min, last_dm_sent + 1 hour)`

Aggregation message: `"3 friends won contests · +$X total to your balance"` з link на app.

---

## 12. Proposed нові INVARIANTS

Додати у [INVARIANTS.md](INVARIANTS.md):

**INV-13** — `users.referrer_user_id` immutable після першого set. SQL guard: `UPDATE users SET referrer_user_id = X WHERE id = Y AND referrer_user_id IS NULL`. Backend service must use `SELECT ... FOR UPDATE` коли set'ить. Consequence: юзер може "переписати" свого реферера після того як набрав activity, ламаючи economics та fraud detection.

**INV-14** — `referral_payouts` immutable. Once written, no UPDATE. Pattern as INV-9 (transactions). Adjustments via REVERSAL row, не editing existing. Consequence: drift від audit log → disputed payouts, неможливо відтворити state.

**INV-15** — Referral chain walk capped at `MAX_REFERRAL_DEPTH = 2`. Hard-coded constant у `packages/shared/`. Збільшення вимагає окремого ADR (compliance impact). Consequence: pyramid scheme effect, unsustainable economics, regulatory risk.

---

## 13. Implementation order — ~5-7 днів

1. **Day 1.** Migration `0006_referrals.sql`. Drizzle schema files. Constants у `packages/shared/`. Pure functions з tests (`commission-calc.test.ts`).
2. **Day 2.** `users.upsertOnAuth` extension — set `referrer_user_id` з 60s window check. `referrals.service.payCommissions()` + repo `getReferralChain()` walking. Tests з edge cases (no referrer, single hop, two hops, self-referral).
3. **Day 3.** Wire `payCommissions` into `contests.finalize`. Backfill check (existing finalized contests з referrer chains — should not retroactively pay). Signup bonus unlock у `entries.submitEntry`. Welcome expiry cron.
4. **Day 4.** API endpoints (`/me/referrals`, `/tree`, `/referral-link`, `/welcome-status`). Update existing `/friends/referral` для consistency.
5. **Day 5.** Frontend: Profile referrals section з tree + earnings + 3 CTA. Lobby invite teaser banner (conditional).
6. **Day 6.** Frontend: Welcome screen для нових referees. In-app toast on friend's win.
7. **Day 7.** Bot DM integration з grammY + frequency cap queue. Можна defer — Day 5-6 ship'аються standalone.

---

## 14. Open questions / decisions deferred

| Topic                              | Default for V1                      | Trigger to revisit                               |
| ---------------------------------- | ----------------------------------- | ------------------------------------------------ |
| L3+ commission                     | Not implemented (cap at L2)         | If competitor виграє share через aggressive MLM  |
| Per-currency rate adjustment       | Hardcoded у constants               | When дані дадуть signal на calibration           |
| Welcome bonus amount               | $25 (cut з $100)                    | Якщо retention впаде → bump back to $50          |
| Welcome expiry days                | 7 days                              | Якщо complain rate про "lost bonuses" > 5%       |
| Required contests для signup bonus | 1 contest                           | Якщо viral fraud detected → bump to 5            |
| QR код в "Show QR" CTA             | Stub (показуємо message-link)       | Коли real-world sharing useful                   |
| Referral leaderboard               | V2                                  | Коли аналітика покаже потребу для top recruiters |
| Custom share-card з referrer info  | V2 (existing share-card працює без) | Коли organic referrals будуть meaningful funnel  |
| Per-friend detailed history        | V2 (drill-down screen)              | Коли users просять "де moja конкретна сума?"     |
| Real-time toast (vs polling)       | V1 = 30s polling, V2 = WebSocket    | Коли scale > 1000 concurrent active              |

---

## 15. Cross-references

### Visual mockups

- **UI surfaces:** [docs/mockups/referral-system.html](mockups/referral-system.html) — 5 paper-aesthetic mockups (Profile section, Lobby teaser, Bot DM, Result toast, Welcome screen) + architecture diagrams + economy tables
- **Interactive economics:** [docs/mockups/referral-economics.html](mockups/referral-economics.html) — full business model simulator (acquisition, welcome economy, engagement, contest mix, per-currency rates, 12-month projection, monthly P&L, soft USD inflation tracker, per-contest deep-dive)

### Related design docs

- [docs/RANK_SYSTEM.md](RANK_SYSTEM.md) — XP/Rank progression system. Referrals НЕ дають XP (clean separation). Rank chip і Referrals section visually consistent у Profile.
- [docs/PRODUCT_SPEC.md](PRODUCT_SPEC.md) — переferral mechanics згадано як V2 viral feature. Цей doc розморожує і конкретизує.
- [docs/MVP.md](MVP.md) §10 Deferred — "Notifications (TG bot DMs + push)" та "Share-card" related до bot DM section цього spec.

### Invariants impacted

- **INV-9** (currency atomic) — все referral payouts проходять через `CurrencyService.transact()`
- **INV-7** (logging) — wrap commission payments у try/catch з `logger.error`
- **INV-8** (PII) — `referrer_user_id` не логуй у plaintext, hash при потребі
- **INV-1** (HMAC) — `start_param=ref_X` не trust'имо без commission validation, але referral_user_id перевіряємо перед записом
- **NEW INV-13** — `referrer_user_id` immutable
- **NEW INV-14** — `referral_payouts` immutable
- **NEW INV-15** — chain walk capped at depth 2

### Code locations

Backend:

- `apps/api/src/modules/referrals/` — new module
  - `referrals.service.ts` — payCommissions, preCreateSignupBonuses, maybeUnlockSignupBonuses
  - `referrals.repo.ts` — getReferralChain, queries
  - `referrals.routes.ts` — new endpoints
- `apps/api/src/modules/users/users.service.ts` — extend `upsertOnAuth` для attribution
- `apps/api/src/modules/entries/entries.service.ts` — extend `submitEntry` для bonus unlock
- `apps/api/src/modules/contests/contests.finalize.ts` — extend для payCommissions
- `apps/api/src/modules/bot/notifications.ts` — new для DM sending

Frontend:

- `apps/web/src/features/me/Referrals.tsx` — new (Profile section)
- `apps/web/src/features/lobby/InviteTeaser.tsx` — new (conditional banner)
- `apps/web/src/features/welcome/RefereeWelcome.tsx` — new
- `apps/web/src/features/result/CommissionToast.tsx` — new (in-app)

Shared:

- `packages/shared/src/referrals/` — new package
  - `referral-rates.ts`
  - `welcome-bonuses.ts`
  - `commission-calc.ts`
  - tests
