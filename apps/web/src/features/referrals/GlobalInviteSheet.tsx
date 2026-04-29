import { useMe } from '../me/useMe.js';
import { telegram } from '../../lib/telegram.js';
import { InviteCardModal } from './InviteCardModal.js';
import { useInviteSheet } from './useInviteSheet.js';

/**
 * Single mounted instance of <InviteCardModal>, controlled by the global
 * useInviteSheet store. Any component anywhere can open it via
 * `useInviteSheet().show()` — saves passing modal state through five layers
 * of props down to InviteTeaser, ReferralsSection, leaderboard, etc.
 */
export function GlobalInviteSheet() {
  const me = useMe();
  const { open, hide } = useInviteSheet();
  const tgId = me.data?.user.id ?? telegram.user()?.id;
  if (!tgId) return null;
  const refName = me.data?.user.first_name ?? telegram.user()?.first_name ?? 'YOU';
  return <InviteCardModal open={open} onClose={hide} telegramId={tgId} refDisplayName={refName} />;
}
