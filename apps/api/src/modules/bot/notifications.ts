import type { ReferralCurrency } from '@fantasytoken/shared';

/** One commission event aggregated into a DM. */
export interface CommissionEvent {
  sourceFirstName: string | null;
  sourcePrizeCents: number;
  payoutCents: number;
  level: 1 | 2;
  contestName: string | null;
  currency: ReferralCurrency;
  /** Deep-link the inline button on the DM should open — usually the
   * referrals view inside the mini-app. */
  appUrl: string;
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

/**
 * Inline-keyboard button shape. `url:` works for any HTTPS URL (incl.
 * t.me deep-links — TG clients resolve them client-side). `web_app:`
 * gives a smoother in-WebView open but only accepts the raw frontend
 * HTTPS URL — Telegram silently drops t.me aliases.
 */
export type DmButton = { text: string; url: string } | { text: string; web_app: { url: string } };

/** Reply-markup payload returned alongside the DM body. The drain feeds
 * this straight to bot.api.sendMessage as `reply_markup`. */
export interface DmReplyMarkup {
  inline_keyboard: DmButton[][];
}

/** Combined wire payload returned by every format function. */
export interface DmMessage {
  text: string;
  replyMarkup: DmReplyMarkup;
}

/** Pick the right inline-button shape for the URL. Mirrors the helper
 * in apps/api/src/modules/bot/bot.ts so /start, /play, and DM CTAs all
 * render with the same affordance. */
function openAppButton(label: string, url: string): DmButton {
  if (/^https:\/\/t\.me\//i.test(url)) {
    return { text: label, url };
  }
  return { text: label, web_app: { url } };
}

function buttonRow(label: string, url: string): DmReplyMarkup {
  return { inline_keyboard: [[openAppButton(label, url)]] };
}

/** MarkdownV2 reserved chars per https://core.telegram.org/bots/api#markdownv2-style. */
function escMd(s: string): string {
  return s.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);
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
 * Format the commission DM. Single event → personal message with friend's
 * name + contest. Multiple events → grouped one-liner per spec §11.2 ("3
 * friends won contests · +$X total to your balance"). The "Open app →"
 * button drops the user on the referrals tab so they see the new payout.
 */
export function formatCommissionDM(events: CommissionEvent[]): DmMessage {
  if (events.length === 0) throw new Error('formatCommissionDM: empty events');

  const totalByCurrency = new Map<ReferralCurrency, number>();
  for (const e of events) {
    totalByCurrency.set(e.currency, (totalByCurrency.get(e.currency) ?? 0) + e.payoutCents);
  }

  const replyMarkup = buttonRow('🎯 Open app', events[0]!.appUrl);

  if (events.length === 1) {
    const e = events[0]!;
    const friend = escMd(e.sourceFirstName ?? 'Your friend');
    const contest = e.contestName ? ` in *${escMd(e.contestName)}*` : '';
    const prize = escMd(fmtMoney(e.sourcePrizeCents, e.currency));
    const payout = escMd(fmtMoney(e.payoutCents, e.currency));
    const pct = e.level === 1 ? '5%' : '1%';
    const text =
      `🎉 *${friend}* just won ${prize}${contest}\n` +
      `L${e.level} commission: ${pct} of their prize\n\n` +
      `*\\+${payout}* to your balance`;
    return { text, replyMarkup };
  }

  // Aggregated message — keep it scannable.
  const totalParts = [...totalByCurrency.entries()]
    .map(([c, n]) => escMd(fmtMoney(n, c)))
    .join(' \\+ ');
  const friends = events.length === 2 ? '2 friends' : `${events.length} friends`;
  const text = `🎉 *${friends}* just won contests\n\n` + `*\\+${totalParts}* total to your balance`;
  return { text, replyMarkup };
}

/**
 * Format a "your contest finished" DM. Single event → personal message
 * with the contest name + rank + prize line + a button to /result.
 * Multiple events → grouped summary with one-liners per contest and a
 * single button into the app.
 *
 * USD-only for V1 (matches the cash economy).
 */
export function formatContestFinalizedDM(events: ContestFinalizedEvent[]): DmMessage {
  if (events.length === 0) throw new Error('formatContestFinalizedDM: empty events');

  if (events.length === 1) {
    const e = events[0]!;
    const contest = escMd(e.contestName);
    const rank = `\\#${e.finalRank} of ${e.totalEntries}`;
    const replyMarkup = buttonRow('🏁 View result', e.resultUrl);
    if (e.prizeCents > 0) {
      const prize = escMd(fmtUsd(e.prizeCents));
      return {
        text:
          `🏁 *${contest}* finished — you placed ${rank}\n\n` +
          `*\\+${prize}* credited to your balance`,
        replyMarkup,
      };
    }
    return {
      text:
        `🏁 *${contest}* finished — you placed ${rank}\n\n` +
        `No prize this round\\. New contests are open already\\.`,
      replyMarkup,
    };
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
  return {
    text: `${header}\n\n${lines.join('\n')}`,
    replyMarkup: buttonRow('🎯 Open app', events[0]!.resultUrl),
  };
}

/**
 * "Contest was cancelled, here's your refund" DM. Same aggregation shape
 * as the finalized variant — single → personal copy, multiple → summary.
 * Always includes the refund total so the user trusts the balance change.
 */
export function formatContestCancelledDM(events: ContestCancelledEvent[]): DmMessage {
  if (events.length === 0) throw new Error('formatContestCancelledDM: empty events');

  if (events.length === 1) {
    const e = events[0]!;
    const contest = escMd(e.contestName);
    const replyMarkup = buttonRow('🎯 Open app', e.resultUrl);
    if (e.refundCents > 0) {
      const refund = escMd(fmtUsd(e.refundCents));
      return {
        text: `↩️ *${contest}* was cancelled\n\n` + `*\\+${refund}* refunded to your balance`,
        replyMarkup,
      };
    }
    return {
      text:
        `↩️ *${contest}* was cancelled\n\n` +
        `Free contest — nothing to refund\\. New contests are open already\\.`,
      replyMarkup,
    };
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
  return {
    text: `${header}\n\n${lines.join('\n')}`,
    replyMarkup: buttonRow('🎯 Open app', events[0]!.resultUrl),
  };
}

/**
 * Format the signup-bonus unlock DM. RECRUITER copy names the friend;
 * REFEREE copy congratulates the new user. Aggregation merges when one
 * recipient unlocks multiple bonuses in the same window (rare but
 * possible — e.g. a recruiter whose two referees finalised at once).
 */
export function formatReferralUnlockDM(events: ReferralUnlockEvent[]): DmMessage {
  if (events.length === 0) throw new Error('formatReferralUnlockDM: empty events');

  const replyMarkup = buttonRow('🎯 Open app', events[0]!.appUrl);

  if (events.length === 1) {
    const e = events[0]!;
    const amount = escMd(fmtUsd(e.amountCents));
    if (e.bonusType === 'RECRUITER') {
      const friend = escMd(e.sourceFirstName ?? 'Your friend');
      return {
        text:
          `🎉 *${friend}* just played their first contest\n\n` +
          `*\\+${amount}* unlocked to your balance \\(referral signup bonus\\)`,
        replyMarkup,
      };
    }
    return {
      text:
        `🎉 *Welcome bonus unlocked* — first contest in the books\n\n` +
        `*\\+${amount}* added to your balance`,
      replyMarkup,
    };
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
  return {
    text:
      `🎉 *${events.length} signup bonuses* unlocked\n\n` +
      `*\\+${escMd(fmtUsd(total))}* total to your balance\n\n` +
      `${lines.join('\n')}`,
    replyMarkup,
  };
}
