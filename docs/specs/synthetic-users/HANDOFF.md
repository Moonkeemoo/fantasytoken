# Synthetic Users Simulation (TZ-005)

> Створюємо когорту фейкових-але-справжніх юзерів які грають у наші контести. Мета — перевірити business-логіку end-to-end, населити лідерборди, зробити перші реальні юзери не ходили по пустому світу.
>
> Запускаємо у **prod** (бо там зараз нікого нема). Coins не справжні гроші, тому mix synthetic ↔ real безпечний. Stars purchase — поза скоупом v1.

---

## 0. Прийняті рішення

| Рішення                 | Значення                                              | Why                                                                    |
| ----------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Платежі                 | **Skip у v1.** Coins даються через admin grant        | Stars — це реальні гроші, складність payment simulation не варта зараз |
| Where it runs           | **Prod** з flag `is_synthetic=true`                   | Нема інших юзерів у prod; staging переусклад                           |
| Mixing real ↔ synthetic | OK                                                    | Coins ≠ real money, payouts теж Coins                                  |
| Pacing                  | Realistic (bell curve / exponential decay)            | Без цього лідерборд виглядає як cron job                               |
| Behavior tuning         | Claude Code agent читає логи, корегує persona weights | Iterative через спостереження, не by spec                              |

---

## 1. Schema additions

```ts
// users table — додати:
isSynthetic: boolean('is_synthetic').notNull().default(false),
personaKind: text('persona_kind'),  // 'whale' | 'casual' | 'meme_chaser' | 'newbie' | 'streaker' | 'inviter' | 'lurker'
syntheticSeed: integer('synthetic_seed'),  // deterministic randomness per user

// telegram_id для synthetic — negative numbers (real TG IDs always positive)
//   синтетик #1 → telegram_id = -1
//   синтетик #2 → telegram_id = -2
//   ...

// new table: synthetic_actions_log
syntheticActionsLog: pgTable('synthetic_actions_log', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  tick: timestamp('tick').notNull(),
  action: text('action').notNull(),  // 'login' | 'join_contest' | 'submit_lineup' | 'invite_friend' | 'idle' | ...
  payload: jsonb('payload'),         // contestId, lineup syms, etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

**Index:** `users(is_synthetic) WHERE is_synthetic = false` — hot path для prod queries що повинні фільтрувати synthetic.

---

## 2. Personas — initial set

7 типажів. Кожен — об'єкт з probability weights.

```ts
// apps/api/src/sim/personas/index.ts

export interface Persona {
  kind: string;
  loginProbability(hour: number): number; // 0..1, by hour of day
  contestPickProbability(contest: Contest): number;
  preferredLineupSize: () => number; // 1..5, sampled
  tokenBias: 'bluechip' | 'meme' | 'mixed' | 'volatile';
  topUpBehavior: { intervalDays: number; amountCoins: number } | null;
  referralRate: number; // 0..1, per day
}

export const PERSONAS: Record<string, Persona> = {
  whale: {
    /* high spend, joins all paid, max packages, all-in (1 token) */
  },
  casual: {
    /* free only, 50/50 picks, daily login chance 20% */
  },
  meme_chaser: {
    /* Bear contests, memecoins, 1-2 token lineups */
  },
  newbie: {
    /* first-week shape, follows tutorials, 5 picks (instinct) */
  },
  streaker: {
    /* daily login, rank-focused, balanced lineups */
  },
  inviter: {
    /* high referral rate, posts in chats */
  },
  lurker: {
    /* opens app rarely, observes leaderboards */
  },
};
```

**Distribution для seed:** 40% casual, 20% newbie, 15% streaker, 10% meme_chaser, 8% lurker, 5% inviter, 2% whale. Налаштовується у `config/sim.ts`.

---

## 3. Driver — tick worker

```ts
// apps/api/src/sim/tick.ts
// runs every 5 minutes via cron (existing cron infrastructure)

async function syntheticTick() {
  const synthetics = await db.select().from(users).where(eq(users.isSynthetic, true));
  const now = new Date();
  const hour = now.getHours();

  for (const user of synthetics) {
    const persona = PERSONAS[user.personaKind];

    // Login decision
    if (Math.random() > persona.loginProbability(hour)) {
      await logAction(user.id, 'idle', null);
      continue;
    }

    // Decide action: join contest? submit lineup? invite? top-up?
    const action = pickWeightedAction(persona, currentContestState);
    await executeAction(user, action);
  }
}
```

**Actions використовують ті самі сервіси що real users** (через існуючий `entryService`, `coinLedgerService`, etc.). Симуляція тестує реальну логіку, не bypass.

**Realistic pacing для contest entries:** synthetic користувачі не лочаться у момент 0 контесту. Розподіл — exponential decay від відкриття вікна або bell curve навколо середини. Реалізується через `await sleep(jitter(persona))` всередині `joinContest` action.

---

## 4. Admin endpoints (тільки behind feature flag)

```ts
// apps/api/src/sim/admin.controller.ts
// гарддед під `process.env.SIM_ADMIN_ENABLED === 'true'`

