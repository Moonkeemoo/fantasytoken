import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card.js';
import { Label } from '../../components/ui/Label.js';
import { Button } from '../../components/ui/Button.js';
import { Avatar } from '../../components/ui/Avatar.js';
import { LoadingSplash } from '../loading/LoadingSplash.js';
import { formatCents } from '../../lib/format.js';
import { telegram } from '../../lib/telegram.js';
import { buildInviteUrl } from '../../lib/referral.js';
import { useMe } from '../me/useMe.js';
import { useReferralsSummary, useReferralsTree } from './useReferrals.js';
import { useInviteSheet } from './useInviteSheet.js';
import { InviteQR } from './InviteQR.js';

/**
 * Full-screen drill-down behind the Profile › Your Network DETAILS button.
 * Shows the lifetime earnings hero, per-currency split (USD only in V1),
 * top contributors, and a tree of L1 / L2 friends — plus a sticky CTA
 * row with the share / copy / QR triplet so invites are always one tap
 * away.
 */
export function ReferralsDetail() {
  const navigate = useNavigate();
  const me = useMe();
  const summary = useReferralsSummary();
  const tree = useReferralsTree();
  const showInviteSheet = useInviteSheet((s) => s.show);
  const [showQr, setShowQr] = useState(false);

  if (me.isLoading || summary.isLoading || tree.isLoading) return <LoadingSplash />;
  if (summary.isError || !summary.data || !me.data) {
    return <div className="p-6 text-hl-red">unable to load referrals</div>;
  }

  const s = summary.data;
  const t = tree.data;
  const telegramId = me.data.user.id;
  const totalFriends = s.l1Count + s.l2Count;

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

  // Top contributors: drawn from L1+L2 by lifetime contributedCents.
  // The mock has "this month" but we don't track windows on the BE yet —
  // keep the lifetime ranking honest until the BE adds month buckets.
  // Show every friend who's actually played (contests > 0), not just
  // those who already paid commissions — a freshly-played first-contest
  // friend should appear immediately, before commissions accumulate.
  const allContributors = [
    ...(t?.l1 ?? []).map((n) => ({ ...n, level: 1 as const })),
    ...(t?.l2 ?? []).map((n) => ({ ...n, level: 2 as const })),
  ]
    .filter((n) => n.contestsPlayed > 0 || n.totalContributedCents > 0)
    .sort((a, b) => b.totalContributedCents - a.totalContributedCents)
    .slice(0, 5);

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b-[1.5px] border-ink bg-paper-dim px-3 py-2">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-[13px] font-bold"
        >
          ‹ Your network
        </button>
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
          /me/referrals
        </span>
      </header>

      <div className="flex flex-col gap-3 p-3">
        {/* Hero */}
        <Card variant="dim" className="!px-[14px] !py-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <Label>earned · all-time</Label>
              <div className="mt-1 text-[44px] font-extrabold leading-none text-accent">
                {formatCents(s.totalEarnedCents)}
              </div>
              <p className="mt-1 text-[12px] text-ink-soft">
                from <span className="font-bold text-ink">{totalFriends} friends</span>{' '}
                {totalFriends > 0 ? 'across 2 levels' : '— invite your first one below'}
              </p>
            </div>
            <span className="rounded-[6px] border-[1.5px] border-accent bg-accent px-[10px] py-[6px] font-mono text-[14px] font-extrabold text-paper">
              $
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <TierCard
              tier="L1 DIRECT · 5%"
              amountCents={s.l1EarnedCents}
              subline={`${s.l1ActiveCount} active`}
            />
            <TierCard
              tier="L2 INDIRECT · 1%"
              amountCents={s.l2EarnedCents}
              subline={`${s.l2ActiveCount} active`}
            />
          </div>
        </Card>

        {/* By currency — V1 has USD only; we list it explicitly so the
            section's purpose is clear and STARS/TON can drop in later. */}
        <SectionHeader>by currency</SectionHeader>
        <Card variant="dim" className="!px-[14px] !py-3">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[12px] font-extrabold uppercase tracking-[0.06em] text-hl-green">
                USD
              </span>
              <span className="text-[18px] font-extrabold">
                {formatCents(s.byCurrency.USD.l1Cents + s.byCurrency.USD.l2Cents)}
              </span>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
              5% / 1%
            </span>
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
            STARS ⭐ &nbsp;TON ◆ &nbsp;coming soon
          </div>
        </Card>

        {/* Top contributors */}
        {allContributors.length > 0 && (
          <>
            <SectionHeader>top contributors</SectionHeader>
            <Card variant="dim" className="flex flex-col gap-[6px] !px-[10px] !py-2">
              {allContributors.map((n, i) => (
                <button
                  key={n.userId}
                  onClick={() => navigate(`/me/referrals/${n.userId}`)}
                  className={`flex items-center gap-[8px] rounded-[4px] bg-paper px-[8px] py-[8px] text-left transition active:scale-[0.99] ${
                    i < allContributors.length - 1 ? 'border-b border-dashed border-ink/20' : ''
                  }`}
                >
                  <Avatar name={n.firstName ?? '?'} url={n.photoUrl} size={32} />
                  <div className="flex-1">
                    <div className="text-[13px] font-extrabold leading-tight">
                      {n.firstName ?? 'anonymous'}
                    </div>
                    <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                      L{n.level} · {n.contestsPlayed} contest{n.contestsPlayed === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="font-mono text-[14px] font-extrabold text-hl-green">
                    +{formatCents(n.totalContributedCents)}
                  </div>
                </button>
              ))}
            </Card>
          </>
        )}

        {/* Tree */}
        <SectionHeader>tree · {totalFriends} friends</SectionHeader>
        <Card variant="dim" className="flex flex-col gap-2 !px-[14px] !py-3">
          <TreeRow
            label="L1"
            nodes={t?.l1 ?? []}
            expectedCount={s.l1Count}
            activeCount={s.l1ActiveCount}
            emptyHint="no direct invites yet"
          />
          <TreeRow
            label="L2"
            nodes={t?.l2 ?? []}
            expectedCount={s.l2Count}
            activeCount={s.l2ActiveCount}
            emptyHint="L2 fills as your friends invite theirs"
          />
        </Card>

        {/* CTAs */}
        <Button variant="primary" className="w-full" onClick={onInvite}>
          📨 SEND INVITE LINK
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={onCopy}>
            COPY LINK
          </Button>
          <Button variant="ghost" onClick={() => setShowQr((v) => !v)}>
            {showQr ? 'HIDE QR' : 'SHOW QR'}
          </Button>
        </div>
        {showQr && <InviteQR telegramId={telegramId} />}
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Label>{children}</Label>
      <div className="h-[1px] flex-1 bg-ink/20" />
    </div>
  );
}

