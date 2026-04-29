import { useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '../../components/ui/Avatar.js';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { Label } from '../../components/ui/Label.js';
import { LoadingSplash } from '../loading/LoadingSplash.js';
import { formatCents } from '../../lib/format.js';
import { useReferralFriend } from './useReferrals.js';

/**
 * Drill-in screen for one referee — REFERRAL_SYSTEM.md §14 ("Per-friend
 * detailed history"). Reachable by tapping any friend in the Profile
 * referrals tree. Backend route enforces "must be in caller's chain"
 * (anti-snoop), so a hand-typed URL for a stranger 404s.
 */
export function ReferralFriend() {
  const navigate = useNavigate();
  const { friendId } = useParams<{ friendId: string }>();
  const q = useReferralFriend(friendId ?? null);

  if (!friendId) {
    navigate('/me', { replace: true });
    return null;
  }
  if (q.isLoading) return <LoadingSplash />;
  if (q.isError || !q.data) {
    return (
      <div className="flex min-h-screen flex-col bg-paper p-4 text-ink">
        <button
          onClick={() => navigate(-1)}
          className="mb-3 text-left font-mono text-[11px] uppercase tracking-[0.06em] text-accent"
        >
          ← back
        </button>
        <div className="text-[14px] text-hl-red">
          Couldn't load this friend — they may not be in your referral chain.
        </div>
      </div>
    );
  }

  const f = q.data;
  const joinedAgo = timeAgo(f.joinedAt);

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <div className="flex items-center justify-between border-b-[1.5px] border-ink px-3 py-2">
        <button
          onClick={() => navigate(-1)}
          className="text-left font-mono text-[11px] uppercase tracking-[0.06em] text-accent"
        >
          ← back
        </button>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
          referral · drill-in
        </span>
      </div>

      <div className="flex items-center gap-3 border-b border-dashed border-rule px-3 py-3">
        <Avatar name={f.firstName ?? '?'} url={f.photoUrl} size={56} />
        <div className="flex-1">
          <div className="text-[18px] font-extrabold leading-tight">
            {f.firstName ?? 'anonymous'}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
            joined {joinedAgo} · {f.contestsPlayed} contest
            {f.contestsPlayed === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div className="px-3 pt-3">
        <Card variant="dim" className="!px-[14px] !py-3">
          <Label>contributed to your balance</Label>
          <div className="mt-1 text-[28px] font-extrabold leading-none text-hl-green">
            +{formatCents(f.totalContributedCents)}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[11px]">
            <div className="rounded-[4px] border border-rule bg-code-bg px-[10px] py-[6px]">
              <Label>L1 · 5%</Label>
              <div className="mt-[2px] font-bold">{formatCents(f.l1ContributedCents)}</div>
            </div>
            <div className="rounded-[4px] border border-rule bg-code-bg px-[10px] py-[6px]">
              <Label>L2 · 1%</Label>
              <div className="mt-[2px] font-bold">{formatCents(f.l2ContributedCents)}</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="px-3 pb-4 pt-4">
        <Label>recent payouts</Label>
        {f.recentPayouts.length === 0 ? (
          <div className="mt-1 px-2 py-3 text-[11px] text-muted">
            They haven't won any prizes yet.
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-[6px]">
            {f.recentPayouts.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-[10px] rounded-[6px] border-[1.5px] border-ink bg-paper px-[10px] py-[8px]"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-ink bg-paper-dim font-mono text-[10px] font-bold">
                  L{p.level}
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-bold leading-tight">
                    {p.contestName ?? 'Contest'}
                  </div>
                  <div className="mt-[2px] font-mono text-[10px] uppercase tracking-[0.05em] text-muted">
                    {timeAgo(p.createdAt)} · prize {formatCents(p.sourcePrizeCents)}
                  </div>
                </div>
                <div className="font-mono text-[14px] font-extrabold text-hl-green">
                  +{formatCents(p.payoutCents)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1" />
      <div className="px-3 pb-4">
        <Button variant="ghost" size="md" onClick={() => navigate('/me')}>
          ← Back to profile
        </Button>
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'soon';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  return `${w}w ago`;
}
