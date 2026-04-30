// Welcome economy constants. ALL bonuses are soft COINS only — never real
// currency (Stars/TON). See REFERRAL_SYSTEM.md §3 for rationale (real-money
// sustainability + anti-fraud + compliance). 1 coin = $1 fantasy display.

/** Credited on first /me upsert via CurrencyService.transact (INV-9). */
export const WELCOME_BONUS_COINS = 20;

/** Credited to the referee after they finish their 1st contest. */
export const REFEREE_SIGNUP_BONUS_COINS = 25;

/** Credited to the recruiter after their referee finishes 1st contest. */
export const RECRUITER_SIGNUP_BONUS_COINS = 25;

/** Welcome bonus expires if user hasn't played anything within this window —
 * anti-inflation guard so cumulative mint stays bounded. Daily cron debits
 * unused balances via CurrencyService with type 'WELCOME_EXPIRED'. */
export const WELCOME_EXPIRY_DAYS = 7;

/** Signup bonuses unlock only after the referee has finalized this many
 * contests. Tightening (e.g. 5) is a config-only change, no migration. */
export const REQUIRED_CONTESTS_FOR_BONUS = 1;
