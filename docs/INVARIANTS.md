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

**INV-3** — Allocation портфеля: рівно 5 токенів, кожен alloc — ціле число (`step=1`), `0 ≤ alloc ≤ 100`, сума всіх часток рівно 100%. Frontend валідує UX, backend є source of truth. Consequence: гравець з 110% портфелем виграє нечесно, leaderboard ламається. Revisions: ADR-0003 (2026-04-30, поточна — step=1, range [0,100]), ADR-0002 (2026-04-28, step=5, range [5,80]), 2026-04-27 версія ($100K budget).

**INV-4** _(FROZEN for MVP — Bull-only; код preserved)_ — Bear league score = `-1 × pct_change × weight`. Не `abs(pct_change)`, не `1 / pct_change`. Падіння −50% = +50 × weight, зростання +10% = −10 × weight. Consequence: поламана ключова диференціююча механіка продукту.

**INV-5** — Платежі тільки через Telegram Stars або TON Connect 2.0. Жодних card payments, EVM транзакцій, external wallet APIs. Виплати — тільки Stars або TON. Consequence: ban з Telegram Mini App store, юридичні проблеми.

**INV-6** — Адреси гаманців і токени з non-TON чейнів — лише analytics/display. Жодних транзакцій. UI копірайт: "pick", "select", "add to team", "compete" — НЕ "buy", "invest", "trade". Consequence: compliance violation, видалення з store.

**INV-7** — Будь-який caught exception залишає слід. Мінімум `logger.warn` з контекстом, краще counter або alert. `catch (e) {}` заборонено code review-ом. Consequence: тихий fail у "best-effort" коді, баг живе тижнями (історично топ-1 причина продакшн-болю).

**INV-8** — Wallet addresses, telegram_id, і token allocations — PII/sensitive. Не логуються в plaintext. Або hash, або останні 4 символи, або зовсім не логуй. Consequence: leak у логах → GDPR + втрата довіри.

**INV-9** — Зміни balance відбуваються тільки через `CurrencyService.transact()` в одній DB-транзакції: insert `transactions` row → upsert `balances` → check `amount_cents >= 0` → rollback при overdraft. Direct `UPDATE balances` заборонено code review-ом. `balances` — denormalized cache; `transactions` — source of truth. Consequence: drift балансу від audit log, неможливість відтворити стан, втрачені/дубльовані виплати.

**INV-10** — Lineup picks (5 токенів і їх allocations) immutable після `entries.submitted_at`. Жодного UPDATE на `entries.picks` після submit. Consequence: гравець перебудовує lineup ретроспективно, ламає чесність контесту.

**INV-11** — XP awards immutable. Запис у `xp_events` ніколи не UPDATE; коригування пишуться як новий рядок з `reason='reversal'`. `users.xp_total` / `users.xp_season` — denormalized cache; `xp_events` — source of truth (повторює INV-9 для XP-аудиту). Consequence: drift XP від audit log → disputable rank, неможливо відтворити стан.

**INV-12** — Rank monotonic в межах сезону. `users.current_rank` тільки росте від `awardXp` через `GREATEST(current_rank, new_rank)`. Єдине виключення — soft-reset наприкінці сезону (`max(5, current_rank - 5)`). Consequence: юзер втрачає прогрес посеред сезону і кидає app.

## Maintenance

- Знайшов невидимий контракт у коді → додай як `INV-N`.
- Cite в коді: `// INV-N: <короткий нагад>` поряд із кодом, який його забезпечує.
- Зміна або видалення інваріанта → обов'язково ADR із причиною. Не редагуй мовчки.
- Нумерація монотонна (не переюзуємо `INV-N` після видалення — позначаємо `~~INV-N~~ deprecated` нижче в розділі "Retired").
