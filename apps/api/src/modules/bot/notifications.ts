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

/**
 * One contest-finalized event. Emitted per (real entry, finalized contest)
 * once payouts settle; the queue may aggregate multiple of these for the
 * same recipient (e.g. user entered 3 contests that all finalized in the
 * same hour) into a single summary DM.
 */
export interface ContestFinalizedEvent {
  /** entries.id — used by the drain to skip rows whose result was already viewed. */
  entryId: string;
  contestId: string;
  contestName: string;
  finalRank: number;
  totalEntries: number;
  prizeCents: number;
  /** Deep-link back into the mini-app's result page. */
  resultUrl: string;
}

/**
 * One contest-cancelled event. Emitted per refunded entry when the
 * stale-state cron auto-cancels a contest stuck in scheduled / active /
 * finalizing past the threshold. We DM so users know their balance got
 * topped back up rather than wondering where the entry went.
 */
export interface ContestCancelledEvent {
  entryId: string;
  contestId: string;
  contestName: string;
  refundCents: number;
  resultUrl: string;
}

/**
 * One signup-bonus unlock event. Emitted when a referee finalises their
 * first contest — the queue gets one row per side of the pair (REFEREE
 * for the new user, RECRUITER for their inviter). Without a dedicated
 * notification the +$25 looks like it appeared from nowhere on the
 * balance, especially when it lands at the same time as a +$0.08 prize.
 */
export interface ReferralUnlockEvent {
  /** Whose unlock this is. Drives the copy: 'REFEREE' = welcome bonus
   * for the new user; 'RECRUITER' = "your friend played their first" for
   * the inviter. */
  bonusType: 'REFEREE' | 'RECRUITER';
  amountCents: number;
  /** RECRUITER side: the referee whose first game tripped the unlock.
   * REFEREE side: null (the recipient IS that user). */
  sourceFirstName: string | null;
  /** Deep-link to the app — the result page for the referee's first
   * finished contest (lets the inviter peek at what their friend did). */
  appUrl: string;
}

/** MarkdownV2 reserved chars per https://core.telegram.org/bots/api#markdownv2-style. */
function escMd(s: string): string {
  return s.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);
}

/** Inside an inline-link `(url)` only `)` and `\` must be escaped — running
 * the full escMd here would break percent-encodings and dots in domains. */
function escMdUrl(url: string): string {
  return url.replace(/[)\\]/g, (c) => `\\${c}`);
}

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
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

/**
 * Format a "your contest finished" DM. Single event → personal message
 * with the contest name + rank + prize line + a link button. Multiple
 * events → grouped summary with the per-contest one-liners and a single
 * link to the live list (so the user picks which one to open).
 *
 * USD-only for V1 (matches the cash economy). Returns MarkdownV2.
 */
export function formatContestFinalizedDM(events: ContestFinalizedEvent[]): string {
  if (events.length === 0) throw new Error('formatContestFinalizedDM: empty events');

  if (events.length === 1) {
    const e = events[0]!;
    const contest = escMd(e.contestName);
    const rank = `\\#${e.finalRank} of ${e.totalEntries}`;
    const url = escMdUrl(e.resultUrl);
    if (e.prizeCents > 0) {
      const prize = escMd(fmtUsd(e.prizeCents));
      return (
        `🏁 *${contest}* finished — you placed ${rank}\n\n` +
        `*\\+${prize}* credited to your balance\n\n` +
        `[View result →](${url})`
      );
    }
    return (
      `🏁 *${contest}* finished — you placed ${rank}\n\n` +
      `No prize this round\\. New contests are open already\\.\n\n` +
      `[View result →](${url})`
    );
  }

  // Aggregate: list each contest as a one-liner, total prize underneath.
  const totalCents = events.reduce((s, e) => s + e.prizeCents, 0);
  const lines = events.map((e) => {
    const name = escMd(e.contestName);
    const rank = `\\#${e.finalRank}/${e.totalEntries}`;
    const tail = e.prizeCents > 0 ? `*\\+${escMd(fmtUsd(e.prizeCents))}*` : '_no prize_';
    return `• *${name}* — ${rank} · ${tail}`;
  });
  const header =
    totalCents > 0
      ? `🏁 *${events.length} contests* finished\n\n` +
        `*\\+${escMd(fmtUsd(totalCents))}* total to your balance`
      : `🏁 *${events.length} contests* finished`;
  // Aggregated DMs send the user to the live list rather than picking one
  // contest's URL arbitrarily; the result rows are reachable from there.
  const firstUrl = escMdUrl(events[0]!.resultUrl);
  return `${header}\n\n${lines.join('\n')}\n\n[Open app →](${firstUrl})`;
}

