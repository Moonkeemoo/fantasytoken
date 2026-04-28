const cents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCents(amountCents: number): string {
  return cents.format(amountCents / 100);
}

export function formatPct(decimal: number): string {
  const pct = decimal * 100;
  if (pct === 0) return '0.0%';
  const sign = pct > 0 ? '+' : '-';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

/**
 * P&L on the fixed $100 portfolio budget (PORTFOLIO_BUDGET_USD).
 * `score` is a fraction (e.g. 0.0013 → +$0.13). Sign-prefixed; zero unsigned.
 */
export function formatPnl(score: number): string {
  const cents = Math.round(score * 10_000);
  if (cents === 0) return '$0.00';
  const sign = cents > 0 ? '+' : '-';
  return `${sign}${formatCents(Math.abs(cents))}`;
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
