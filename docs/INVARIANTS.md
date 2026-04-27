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

**INV-3** — Allocation портфеля sums рівно до $100K (не більше, не менше). Рівно 5 токенів, кожен з allocation > 0. Валідація на frontend і backend — backend є source of truth. Consequence: гравець з $200K портфелем виграє нечесно, leaderboard ламається.

**INV-4** — Bear league score = `-1 × pct_change × weight`. Не `abs(pct_change)`, не `1 / pct_change`. Падіння −50% = +50 × weight, зростання +10% = −10 × weight. Consequence: поламана ключова диференціююча механіка продукту.

**INV-5** — Платежі тільки через Telegram Stars або TON Connect 2.0. Жодних card payments, EVM транзакцій, external wallet APIs. Виплати — тільки Stars або TON. Consequence: ban з Telegram Mini App store, юридичні проблеми.

**INV-6** — Адреси гаманців і токени з non-TON чейнів — лише analytics/display. Жодних транзакцій. UI копірайт: "pick", "select", "add to team", "compete" — НЕ "buy", "invest", "trade". Consequence: compliance violation, видалення з store.

**INV-7** — Будь-який caught exception залишає слід. Мінімум `logger.warn` з контекстом, краще counter або alert. `catch (e) {}` заборонено code review-ом. Consequence: тихий fail у "best-effort" коді, баг живе тижнями (історично топ-1 причина продакшн-болю).

**INV-8** — Wallet addresses, telegram_id, і token allocations — PII/sensitive. Не логуються в plaintext. Або hash, або останні 4 символи, або зовсім не логуй. Consequence: leak у логах → GDPR + втрата довіри.

## Maintenance

- Знайшов невидимий контракт у коді → додай як `INV-N`.
- Cite в коді: `// INV-N: <короткий нагад>` поряд із кодом, який його забезпечує.
- Зміна або видалення інваріанта → обов'язково ADR із причиною. Не редагуй мовчки.
- Нумерація монотонна (не переюзуємо `INV-N` після видалення — позначаємо `~~INV-N~~ deprecated` нижче в розділі "Retired").
