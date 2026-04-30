/**
 * $-first display utilities for the team-builder redesign (ADR-0003 / TZ-001).
 *
 * `fmtMoney`     — compact ($1.2K, $100K, $1.5M); used in slot tiles, hero, lineup labels.
 * `fmtMoneyExact` — exact with commas ($1,234,567); used in detail sheets and tooltips.
 * `fmtPnL`       — signed compact (+$96, −$1.2K); P&L rows in Live screens.
 * `dollarsFor`   — convert (alloc%, tier $) → integer dollars. Mirrors UX bind.
 *
 * These are display-only. Backend score / payout flows continue to operate
 * in pure % space (see ADR-0002, ADR-0003); `virtualBudget` is a UX layer.
 */

const ABS_LT_1K = 1_000;
const ABS_LT_1M = 1_000_000;
const ABS_LT_1B = 1_000_000_000;

function compactBody(absValue: number): string {
  if (absValue < ABS_LT_1K) return `${Math.round(absValue)}`;
  if (absValue < ABS_LT_1M) return `${trimTrailingZero(absValue / ABS_LT_1K)}K`;
  if (absValue < ABS_LT_1B) return `${trimTrailingZero(absValue / ABS_LT_1M)}M`;
  return `${trimTrailingZero(absValue / ABS_LT_1B)}B`;
}

/**
 * Drop a trailing `.0` for round numbers (1 → "1", 1.5 → "1.5", 1.23 → "1.2").
 * Always one decimal of precision below 1000-magnitude.
 */
function trimTrailingZero(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

/**
 * Compact dollar display: $123 / $1.2K / $100K / $1.5M / $2B.
 * Negatives keep the minus inside the sign: −$1.2K (handled by `fmtPnL`).
 * Zero → "$0" (no decimals; this is a UX surface, not accounting).
 */
export function fmtMoney(amount: number): string {
  if (!Number.isFinite(amount)) return '$0';
  const abs = Math.abs(amount);
  return `$${compactBody(abs)}`;
}

/**
 * Exact dollar display with thousands separators: $1,234,567.
 * Rounds to whole dollars (no cents at this UX layer).
 */
export function fmtMoneyExact(amount: number): string {
  if (!Number.isFinite(amount)) return '$0';
  const rounded = Math.round(amount);
  return `$${rounded.toLocaleString('en-US')}`;
}

/**
 * Signed compact P&L: `+$96`, `−$1.2K`, `+$420`, `$0`.
 * Uses U+2212 MINUS SIGN (not ASCII hyphen) so it aligns with `+` typographically.
 * Zero is unsigned.
 */
export function fmtPnL(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return '$0';
  const sign = amount > 0 ? '+' : '−';
  return `${sign}$${compactBody(Math.abs(amount))}`;
}

/**
 * Convert allocation percent to whole dollars at the contest's virtual budget.
 * `dollarsFor(30, 100_000) === 30_000`. Result is `Math.round`ed —
 * UI shows whole dollars; cents are an accounting concern, not a UX one.
 *
 * Used as the single bridge between % (the backend's domain) and $ (the UX domain).
 */
export function dollarsFor(allocPct: number, tierUsd: number): number {
  if (!Number.isFinite(allocPct) || !Number.isFinite(tierUsd)) return 0;
  return Math.round((tierUsd * allocPct) / 100);
}
