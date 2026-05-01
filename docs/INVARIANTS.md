# Invariants

> Невидимі контракти коду. Порушення → продакшн-баг, втрачені гроші, або compliance issue.
> Посилайся як `INV-N` у комітах, коді, ADR, коментарях.

## Format

```
#N — <правило>. Consequence if violated: <що зламається>.
```

## Active

**INV-1** — Telegram `initData` валідується через HMAC-SHA256 на кожному backend-запиті, що потребує auth. Bot token — на бекенді, ніколи не в frontend bundle. Consequence: spoofed user identity, доступ до чужих портфелів і виплат.

**INV-2** — Snapshot цін на старті та фініші контесту immutable після запису в `price_snapshots`. Якщо API повернув ціну — вона зафіксована, навіть якщо джерело потім "виправило". Consequence: disputed payouts, гравці не довіряють результатам.

**INV-3** — Lineup portfolio: 1–5 unique tokens. Allocations are auto-distributed evenly server-side — there is no user input on per-pick allocation. Stored as integer "alloc cents" / basis points (10000 = 100%); when 10000 % length ≠ 0, the round-off goes to picks in input order (`picks[0..remainder-1]` get +1 basis point). Sum of alloc cents always equals 10000. Frontend wire payload is `{ picks: string[] }` (1–5 unique symbols); backend computes the split via `evenAllocCents`. Consequence: drift between submitted intent and stored portfolio, leaderboard scoring math wrong. Revisions: ADR-0005 (TZ-003, 2026-04-30, поточна — equal-split, 1–5 picks), ADR-0003 (2026-04-30, step=1, range [0,100], 5 picks), ADR-0002 (2026-04-28, step=5, range [5,80]), 2026-04-27 версія ($100K budget).

**INV-4** _(FROZEN for MVP — Bull-only; код preserved)_ — Bear league score = `-1 × pct_change × weight`. Не `abs(pct_change)`, не `1 / pct_change`. Падіння −50% = +50 × weight, зростання +10% = −10 × weight. Consequence: поламана ключова диференціююча механіка продукту.

**INV-5** — Платежі тільки через Telegram Stars або TON Connect 2.0. Жодних card payments, EVM транзакцій, external wallet APIs. Виплати — тільки Stars або TON. Consequence: ban з Telegram Mini App store, юридичні проблеми.

**INV-6** — Адреси гаманців і токени з non-TON чейнів — лише analytics/display. Жодних транзакцій. UI копірайт: "pick", "select", "add to team", "compete" — НЕ "buy", "invest", "trade". Consequence: compliance violation, видалення з store.

**INV-7** — Будь-який caught exception залишає слід. Мінімум `logger.warn` з контекстом, краще counter або alert. `catch (e) {}` заборонено code review-ом. Consequence: тихий fail у "best-effort" коді, баг живе тижнями (історично топ-1 причина продакшн-болю).

**INV-8** — Wallet addresses, telegram_id, і token allocations — PII/sensitive. Не логуються в plaintext. Або hash, або останні 4 символи, або зовсім не логуй. Consequence: leak у логах → GDPR + втрата довіри.

**INV-9** — Зміни balance відбуваються тільки через `CurrencyService.transact()` в одній DB-транзакції: insert `transactions` row → upsert `balances` → check `amount_cents >= 0` → rollback при overdraft. Direct `UPDATE balances` заборонено code review-ом. `balances` — denormalized cache; `transactions` — source of truth. Consequence: drift балансу від audit log, неможливість відтворити стан, втрачені/дубльовані виплати.

**INV-10** — Lineup picks (5 токенів і їх allocations) immutable після `entries.submitted_at`. Жодного UPDATE на `entries.picks` після submit. Consequence: гравець перебудовує lineup ретроспективно, ламає чесність контесту.

**INV-11** — XP awards immutable. Запис у `xp_events` ніколи не UPDATE; коригування пишуться як новий рядок з `reason='reversal'`. `users.xp_total` / `users.xp_season` — denormalized cache; `xp_events` — source of truth (повторює INV-9 для XP-аудиту). Consequence: drift XP від audit log → disputable rank, неможливо відтворити стан.

**INV-12** — Rank monotonic в межах сезону. `users.current_rank` тільки росте від `awardXp` через `GREATEST(current_rank, new_rank)`. Єдине виключення — soft-reset наприкінці сезону (`max(5, current_rank - 5)`). Consequence: юзер втрачає прогрес посеред сезону і кидає app.

**INV-14** — Synthetic users (`users.is_synthetic = true`) приховані від real-user-facing read paths. Partial index `users_real_only_idx` сигналізує: кожен `SELECT … FROM users` у production-контексті (профіль, friends discovery, referral attribution, real-user counts, leaderboards поза рамками одного контесту) фільтрує `is_synthetic = false`. Per-contest leaderboards — виняток: synthetic entries навмисно з'являються поруч із real, бо це "населення" продукту (TZ-005). Consequence: real юзер бачить fake handle у `friends`/`recruiter` UI → втрата довіри; analytics counts inflated → невірні бізнес-метрики. Source: ADR-0006 (TZ-005, 2026-05-01).

**INV-15** — Pre-lock `entries.user_id IS NOT NULL` count ніколи не перевищує `contests.max_capacity`. Перевірка у `entriesService.submit` (server-side) ОБОВ'ЯЗКОВА — лобі-фільтр у `contests.routes.ts` не enforce, лише ховає UI. Bot fill (`lockAndSpawn`) додає ботів до залишку seats AFTER lock; до lock'а тільки реальні entries рахуються в cap. Consequence: контест "26/20" у лобі (sim-cohort showed this), drift у prize-pool математиці, broken leaderboard counts. Source: ADR-0007 / fix(entries) e03cd06.

**INV-16** — `entriesService.submit` rejects with `CONTEST_NOT_OPEN` коли `users.current_rank < contests.min_rank`. Лобі route фільтрує rank-gated контести з UI, але це лише cosmetics — будь-який direct submit (curl, sim, future client divergence) має пройти server-side перевірку. Consequence: rank-1 юзер витрачає welcome bonus на rank-2/5 контест (sim showed this on day-1: synth з 20 coins вгрузався у Whale Hour minRank=13). Source: ADR-0007.

## Maintenance

- Знайшов невидимий контракт у коді → додай як `INV-N`.
- Cite в коді: `// INV-N: <короткий нагад>` поряд із кодом, який його забезпечує.
- Зміна або видалення інваріанта → обов'язково ADR із причиною. Не редагуй мовчки.
- Нумерація монотонна (не переюзуємо `INV-N` після видалення — позначаємо `~~INV-N~~ deprecated` нижче в розділі "Retired").
