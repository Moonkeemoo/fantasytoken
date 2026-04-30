import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card.js';
import { Label } from '../../components/ui/Label.js';
import { Button } from '../../components/ui/Button.js';
import { Avatar } from '../../components/ui/Avatar.js';
import { formatCents } from '../../lib/format.js';
import { telegram } from '../../lib/telegram.js';
import { useReferralsSummary, useReferralsTree } from './useReferrals.js';
import { useInviteSheet } from './useInviteSheet.js';

/**
 * Compact referrals card on the Profile screen.
 *
 * Two states:
 *  - Empty (l1Count === 0): yellow note with the "+\$50 + 5%" pitch.
 *  - Populated: "YOUR NETWORK · +\$X lifetime" header, L1/L2 cards,
 *    avatar cluster of L1 referees, and a DETAILS link to the
 *    full-screen breakdown at /me/referrals.
 *
 * Shaped to match the brand-mockup layout — earnings are scannable in
 * 1 second, the heavy stats live behind the DETAILS tap.
 */
export function ReferralsSection({ telegramId }: { telegramId: number }) {
  const summary = useReferralsSummary();
  const tree = useReferralsTree();
  const showInviteSheet = useInviteSheet((st) => st.show);

  if (summary.isLoading) {
    return (
      <Card variant="dim" className="!px-[14px] !py-3">
        <Label>your network</Label>
        <div className="mt-1 font-mono text-[11px] text-muted">loading…</div>
      </Card>
    );
  }
  if (summary.isError || !summary.data) {
    return null;
  }

  const s = summary.data;
  const onInvite = () => {
    telegram.hapticImpact('light');
    showInviteSheet();
  };

  if (s.l1Count === 0) {
    return <EmptyState onInvite={onInvite} />;
  }

  return <Populated summary={s} tree={tree.data} telegramId={telegramId} />;
}

function EmptyState({ onInvite }: { onInvite: () => void }) {
  return (
    <div className="rounded-[6px] border-[1.5px] border-ink bg-note px-[14px] py-3">
      <Label>your network</Label>
      <div className="mt-1 text-[15px] font-extrabold leading-tight">
        Invite 1 friend → +🪙 50 and 5% from their wins forever
      </div>
      <p className="mt-1 text-[11px] text-muted">
        When they join via your link and play 1 contest, you both get +🪙 25.
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
  telegramId: _telegramId,
}: {
  summary: NonNullable<ReturnType<typeof useReferralsSummary>['data']>;
  tree: ReturnType<typeof useReferralsTree>['data'];
  telegramId: number;
}) {
  const navigate = useNavigate();

  // Up to 5 avatar chips + "+N" overflow. Sort: active first, then most-
  // recent. Anchor the count to summary.l1Count (authoritative) and pad
  // with anonymous placeholders when tree hasn't resolved or returns
  // fewer rows — better than telling the user "no friends yet" when the
  // stat box right above proudly says "1 invited".
  const realL1 = (tree?.l1 ?? []).slice().sort((a, b) => {
    if (a.hasPlayed !== b.hasPlayed) return a.hasPlayed ? -1 : 1;
    return new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime();
  });
  const totalL1 = Math.max(realL1.length, summary.l1Count);
  const previewCount = Math.min(5, totalL1);
  const overflow = totalL1 - previewCount;

  return (
    <Card variant="dim" className="!px-[14px] !py-3">
      <div className="flex items-baseline justify-between gap-2">
        <Label>your network</Label>
        <span className="font-mono text-[11px] font-extrabold uppercase tracking-[0.06em] text-accent">
          +{formatCents(summary.totalEarnedCents)} lifetime
        </span>
      </div>

      {/* Two stat cards side-by-side. L1 carries an extra "invited" subline
          since invited-but-inactive matters for the recruiter's funnel. */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <StatBox
          tier="L1 · 5%"
          amountCents={summary.l1EarnedCents}
          subline={`${summary.l1ActiveCount} active · ${summary.l1Count} invited`}
        />
        <StatBox
          tier="L2 · 1%"
          amountCents={summary.l2EarnedCents}
          subline={`${summary.l2ActiveCount} active`}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-dashed border-ink/30 pt-[10px]">
        <div className="flex items-center -space-x-[6px]">
          {Array.from({ length: previewCount }).map((_, i) => {
            const n = realL1[i];
            return (
              <div
                key={n?.userId ?? `placeholder-${i}`}
                className="rounded-full ring-2 ring-paper-dim"
              >
                <Avatar name={n?.firstName ?? '?'} url={n?.photoUrl ?? null} size={22} />
              </div>
            );
          })}
          {overflow > 0 && (
            <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] border-ink bg-paper font-mono text-[9px] font-bold ring-2 ring-paper-dim">
              +{overflow}
            </div>
          )}
          {totalL1 === 0 && (
            <span className="font-mono text-[10px] text-muted">no friends yet</span>
          )}
        </div>
        <Button variant="primary" size="sm" onClick={() => navigate('/me/referrals')}>
          DETAILS ›
        </Button>
      </div>
    </Card>
  );
}

function StatBox({
  tier,
  amountCents,
  subline,
}: {
  tier: string;
  amountCents: number;
  subline: string;
}) {
  return (
    <div className="rounded-[4px] border border-rule bg-paper px-[10px] py-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">{tier}</div>
      <div className="mt-[2px] text-[20px] font-extrabold leading-tight">
        {formatCents(amountCents)}
      </div>
      <div className="mt-[2px] font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
        {subline}
      </div>
    </div>
  );
}
