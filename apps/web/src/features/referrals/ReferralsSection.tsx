import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card.js';
import { Label } from '../../components/ui/Label.js';
import { Button } from '../../components/ui/Button.js';
import { Avatar } from '../../components/ui/Avatar.js';
import { formatCents } from '../../lib/format.js';
import { telegram } from '../../lib/telegram.js';
import { buildInviteUrl } from '../../lib/referral.js';
import { useReferralsSummary, useReferralsTree } from './useReferrals.js';
import { InviteQR } from './InviteQR.js';
import { useInviteSheet } from './useInviteSheet.js';

/**
 * Profile referrals block — REFERRAL_SYSTEM.md §6.1.
 *
 * Two states:
 *  - Empty (l1Count === 0): big yellow note CTA explaining the offer.
 *  - Populated: headline + L1/L2 earnings breakdown + top earners list + 3 CTAs.
 *
 * Both states show the same primary "📨 Invite friends" CTA so the muscle
 * memory carries over once the user starts inviting.
 */
export function ReferralsSection({ telegramId }: { telegramId: number }) {
  const summary = useReferralsSummary();
  const tree = useReferralsTree();

  if (summary.isLoading) {
    return (
      <Card variant="dim" className="!px-[14px] !py-3">
        <Label>referrals</Label>
        <div className="mt-1 font-mono text-[11px] text-muted">loading…</div>
      </Card>
    );
  }
  if (summary.isError || !summary.data) {
    return null; // Don't break the page; user retries on next visit.
  }

  const s = summary.data;
  const showInviteSheet = useInviteSheet((st) => st.show);
  const onInvite = () => {
    telegram.hapticImpact('light');
    showInviteSheet();
  };
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildInviteUrl(telegramId));
      telegram.hapticNotification('success');
    } catch {
      telegram.hapticNotification('error');
    }
  };

  if (s.l1Count === 0) {
    return <EmptyState onInvite={onInvite} />;
  }
  return (
    <Populated
      summary={s}
      tree={tree.data}
      telegramId={telegramId}
      onInvite={onInvite}
      onCopy={onCopy}
    />
  );
}

function EmptyState({ onInvite }: { onInvite: () => void }) {
  return (
    <div className="rounded-[6px] border-[1.5px] border-ink bg-note px-[14px] py-3">
      <Label>referrals</Label>
      <div className="mt-1 text-[15px] font-extrabold leading-tight">
        Invite 1 friend → +$50 and 5% from their wins forever
      </div>
      <p className="mt-1 text-[11px] text-muted">
        When they join via your link and play 1 contest, you both get +$25.
      </p>
      <div className="mt-3">
        <Button variant="primary" size="md" onClick={onInvite}>
          📨 Send invite link
        </Button>
      </div>
    </div>
  );
}

function Populated({
  summary,
  tree,
  telegramId,
  onInvite,
  onCopy,
}: {
  summary: ReturnType<typeof useReferralsSummary>['data'] & object;
  tree: ReturnType<typeof useReferralsTree>['data'];
  telegramId: number;
  onInvite: () => void;
  onCopy: () => void;
}) {
  const [showQr, setShowQr] = useState(false);
  const navigate = useNavigate();
  // Top earners: highest contributedCents from L1, capped to 5 for breathing room.
  const topEarners = (tree?.l1 ?? [])
    .filter((n) => n.totalContributedCents > 0)
    .sort((a, b) => b.totalContributedCents - a.totalContributedCents)
    .slice(0, 5);

  return (
    <Card variant="dim" className="flex flex-col gap-3 !px-[14px] !py-3">
      <div>
        <Label>referrals</Label>
        <div className="mt-1 text-[15px] font-extrabold leading-tight">
          {summary.l1Count} invited · {formatCents(summary.totalEarnedCents)} earned
        </div>
      </div>

      {/* L1/L2 earnings breakdown box — paper-inset code-bg per spec §6.1 */}
      <div className="rounded-[4px] border border-rule bg-code-bg px-[10px] py-2 font-mono text-[11px] leading-relaxed">
        <div className="flex justify-between">
          <span className="text-muted">L1 · 5%</span>
          <span className="font-bold">
            {formatCents(summary.l1EarnedCents)}{' '}
            <span className="text-muted">({summary.l1ActiveCount} active)</span>
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">L2 · 1%</span>
          <span className="font-bold">
            {formatCents(summary.l2EarnedCents)}{' '}
            <span className="text-muted">({summary.l2ActiveCount} active)</span>
          </span>
        </div>
      </div>

      {topEarners.length > 0 && (
        <div className="flex flex-col gap-[4px]">
          <Label>top earners</Label>
          {topEarners.map((n) => (
            <button
              key={n.userId}
              onClick={() => navigate(`/me/referrals/${n.userId}`)}
              className="flex items-center gap-[8px] rounded-[4px] border border-rule bg-paper px-[8px] py-[6px] text-left transition active:scale-[0.99]"
            >
              <Avatar name={n.firstName ?? '?'} url={n.photoUrl} size={28} />
              <div className="flex-1 text-[12px] font-bold leading-tight">
                {n.firstName ?? 'anonymous'}
              </div>
              <div className="font-mono text-[11px] font-bold text-hl-green">
                +{formatCents(n.totalContributedCents)}
              </div>
              <span className="font-mono text-[12px] text-muted">›</span>
            </button>
          ))}
        </div>
      )}

      {/* CTAs — primary share, secondary copy + QR toggle. */}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={onInvite}>
          📨 Invite friends · earn 5%
        </Button>
        <Button variant="ghost" size="sm" onClick={onCopy}>
          Copy link
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowQr((v) => !v)}>
          {showQr ? 'Hide QR' : 'Show QR'}
        </Button>
      </div>

      {showQr && <InviteQR telegramId={telegramId} />}
    </Card>
  );
}
