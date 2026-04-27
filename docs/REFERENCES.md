# Fantasy Token League — Reference Projects

> 5 проектів на які дивимось при розробці. Від кожного беремо конкретні механіки.

---

## 1. Hamster Kombat — Growth Engine

**Що це:** Tap-to-earn Telegram Mini App з токеном HMSTR. Найуспішніший TG Mini App в історії.

**Платформа:** Telegram Mini App

**Метрики:** 300M+ users, token launch на TON

**Що вкрасти:**

- Invite-a-friend = free contest entry або bonus budget. Основний драйвер росту.
- Daily engagement hook (у них tap, у нас — daily free draft pick або free contest).
- Streak bonuses за послідовні дні (до 7x multiplier).
- Ці три механіки разом дали 300M юзерів — вони працюють в TG як ніде більше.

**Що вони зробили погано:**

- Нуль skill-based gameplay. Tap-tap-tap — все.
- Після хайпу retention різко впав бо немає глибини.
- Token launch розчарував — ціна впала бо немає utility.

**Висновок для нас:** Беремо growth mechanics, але будуємо на них skill-based гру яка тримає retention довше.

---

## 2. Catizen — Monetization Proof

**Що це:** Cat merge game в Telegram з найсильнішою монетизацією серед всіх TG Mini Apps.

**Платформа:** Telegram Mini App

**Метрики:** 34M users, 800K paying users, $26.4M revenue

**Що вкрасти:**

- Модель IAP + airdrop multiplier: paying users отримують збільшений airdrop allocation. Для нас: paid contest entry = більше XP/airdrop points.
- Stars як основний payment method — iOS/Android compliant, нуль тертя з App Store.
- $26.4M revenue доводить що люди реально платять в TG Mini Apps. Це не теорія.
- Conversion rate ~2.3% (800K payers / 34M users) — реалістичний benchmark для наших проекцій.

**Що вони зробили погано:**

- Геймплей простий (merge cats) — shallow mechanics.
- Retention тримається на airdrop FOMO, не на fun.

**Висновок для нас:** Копіюємо monetization framework (Stars + airdrop multiplier). Наша перевага — глибша стратегія і реальний фінансовий контекст який дає природний retention.

---

## 3. DraftKings / FanDuel — Game Mechanics Bible

**Що це:** Лідери фентезі-спорту. DraftKings + FanDuel = $20B+ combined market cap. Доведена модель 15+ років.

**Платформа:** iOS, Android, Web

**Метрики:** $26B global fantasy sports market, 10-15% rake

**Що вкрасти:**

Три формати контестів (всі треба адаптувати):

- **50/50 (Double Up)** — top 50% гравців подвоюють entry fee. Safe, для казуалів. Великий % гравців виграє → позитивний досвід → retention.
- **GPP (Guaranteed Prize Pool)** — winner-take-most. Top 1 отримує основний приз. Для дегенів і амбітних. Великі призові фонди = маркетинг.
- **Head-to-Head** — дуель 1v1. Найпростіший для розуміння. "Я проти тебе."

Інші механіки:

- Salary cap / budget system — обмежений бюджет змушує робити tradeoffs.
- Late swap — можливість замінити токен до початку контесту (але не після).
- Multi-entry — один юзер може зайти в один contest кілька разів з різними lineup'ами (збільшує volume).

**UX reference:** FanDuel має значно чистіший UI ніж DraftKings. DraftKings перевантажений інформацією. Для мобільного TG viewport — FanDuel як reference.

**Що адаптувати:**

- Замість позицій гравців (QB/RB/WR) — вільний вибір або категорії (meme/DeFi/L1/NFT).
- Замість salary cap per player — загальний бюджет $100K з вільним розподілом.
- Додати Bear leagues — інвертована логіка якої немає в traditional fantasy sports.

---

## 4. CoinFantasy — Concept Validation

**Що це:** Fantasy leagues для крипто-токенів. Найближчий прямий конкурент по механіці.

**Платформа:** Web3 only

**Метрики:** Low traction, token $CFAN

**Що вкрасти:**

- Підтвердження що fantasy crypto — валідний концепт. Люди хочуть змагатись picks.
- Їхні contest formats і scoring rules — вивчити як baseline перед тим як робити свої.
- Вони мають кілька типів ліг (crypto, DeFi, NFT themed) — ідея тематичних ліг корисна.

**Що вони зробили погано (і чому ми виграємо):**

- **Web-only** — нема Telegram distribution. Крипто-аудиторія сидить в TG, а вони на вебсайті.
- **Складний onboarding** — треба connect wallet щоб навіть подивитись. Ми: paste address або просто грай.
- **Overengineered tokenomics** — $CFAN токен не потрібен для гри. Додає складність без цінності.
- **No mobile-first UX** — web interface не оптимізований під мобільний.

**Висновок для нас:** CoinFantasy довів product-market fit для ідеї, але провалив execution на кожному рівні: платформа, UX, onboarding, distribution. Ми вирішуємо всі чотири проблеми одночасно.

**URL:** [coinfantasy.io](https://www.coinfantasy.io/)

---

## 5. Blum — Crypto UX in Telegram

**Що це:** Trade-to-earn Telegram Mini App, hybrid DEX + gamification. Найуспішніший крипто-нативний TG app.

**Платформа:** Telegram Mini App

**Метрики:** 43M MAU

**Що вкрасти:**

- **Referral система** — tiered rewards за запрошених (запросив 5 людей = один рівень, 20 = наступний). Працює краще ніж flat reward.
- **Crypto UX patterns в TG** — як показувати токени, ціни, портфоліо в обмеженому мобільному viewport. Їхній token list UI, search, і portfolio view — хороший reference.
- **Onboarding для крипто-новачків** — progressive disclosure, не вивалюють всю складність одразу.
- **Multi-chain support UX** — як вони показують токени з різних чейнів в одному інтерфейсі.

**Різниця з нами:**

- Blum = реальний трейдинг з реальними грошима.
- Ми = gamified competition з віртуальним бюджетом. Entry fee — єдиний реальний ризик.
- Наш поріг входу нижчий, аудиторія ширша (не треба мати крипту щоб грати в free mode).

**URL:** [blum.io](https://www.blum.io/)

---

## Summary: що від кого беремо

| Ref                | Беремо                                          | Не беремо                         |
| ------------------ | ----------------------------------------------- | --------------------------------- |
| Hamster Kombat     | Invite rewards, daily hooks, streaks            | Tap-to-earn (shallow)             |
| Catizen            | Stars monetization, airdrop multiplier          | Simple merge gameplay             |
| DraftKings/FanDuel | Contest formats (50/50, GPP, H2H), salary cap   | Complex US sports scoring         |
| CoinFantasy        | Concept validation, themed leagues              | Web-only, mandatory wallet, token |
| Blum               | Crypto UX in TG, referral tiers, multi-chain UI | Real trading (we do virtual)      |

## Головний gap

Ніхто не зробив **skill-based crypto competition нативно в Telegram**.

- CoinFantasy має механіку але не має TG distribution.
- Hamster/Catizen мають TG distribution але не мають skill-based gameplay.
- DraftKings має proven model але не має crypto і не має TG.
- Blum має crypto + TG але це трейдинг, не гра.

Ми з'єднуємо: **DraftKings mechanics + Telegram distribution + crypto tokens + Bull/Bear dual leagues**.