POST /admin/sim/seed
  body: { count: number, distribution?: Partial<Record<string, number>> }
  → створює N synthetic users з вказаним розподілом personas

POST /admin/sim/grant-coins
  body: { userId: string, amount: number }
  → admin credit без Stars charge. Logs у coin_ledger з type='dev_grant'.

POST /admin/sim/set-rank
  body: { userId: string, rank: number, xp?: number }
  → adjust XP/rank напряму. Дозволяє створювати "досвідчених" personas

POST /admin/sim/wipe
  → DELETE FROM users WHERE is_synthetic=true (cascade на entries, ledger, etc.)
  → один transaction. Use case: clean slate для re-seed або pre-launch cleanup
```

**Idempotency:** seed з тим самим `seed` параметром повертає той самий набір IDs (deterministic generation).

---

## 5. Naming pool — фейкові handles

Synthetic users мають TG-стилеві handles. Pool ~200 слів з crypto/internet vernacular:

```ts
const ADJECTIVES = ['neon', 'crypto', 'degen', 'whale', 'shadow', 'apex', 'cyber', ...];
const NOUNS = ['bat', 'fox', 'shark', 'wolf', 'phoenix', 'dragon', 'samurai', ...];
const SUFFIXES = ['_42', 'x', '420', '69', '_', '_pro', '_eth', ''];

