import { Button } from '../../components/ui/Button.js';
import { telegram } from '../../lib/telegram.js';
import { openInviteShareSheet } from '../../lib/referral.js';
import { useReferralsSummary } from './useReferrals.js';

/**
 * Lobby invite teaser — REFERRAL_SYSTEM.md §6.2.
 *
 * Yellow paper-note banner, sits above the contest tabs. Shown ONLY when the
 * caller has zero active referrees so a returning user with friends doesn't
 * keep nagging. Disappears the moment l1ActiveCount > 0.
 *
 * Word "forever" is the emotional anchor per spec — kept bold.
 */
export function InviteTeaser({ telegramId }: { telegramId: number }) {
  const summary = useReferralsSummary();
  // While loading, render nothing (no flicker, no jumpy banner).
  if (!summary.data || summary.data.l1ActiveCount > 0) return null;

  const onInvite = () => {
    telegram.hapticImpact('light');
    openInviteShareSheet(telegramId);
  };

  return (
    <div className="mx-3 mt-2 flex items-center gap-3 rounded-[6px] border-[1.5px] border-ink bg-note px-[14px] py-[10px]">
      <div className="flex-1">
        <div className="text-[13px] font-extrabold leading-tight">
          Invite 1 friend → +$50 and 5% from their wins{' '}
          <span className="underline decoration-2">forever</span>
        </div>
        <div className="mt-[2px] text-[11px] text-muted">
          When they join via your link and play 1 contest, you both get +$25.
        </div>
      </div>
      <Button variant="primary" size="sm" onClick={onInvite}>
        📨 Invite
      </Button>
    </div>
  );
}
