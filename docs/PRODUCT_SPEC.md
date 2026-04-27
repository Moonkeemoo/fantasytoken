# Fantasy Token League — Product Spec

> Telegram Mini App: фентезі-ліга де гравці збирають портфелі з крипто-токенів і змагаються їх перфомансом.
> DraftKings для крипто, нативно в Telegram.

---

## Концепт

Гравець отримує **віртуальний бюджет $100K** і "купує" реальні токени за реальними цінами. Збирає портфель з 5 токенів. Вступає в лігу (contest). Через 24h/7d порівнюємо P&L портфелів всіх учасників — хто заробив більше, той виграв.

### Два типи ліг

- **Bull League** — виграє портфель який виріс найбільше. Класична механіка.
- **Bear League** — виграє портфель який впав найбільше. Інвертована логіка (множник -1). Гравець шукає shitcoins, переоцінені проекти, токени перед анлоком. Унікальна механіка якої немає ні в кого.

### Два режими гри

| | Free Mode | Verified Mode |
|---|---|---|
| Вхід | Відкритий для всіх | Потрібно підключити гаманець (TON Connect) |
| Токени | Будь-які з каталогу | Тільки ті що реально є на гаманці |
| Ставки | Безкоштовно | Entry fee (Stars / TON) |
| Нагороди | XP, бейджі, лідерборд | Реальні призи (Stars / TON) |
| Мета | Acquisition, practice, fun | Monetization, retention, skin in the game |

**Конверсійна воронка:** Free Mode → звичка → хочу вищі ставки → підключаю гаманець → Verified Mode.

---

## User Flow

1. **Відкрити Mini App** — через бот-лінк або TG Mini App store. Telegram автоматично дає user ID (initData), реєстрація не потрібна.
2. **Вказати гаманець** (опціонально) — вставити адресу будь-якого EVM/Solana гаманця. Система підтягує holdings. Можна пропустити.
3. **Вибрати лігу** — Bull або Bear, 24h або 7d, free або paid. Бачить призовий фонд, кількість учасників, час до старту.
4. **Зібрати портфель** — $100K віртуальних. Вибрати 5 токенів, розподілити бюджет (можна нерівномірно — all-in в один токен або розкидати).
5. **Змагатися** — після старту бачить P&L кожного токену, загальний score, лідерборд в реальному часі.
6. **Результати** — фінальний рейтинг, нагороди (XP/Stars/TON), кнопка "Share to chat" для вірусного шарингу.

---

## Game Design

### Формати контестів

| Формат | Тривалість | Гравці | Entry | MVP? |
|---|---|---|---|---|
| Sprint | 24 години | Unlimited | Free / 50 Stars | Так |
| Marathon | 7 днів | Unlimited | Free / 100 Stars | Так |
| Head-to-Head | 24h або 7d | 2 гравці | 100–500 Stars | V2 |
| Tournament | 24h або 7d | 8–64 гравці | 200+ Stars | V2 |
| Custom | 1h–30d | Creator sets | Creator sets | V3 |

Кожен формат може бути Bull або Bear.

### Scoring

Базовий score = % зміни ціни токена × allocation weight.

Приклад: вклав $40K (40%) в PEPE, він виріс на +25% → score від цього токена = +10 pts (25% × 0.4).

Для Bear ліг: score = -1 × % зміни × weight. Тобто падіння = плюс, зростання = мінус.

Бонуси (V2):
- Volume spike (>2x average): +5 pts
- New ATH під час контесту: +10 pts
- Rug pull / token goes to zero: -50 pts

### Progression (V2–V3)

- **XP** — за участь, перемоги, стріки
- **Рівні** — Bronze → Silver → Gold → Diamond
- **Achievements** — Win Streak, Comeback King, Diamond Hands, Bear Master
- **Сезони** — щомісячний ресет лідерборду з нагородами

### Engagement Mechanics (V2–V3)

- Daily login bonus (free contest entry, streak multiplier)
- Push notifications (your team is up 15%! contest ending in 1h!)
- Social features (follow top players, challenge friends to H2H)
- FOMO mechanics (limited-entry tournaments, flash contests)

