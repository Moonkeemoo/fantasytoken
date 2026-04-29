import { telegram } from './telegram.js';

// Bot/app handles are also used by Rankings.tsx — keep the source of truth here
// and import from there once a third caller appears (current convention).
const BOT_HANDLE = 'fantasytokenbot';
const APP_SHORT = 'fantasytoken';

/** Build the canonical t.me ref-link for a given Telegram user id. */
export function buildInviteUrl(telegramId: number): string {
  return `https://t.me/${BOT_HANDLE}/${APP_SHORT}?startapp=ref_${telegramId}`;
}

/** Open the native TG share sheet pre-filled with the user's invite link.
 * The text leans on the strongest viral hook from REFERRAL_SYSTEM.md §6.2:
 * "Invite 1 friend → +$50 and 5% from their wins forever". */
export function openInviteShareSheet(telegramId: number): void {
  const url = buildInviteUrl(telegramId);
  const text =
    '🎯 Join Fantasy Token — pick a 5-coin lineup, beat the room. ' +
    'Use my link to claim a $25 bonus.';
  telegram.shareToChat(url, text);
}
