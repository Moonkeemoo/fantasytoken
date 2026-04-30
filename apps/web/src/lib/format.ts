import { fmtMoney } from '@fantasytoken/shared';

// TZ-002: amounts on the wire are now WHOLE COINS (1 coin = $1 fantasy
// display). Function name kept under `formatCents` so the 60+ call sites
// don't churn — output flipped from `$N` to `🪙 N` and switched to compact
// notation. Plain `20,000` confused Ukrainian-locale readers (where comma
// is the decimal separator → "20.0"); `🪙 20K` is unambiguous.
export function formatCents(amount: number): string {
  if (!Number.isFinite(amount)) return '🪙 0';
  // Reuse fmtMoney's compact rules ($, 1.2K, 100K, 1.5M) — same source of
  // truth as DraftScreen / hero / top-up sheet. Strip `$` prefix, re-prefix
  // with coin emoji.
  return `🪙 ${fmtMoney(Math.abs(amount)).replace(/^\$/, '')}`;
}

export function formatPct(decimal: number): string {
  const pct = decimal * 100;
  if (pct === 0) return '0.0%';
  const sign = pct > 0 ? '+' : '-';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

/** Same as formatPct but with 2-decimal precision — used in places where a
 * sub-tenth-percent move would otherwise round visually to "0.0%" and hide
 * the actual sign of the result (e.g. the no-prize headline). */
export function formatPctPrecise(decimal: number): string {
  const pct = decimal * 100;
  if (pct === 0) return '0.00%';
  const sign = pct > 0 ? '+' : '-';
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

/**
 * P&L on the fixed 100-coin portfolio (TZ-002 swap-in). `score` is a fraction
 * (e.g. 0.10 → +🪙 10). Sign-prefixed; zero unsigned.
 */
export function formatPnl(score: number): string {
  if (!Number.isFinite(score)) return '🪙 0';
  const coins = Math.round(score * 100);
  if (coins === 0) return '🪙 0';
  const sign = coins > 0 ? '+' : '-';
  return `${sign}${formatCents(Math.abs(coins))}`;
}

export function formatTimeLeft(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const sec = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const min = totalMin % 60;
  const hr = Math.floor(totalMin / 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hr > 0) return `${pad(hr)}:${pad(min)}:${pad(sec)}`;
  return `${pad(min)}:${pad(sec)}`;
}