/**
 * "Contest was cancelled, here's your refund" DM. Same aggregation shape
 * as the finalized variant — single → personal copy, multiple → summary.
 * Always includes the refund total so the user trusts the balance change.
 */
export function formatContestCancelledDM(events: ContestCancelledEvent[]): string {
  if (events.length === 0) throw new Error('formatContestCancelledDM: empty events');

  if (events.length === 1) {
    const e = events[0]!;
    const contest = escMd(e.contestName);
    const url = escMdUrl(e.resultUrl);
    if (e.refundCents > 0) {
      const refund = escMd(fmtUsd(e.refundCents));
      return (
        `↩️ *${contest}* was cancelled\n\n` +
        `*\\+${refund}* refunded to your balance\n\n` +
        `[Open app →](${url})`
      );
    }
    return (
      `↩️ *${contest}* was cancelled\n\n` +
      `Free contest — nothing to refund\\. New contests are open already\\.\n\n` +
      `[Open app →](${url})`
    );
  }

  const totalCents = events.reduce((s, e) => s + e.refundCents, 0);
  const lines = events.map((e) => {
    const name = escMd(e.contestName);
    const tail = e.refundCents > 0 ? `*\\+${escMd(fmtUsd(e.refundCents))}*` : '_no refund_';
    return `• *${name}* — ${tail}`;
  });
  const header =
    totalCents > 0
      ? `↩️ *${events.length} contests* cancelled\n\n` +
        `*\\+${escMd(fmtUsd(totalCents))}* total refunded`
      : `↩️ *${events.length} contests* cancelled`;
  const firstUrl = escMdUrl(events[0]!.resultUrl);
  return `${header}\n\n${lines.join('\n')}\n\n[Open app →](${firstUrl})`;
}

/**
 * Format the signup-bonus unlock DM. RECRUITER copy names the friend;
 * REFEREE copy congratulates the new user. Aggregation merges when one
 * recipient unlocks multiple bonuses in the same window (rare but
 * possible — e.g. a recruiter whose two referees finalised at once).
 */
export function formatReferralUnlockDM(events: ReferralUnlockEvent[]): string {
  if (events.length === 0) throw new Error('formatReferralUnlockDM: empty events');

  if (events.length === 1) {
    const e = events[0]!;
    const amount = escMd(fmtUsd(e.amountCents));
    const url = escMdUrl(e.appUrl);
    if (e.bonusType === 'RECRUITER') {
      const friend = escMd(e.sourceFirstName ?? 'Your friend');
      return (
        `🎉 *${friend}* just played their first contest\n\n` +
        `*\\+${amount}* unlocked to your balance \\(referral signup bonus\\)\n\n` +
        `[Open app →](${url})`
      );
    }
    return (
      `🎉 *Welcome bonus unlocked* — first contest in the books\n\n` +
      `*\\+${amount}* added to your balance\n\n` +
      `[Open app →](${url})`
    );
  }

  const total = events.reduce((s, e) => s + e.amountCents, 0);
  const lines = events.map((e) => {
    const amt = escMd(fmtUsd(e.amountCents));
    if (e.bonusType === 'RECRUITER') {
      const friend = escMd(e.sourceFirstName ?? 'a friend');
      return `• *${friend}* played their first → *\\+${amt}*`;
    }
    return `• *Welcome bonus* → *\\+${amt}*`;
  });
  const url = escMdUrl(events[0]!.appUrl);
  return (
    `🎉 *${events.length} signup bonuses* unlocked\n\n` +
    `*\\+${escMd(fmtUsd(total))}* total to your balance\n\n` +
    `${lines.join('\n')}\n\n[Open app →](${url})`
  );
}