---

## Технічна архітектура

### Stack

| Шар | Технологія |
|---|---|
| Frontend | React + Vite + @twa-dev/sdk + @tonconnect/ui-react |
| Backend | Node.js + PostgreSQL |
| Telegram Bot | node-telegram-bot-api або grammY |
| Payments | Telegram Stars API + TON Connect 2.0 |

**Дизайн** робиться через Claude Code — потрібні нормальні UI інпути, компоненти, адаптивна верстка під Telegram webview.

### Data Pipeline

Ціни токенів можна тягнути з будь-якого джерела — live data не критичний, затримка 5–30 хвилин прийнятна. Головне щоб snapshot на старті і фініші контесту був однаковий для всіх.

Можливі джерела:

| API | Плюси | Мінуси |
|---|---|---|
| DEXScreener | Безкоштовний, 300 req/min, lookup по contract address | Немає historical >24h |
| CoinGecko | Historical OHLC, market cap | Free tier 10K calls/mo |
| CoinMarketCap | Metadata, rankings, широке покриття | Free tier 10K credits/mo |
| Ankr | Wallet scan всіх чейнів одним запитом | Тільки holdings, не ціни |

Рекомендований підхід: cron кожні 5–10 хвилин, batch запит цін всіх токенів в активних контестах, кеш в базу. Конкретний API обрати по ходу.

### Wallet Scanning

Для отримання token holdings з гаманця:
- **Ankr** — один виклик = всі чейни + USD ціни. Free 30M req/mo.
- **Moralis** — 40K CUs/day free. Enriched data.
- **Alchemy** — 300M CUs/month free. Найщедріший.

### Database (Core Entities)

```
users:           telegram_id, username, xp, level, wallet_addresses[], created_at
contests:        id, type (bull/bear), format (sprint/marathon/h2h), entry_fee, prize_pool, start_time, end_time, status
teams:           user_id, contest_id, tokens[] {contract_address, chain, allocation_amount}, submitted_at
price_snapshots: token_address, chain, price_usd, volume_24h, timestamp
leaderboard:     contest_id, user_id, score, rank (materialized view)
```

### Chain Support

| Чейн | Пріоритет | Коментар |
|---|---|---|
| Ethereum | P0 | Основні токени |
| Solana | P0 | Meme coins, швидкозростаючі |
| BSC | P1 | Великий ринок |
| Base | P1 | Швидко росте |
| TON | P2 | Для Telegram compliance |

---

## Telegram Mini App Setup

### Що потрібно зробити

1. **Створити бота** через @BotFather → отримати bot token
2. **Зареєструвати Mini App** через @BotFather → `/newapp` → вказати URL веб-аппки
3. **Налаштувати Menu Button** — кнопка в чаті з ботом що відкриває mini app
4. **Домен і хостинг** — потрібен HTTPS домен (Vercel, Railway, або VPS)
5. **Telegram Stars** — підключити через Bot Payments API для прийому оплат

### Ключові моменти

- **initData** — Telegram автоматично передає user ID, username, і підпис. Валідувати на бекенді через bot token (HMAC-SHA256).
- **TON Connect** — `@tonconnect/ui-react` дає готовий UI для підключення гаманця. Підтримує Tonkeeper, Telegram Wallet та інші.
- **Stars payments** — iOS/Android compliant. Telegram забирає ~30%, розробник отримує ~70%. Виводиться в Toncoin.
- **CloudStorage** — вбудоване key-value сховище для легких даних (~1KB per key). Для основних даних потрібен свій бекенд.
- **Viral mechanics** — Mini App може генерувати share-лінки з параметрами. Referral система нативно підтримується Telegram.

### Обмеження

- **TON-only для блокчейн операцій** — всі платежі через Stars або TON. Промоція non-TON активів заборонена.
- **Наш підхід (Variant B):** оплата Stars/TON, трекінг токенів з інших чейнів як інформаційний/аналітичний сервіс. Аналогічно CoinMarketCap який показує дані з усіх чейнів.
- **Мова UI:** уникати "invest", "trade", "buy". Використовувати "pick", "select", "add to team".

