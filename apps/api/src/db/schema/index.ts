// Drizzle table definitions. One file per domain entity, all re-exported here.
// drizzle-kit reads this barrel for migration generation; the client passes
// the namespace into `drizzle({ schema })` for typed query builders.
//
// NOTE: Inter-schema imports intentionally use extensionless paths (e.g. './users' not './users.js').
// drizzle-kit 0.28 uses a CJS loader internally and resolves './users.js' literally — there is no
// actual 'users.js' file on disk (only 'users.ts'), so the '.js' extension causes MODULE_NOT_FOUND.
// This is a known drizzle-kit limitation. Once drizzle-kit gains proper ESM/ts-node resolution,
// these should be migrated back to './users.js' per the rest of the apps/api codebase convention.
export * from './users.js';
export * from './balances.js';
export * from './transactions.js';
export * from './tokens.js';
export * from './contests.js';
export * from './entries.js';
export * from './price_snapshots.js';
export * from './friendships.js';
export * from './seasons.js';
export * from './xp_events.js';
export * from './referral_payouts.js';
export * from './referral_signup_bonuses.js';
export * from './bot_dm_queue.js';
export * from './coin_packages.js';
export * from './synthetic_actions_log.js';