function TierCard({
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
      <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted">{tier}</div>
      <div className="mt-[2px] text-[18px] font-extrabold leading-tight">
        {formatCents(amountCents)}
      </div>
      <div className="mt-[2px] font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
        {subline}
      </div>
    </div>
  );
}

function TreeRow({
  label,
  nodes,
  expectedCount,
  activeCount,
  emptyHint,
}: {
  label: string;
  nodes: Array<{
    userId: string;
    firstName: string | null;
    photoUrl: string | null;
    hasPlayed: boolean;
  }>;
  /** Authoritative count from the summary — used to anchor the row in
   * case `nodes` (from the tree query) is still loading or returned
   * fewer items than expected. We pad with placeholder bubbles. */
  expectedCount: number;
  activeCount: number;
  emptyHint: string;
}) {
  const PREVIEW = 7;
  const total = Math.max(nodes.length, expectedCount);
  const previewCount = Math.min(PREVIEW, total);
  const overflow = total - previewCount;
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] font-extrabold uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      {total === 0 ? (
        <span className="text-[11px] text-ink-soft">{emptyHint}</span>
      ) : (
        <>
          <div className="flex items-center -space-x-[4px]">
            {Array.from({ length: previewCount }).map((_, i) => {
              const n = nodes[i];
              return (
                <div
                  key={n?.userId ?? `${label}-placeholder-${i}`}
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
          </div>
          <span className="ml-auto font-mono text-[10px] font-extrabold uppercase tracking-[0.06em] text-hl-green">
            {activeCount} active
          </span>
        </>
      )}
    </div>
  );
}
