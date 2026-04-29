import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProfileRecentContest, ProfileResponse } from '@fantasytoken/shared';
import { Card } from '../../components/ui/Card.js';
import { Label } from '../../components/ui/Label.js';
import { Button } from '../../components/ui/Button.js';
import { Avatar } from '../../components/ui/Avatar.js';
import { BottomNav } from '../lobby/BottomNav.js';
import { TopUpModal } from '../wallet/TopUpModal.js';
import { LoadingSplash } from '../loading/LoadingSplash.js';
import { formatCents } from '../../lib/format.js';
import { useProfile } from './useProfile.js';

export function Profile() {
  const navigate = useNavigate();
  const profile = useProfile();
  const [topUpOpen, setTopUpOpen] = useState(false);

  if (profile.isLoading) return <LoadingSplash caption="loading profile…" />;
  if (profile.isError || !profile.data) {
    return <div className="p-6 text-hl-red">error: {String(profile.error)}</div>;
  }

  const data = profile.data;
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b-[1.5px] border-ink px-3 py-2">
        <h1 className="text-[14px] font-bold">Profile</h1>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
          v1 · /me
        </span>
      </div>

      <ProfileHeader user={data.user} />

      <div className="px-3 pt-3">
        <BalanceCard balanceCents={data.balanceCents} onTopUp={() => setTopUpOpen(true)} />
      </div>

      <div className="px-3 pt-4">
        <Label>track record</Label>
        <TrackRecord stats={data.stats} />
      </div>

      <div className="px-3 pt-4 pb-4">
        <div className="mb-2 flex items-baseline justify-between">
          <Label>recent contests</Label>
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
            view all › soon
          </span>
        </div>
        {data.recentContests.length === 0 ? (
          <div className="px-2 py-3 text-[11px] text-muted">
            No finalized contests yet — pick one from <strong>Play</strong>.
          </div>
        ) : (
          <div className="flex flex-col gap-[6px]">
            {data.recentContests.map((c) => (
              <RecentContestRow
                key={c.contestId}
                row={c}
                onView={() => navigate(`/contests/${c.contestId}/result`)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex-1" />
      <BottomNav />
      <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />
    </div>
  );
}

function ProfileHeader({ user }: { user: ProfileResponse['user'] }) {
  return (
    <div className="flex items-center gap-3 border-b border-dashed border-rule px-3 py-3">
      <Avatar name={user.firstName} url={user.photoUrl} size={64} />
      <div className="flex flex-col gap-[2px]">
        <div className="text-[18px] font-extrabold leading-tight">{user.firstName}</div>
        {user.username && <div className="font-mono text-[11px] text-muted">@{user.username}</div>}
        <div className="mt-1 flex items-center gap-2">
          {/* Tier badge — placeholder until ranking system lands. */}
          <span
            className="rounded-[3px] border-[1.5px] border-ink px-[8px] py-[2px] font-mono text-[10px] font-bold tracking-[0.06em]"
            style={{ backgroundColor: '#facc15' }}
          >
            ★ BRONZE
          </span>
          <span className="font-mono text-[10px] text-muted">tier · soon</span>
        </div>
      </div>
    </div>
  );
}

function BalanceCard({ balanceCents, onTopUp }: { balanceCents: number; onTopUp: () => void }) {
  return (
    <Card variant="dim" className="flex items-end justify-between !px-[14px] !py-[14px]">
      <div>
        <Label>balance</Label>
        <div className="mt-1 font-mono text-[28px] font-extrabold leading-none">
          {formatCents(balanceCents)}
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onTopUp}>
        + Top up
      </Button>
    </Card>
  );
}

function TrackRecord({ stats }: { stats: ProfileResponse['stats'] }) {
  const winRateText = stats.winRate === null ? '—' : `${Math.round(stats.winRate * 100)}%`;
  const bestText = stats.bestPnlCents === null ? '—' : formatPnlCents(stats.bestPnlCents);
  const allPnlClass =
    stats.allTimePnlCents > 0 ? 'text-hl-green' : stats.allTimePnlCents < 0 ? 'text-hl-red' : '';
  const bestClass =
    stats.bestPnlCents !== null && stats.bestPnlCents > 0
      ? 'text-hl-green'
      : stats.bestPnlCents !== null && stats.bestPnlCents < 0
        ? 'text-hl-red'
        : '';
  return (
    <div className="mt-1 grid grid-cols-2 overflow-hidden rounded-[6px] border-[1.5px] border-ink">
      <Stat label="contests" value={String(stats.contestsPlayed)} />
      <Stat label="win rate" value={winRateText} borderLeft />
      <Stat label="best contest" value={bestText} valueClass={bestClass} borderTop />
      <Stat
        label="all-time P&L"
        value={formatPnlCents(stats.allTimePnlCents)}
        valueClass={allPnlClass}
        borderLeft
        borderTop
      />
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass = '',
  borderLeft = false,
  borderTop = false,
}: {
  label: string;
  value: string;
  valueClass?: string;
  borderLeft?: boolean;
  borderTop?: boolean;
}) {
  return (
    <div
      className={`px-[14px] py-3 ${borderLeft ? 'border-l-[1.5px] border-ink' : ''} ${borderTop ? 'border-t-[1.5px] border-ink' : ''}`}
    >
      <Label>{label}</Label>
      <div className={`mt-1 text-[26px] font-extrabold leading-none ${valueClass}`}>{value}</div>
    </div>
  );
}

function RecentContestRow({ row, onView }: { row: ProfileRecentContest; onView: () => void }) {
  const rank = row.finalRank;
  const top3 = rank !== null && rank <= 3;
  const pnlClass = row.netPnlCents >= 0 ? 'text-hl-green' : 'text-hl-red';
  return (
    <button
      onClick={onView}
      className="flex w-full items-center gap-[10px] rounded-[6px] border-[1.5px] border-ink bg-paper px-[10px] py-[8px] text-left"
    >
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-ink font-mono text-[11px] font-bold ${
          top3 ? 'text-paper' : ''
        }`}
        style={top3 ? { backgroundColor: '#d4441c' } : { backgroundColor: '#facc15' }}
      >
        {rank !== null ? `#${rank}` : '—'}
      </div>
      <div className="flex-1">
        <div className="text-[13px] font-bold leading-tight">{row.contestName}</div>
        <div className="mt-[2px] font-mono text-[10px] uppercase tracking-[0.05em] text-muted">
          {timeAgo(row.finishedAt)} · {row.contestType} · {row.totalEntries} players
        </div>
      </div>
      <div className={`font-mono text-[14px] font-extrabold ${pnlClass}`}>
        {formatPnlCents(row.netPnlCents)}
      </div>
    </button>
  );
}

function formatPnlCents(cents: number): string {
  if (cents === 0) return '$0.00';
  const sign = cents > 0 ? '+' : '-';
  return `${sign}${formatCents(Math.abs(cents))}`;
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