---

## Монетизація

### Revenue Streams

**1. Rake з paid contests (основний)**
- 10% від entry fee кожного paid контесту
- Оплата через Stars (70% dev share) або TON direct (100% dev share)
- Приклад: 1000 DAU × 2 contests × 100 Stars = 200K Stars/day volume → 20K rake → ~$280/day

**2. Premium features (V2)**
- Advanced analytics, custom contests, portfolio optimizer
- 500 Stars/month або 2 TON/month

**3. Cosmetics (V3)**
- Profile themes, avatars, team badges, victory animations
- 50–500 Stars per item

**4. Sponsored contests (V3)**
- Token projects платять за брендовані контести
- $500–5,000 per sponsored contest

### Revenue Projections (Conservative)

| Метрика | Month 1 | Month 3 | Month 6 |
|---|---|---|---|
| DAU | 200 | 1,000 | 5,000 |
| Paid contest rate | 10% | 15% | 20% |
| Monthly rake | ~$42 | ~$630 | ~$6,300 |

---

## MVP Plan

### Week 1: Foundation
- **Day 1–2:** Project setup (React + Vite + TG SDK). Bot registration. Backend (Node.js + PostgreSQL). Deploy staging.
- **Day 3–4:** Wallet scan. Paste address → see holdings. Basic portfolio view.
- **Day 5–7:** Token data pipeline. Price fetching + caching. Snapshot cron job.

### Week 2: Core Game Loop
- **Day 8–9:** Team builder UI. Select 5 tokens, allocate budget. Validation.
- **Day 10–11:** Contest system. Bull + Bear leagues. Auto-start/end. Score calculation.
- **Day 12–14:** Leaderboard. Rankings updated periodically. Personal scorecard. Results page.

### Week 3: Social + Polish
- **Day 15–16:** Share mechanics. Result cards for Telegram chats. Referral links.
- **Day 17–18:** XP system. Basic achievements. Profile page.
- **Day 19–21:** Polish, bug fixes, load testing. TG Mini App store submission.

### Week 4: Monetization (can push to V2)
- **Day 22–24:** Stars integration. Paid contest entry. Prize distribution.
- **Day 25–26:** TON Connect. Wallet verification for Verified Mode.
- **Day 27–28:** Paid contest testing. Edge cases. Launch decision.

### Post-MVP

| Phase | Features | Timeline |
|---|---|---|
| V2 | H2H, tournaments, TON payments, salary cap, achievements | Month 2 |
| V3 | Custom contests, cosmetics, sponsored events, leagues | Month 3–4 |
| V4 | AI advisor, social features, mobile push | Month 5–6 |

---

## Ризики

| Severity | Ризик | Mitigation |
|---|---|---|
| HIGH | Telegram забороняє показувати non-TON токени | Fallback: pivot на TON-only або винести гру на зовнішній сайт |
| HIGH | Низький user acquisition | Viral sharing з Day 1. Seed в крипто TG групах |
| MEDIUM | API rate limits при масштабуванні | Агресивний кеш. Upgrade на paid тiers |
| MEDIUM | Price manipulation (мікрокап токени) | Мінімальний market cap фільтр. Liquidity requirements |
| MEDIUM | Regulatory (фентезі = gambling?) | Спочатку free-only. Stars-only оплата. Skill-based framing |
| LOW | Копікети | First-mover в TG. Network effects. Community moat |

---

## Competitive Landscape

Прямих конкурентів в Telegram немає. Існуючі фентезі-крипто продукти (CoinFantasy, TradingLeagues) — web-only, складний onboarding, low traction.

**Наша перевага:** Telegram distribution (500M mini app MAU) + zero-friction onboarding + Bull/Bear dual mechanics + game design expertise (17 years).

---

## Compliance

- Платежі: тільки Stars + TON
- Wallet: TON Connect 2.0
- Токени з інших чейнів: відображаються як analytics/information
- Призи: тільки Stars або TON
- UI language: "pick", "select", "add to team" замість "buy", "invest", "trade"
