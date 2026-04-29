import type { ReferralCurrency } from '@fantasytoken/shared';

/** One commission event aggregated into a DM. */
export interface CommissionEvent {
  sourceFirstName: string | null;
  sourcePrizeCents: number;
  payoutCents: number;
  level: 1 | 2;
  contestName: string | null;
  currency: ReferralCurrency;
}

/** MarkdownV2 reserved chars per https://core.telegram.org/bots/api#markdownv2-style. */
function escMd(s: string): string {
  return s.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);
}

function fmtMoney(cents: number, currency: ReferralCurrency): string {
  if (currency === 'USD') return `$${(cents / 100).toFixed(2)}`;
  if (currency === 'STARS') return `${cents} ⭐`;
  // TON nominals are stored in cents-style minor units; display 2 decimals.
  return `${(cents / 100).toFixed(2)} TON`;
}

/**
 * Format the DM body. Single event → personal message with friend's name +
 * contest. Multiple events → grouped one-liner per spec §11.2 ("3 friends
 * won contests · +$X total to your balance").
 *
 * Returns MarkdownV2 — caller passes parse_mode: 'MarkdownV2'.
 */
export function formatCommissionDM(events: CommissionEvent[]): string {
  if (events.length === 0) throw new Error('formatCommissionDM: empty events');

  const totalByCurrency = new Map<ReferralCurrency, number>();
  for (const e of events) {
    totalByCurrency.set(e.currency, (totalByCurrency.get(e.currency) ?? 0) + e.payoutCents);
  }

  if (events.length === 1) {
    const e = events[0]!;
    const friend = escMd(e.sourceFirstName ?? 'Your friend');
    const contest = e.contestName ? ` in *${escMd(e.contestName)}*` : '';
    const prize = escMd(fmtMoney(e.sourcePrizeCents, e.currency));
    const payout = escMd(fmtMoney(e.payoutCents, e.currency));
    const pct = e.level === 1 ? '5%' : '1%';
    return (
      `🎉 *${friend}* just won ${prize}${contest}\n` +
      `L${e.level} commission: ${pct} of their prize\n\n` +
      `*\\+${payout}* to your balance`
    );
  }

  // Aggregated message — keep it scannable.
  const totalParts = [...totalByCurrency.entries()]
    .map(([c, n]) => escMd(fmtMoney(n, c)))
    .join(' \\+ ');
  const friends = events.length === 2 ? '2 friends' : `${events.length} friends`;
  return `🎉 *${friends}* just won contests\n\n` + `*\\+${totalParts}* total to your balance`;
}