// generates: @neonbat, @cryptofox_42, @degenshark420, @apexwolf_pro
```

**Жодних "bot*" / "fake*" / "test\_"** prefixes — мають виглядати як real users.

---

## 6. Cleanup mechanism

`pnpm sim:wipe` команда (через `package.json` script у `apps/api/`):

```bash
pnpm sim:wipe                     # interactive confirm
pnpm sim:wipe --force             # CI-friendly
pnpm sim:wipe --dry-run           # show what would be deleted
```

Видаляє:

1. Усі rows з `users` де `is_synthetic=true`
2. Cascade: всі їх entries, coin_ledger entries, referral edges, synthetic_actions_log
3. Перераховує prize_pools для активних контестів (без synthetic entries)

**Перевірка:** post-wipe інтегральний checkpoint — `count(users WHERE is_synthetic=true) === 0`.

---

## 7. Files to create

| File                                   | Purpose                                               |
| -------------------------------------- | ----------------------------------------------------- |
| `apps/api/src/sim/index.ts`            | Public exports                                        |
| `apps/api/src/sim/personas/*.ts`       | 7 persona definitions                                 |
| `apps/api/src/sim/tick.ts`             | Cron-driven simulation loop                           |
| `apps/api/src/sim/actions/*.ts`        | login, joinContest, submitLineup, invite, topUp, idle |
| `apps/api/src/sim/seed.ts`             | Generate N synthetics with distribution               |
| `apps/api/src/sim/wipe.ts`             | Cleanup logic                                         |
| `apps/api/src/sim/naming.ts`           | Handle generation                                     |
| `apps/api/src/sim/admin.controller.ts` | Endpoints (feature-flagged)                           |
| `apps/api/src/sim/log.ts`              | `synthetic_actions_log` writer                        |
| `packages/shared/src/schemas/sim.ts`   | Schema definitions                                    |
| Migration файл                         | Schema changes                                        |

---

## 8. Implementation milestones

### M1 — Schema + seed (no behavior yet)

- Migration: `is_synthetic`, `persona_kind`, `synthetic_seed`, `synthetic_actions_log` table
- Naming pool generator
- Seed script: створює N synthetics з distribution, пустий log
- Admin endpoints: `seed`, `grant-coins`, `wipe`
- Index hot path

**AC:** `pnpm sim:seed --count 100` створює 100 synthetics з різними personas. `pnpm sim:wipe` чистить. Cycle stable.

### M2 — Static play (one-shot per contest)

- Action: `joinContest` — synthetic user обирає рандомний lineup згідно persona, submit'ить через real `entryService`
- Action: `submitLineup` — окремо викликається коли треба
- Hook: при появі нового контесту, тригерить wave з ~30-50 synthetic entries з jitter pacing

**AC:** Створюємо контест → через 2-3 хв бачимо 30-50 synthetic entries у lineup-list. Lineup distributions різні. Жодних 5-token unanimous вибірок.

### M3 — Tick worker (continuous behavior)

- Cron job tick every 5min
- Actions: `login`, `idle`, `joinContest` (вже є), `topUp` (admin grant), `inviteFriend`
- Persona weights застосовуються
- Realistic pacing (jitter wraps)
- All actions logged до `synthetic_actions_log`

**AC:** Запускаємо tick на 24 години, бачимо у logs natural-looking distribution: peak hours, contest entries, occasional referrals.

### M4 — Referral cascade

- `inviteFriend` action створює нового synthetic user (з child persona) + edge у referral graph
- Tree depth до 3-4 рівнів
- Conversion rate ~20-30% per invite

**AC:** Через 3 дні simulation, referral graph має ≥50 cascaded users з невеликих "founders" cohort.

---

## 9. Hooks for Claude Code agent (the polish loop)

Agent читатиме `synthetic_actions_log` + порівнюватиме з очікуваними patterns. Для цього в коді явно експонуємо:

- `apps/api/src/sim/observability.ts` — exports:
  - `getActionDistribution(timeRange)` — гістограма actions
  - `getPeakHourLoad(timeRange)` — навантаження по годинах
  - `getReferralTreeShape()` — дерево
  - `getLineupDiversity(contestId)` — індекс різноманіття pick'ів

- `config/sim.ts` — **усі persona weights в одному файлі**, легко агенту edit'ити:
  ```ts
  export const SIM_CONFIG = {
    personas: {
      whale: { loginPeak: 0.85, joinPaid: 0.6, ... },
      // ...
    },
    pacing: {
      contestEntryWindow: 'exponential' | 'bell' | 'uniform',
    },
    distribution: { /* % per persona */ },
  };
  ```

Agent цикл (поза цим handoff'ом):

1. Читає `synthetic_actions_log` за останні 24h
2. Порівнює з cohort metrics що ми вже знаємо з real fantasy/gambling apps
3. Якщо відхилення > threshold — adjust `config/sim.ts`
4. Hot reload (можливо через polling config) — або waiting until next tick

---

## 10. Acceptance criteria

**M1 (Schema + seed):**

- [ ] Migration applied у prod
- [ ] `pnpm sim:seed --count 100` працює
- [ ] `pnpm sim:wipe` працює і повертає `synthetics === 0`
- [ ] Index `WHERE is_synthetic=false` створено

**M2 (Static play):**

- [ ] Synthetic user може зайти у контест через real `entryService`
- [ ] Coin ledger entry створюється для synthetic spend
- [ ] Lineup diversity index >0.6 (не всі однакові)

**M3 (Tick worker):**

- [ ] Cron tick кожні 5 хв
- [ ] Кожна дія логується у `synthetic_actions_log`
- [ ] Login distribution має peak hours (не uniform)

**M4 (Referral):**

- [ ] `inviteFriend` створює нового synthetic
- [ ] Referral edges правильно записуються
- [ ] Tree depth ≥3 за 1 тиждень

**Cross-cutting:**

- [ ] `pnpm typecheck && pnpm lint && pnpm test` зелені
- [ ] Жодних `is_synthetic=true` без `persona_kind` set
- [ ] All admin endpoints behind `SIM_ADMIN_ENABLED` flag

---

## 11. Не робимо (deferred)

- **Stars purchase simulation** — синтетики не "купують" Coins через TG. Тільки admin grant. Реалізуємо у v2 коли real юзери з'являються
- **Cross-contamination protection** — поки в prod нема real users, simple flag достатньо. Додамо guards коли ramp up'имо real traffic
- **Withdrawal simulation** — теж v2
- **UI markers для synthetic users** — real users їх бачитимуть як звичайних. У внутрішньому admin UI можна підсвічувати, але це окремо

---

## 12. Risk callouts

- **Index хот-патч**: усі prod-запити що показують real users мають фільтрувати `is_synthetic=false`. Перед merge перевір кожне `SELECT * FROM users` і `count(users)` у кодбейзі — додай WHERE clause
- **Leaderboard payouts**: коли paid контест завершується, synthetic-winners отримують payout (через real flow). Це OK у v1 (Coins ≠ real money), але **майбутній TON-mode** треба буде перевірити що synthetic не отримує TON payout. Документуй у TZ-006 коли почнем TON
- **Backwards compat**: усі existing Coin ledger queries вже працюють — synthetic просто має інший `user_id`. Нічого не зламається
- **Performance**: 1000 synthetics × tick кожні 5хв = 12K ops/min всього — OK для нашого scale. Але якщо ramp'имо до 10K — оптимізуй tick batching

---

**TZ-005 · v1 · 30 квіт 2026 (доповнено 1 травня 2026)**
**Базується на:** TZ-001..004 (всі implemented). Не зачіпає них.
**Передує:** Запис у memory `project_synthetic_users.md` (зробити окремо).
