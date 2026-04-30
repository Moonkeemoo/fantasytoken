import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FriendsRankingResponse,
  GlobalRankingResponse,
  ReferralsLeaderboardResponse,
} from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';
import { telegram } from '../../lib/telegram.js';
import { useMe } from '../me/useMe.js';
import { Header } from '../lobby/Header.js';
import { Pill } from '../../components/ui/Pill.js';
import { Card } from '../../components/ui/Card.js';
import { Button } from '../../components/ui/Button.js';
import { Label } from '../../components/ui/Label.js';
import { Avatar } from '../../components/ui/Avatar.js';
import { TierIcon } from '../rank/TierIcon.js';
import { TopUpModal } from '../wallet/TopUpModal.js';
import { LoadingSplash } from '../loading/LoadingSplash.js';
import { formatCents } from '../../lib/format.js';

const BOT_HANDLE = 'fantasytokenbot';
const APP_SHORT = 'fantasytoken';

type Tab = 'friends' | 'global' | 'recruiters';
type RecruitersScope = 'global' | 'friends';

export function Rankings() {
  const me = useMe();
  const [tab, setTab] = useState<Tab>('friends');
  const [topUpOpen, setTopUpOpen] = useState(false);

  const [recruitersScope, setRecruitersScope] = useState<RecruitersScope>('global');
  const friends = useQuery({
    queryKey: ['rankings', 'friends'],
    queryFn: () => apiFetch('/rankings/friends', FriendsRankingResponse),
    enabled: tab === 'friends',
    staleTime: 30_000,
  });
  const global = useQuery({
    queryKey: ['rankings', 'global'],
    queryFn: () => apiFetch('/rankings/global', GlobalRankingResponse),
    enabled: tab === 'global',
    staleTime: 30_000,
  });
  const recruiters = useQuery({
    queryKey: ['rankings', 'recruiters', recruitersScope],
    queryFn: () =>
      apiFetch(`/me/referrals/leaderboard?scope=${recruitersScope}`, ReferralsLeaderboardResponse),
    enabled: tab === 'recruiters',
    staleTime: 30_000,
  });

  if (me.isLoading) return <LoadingSplash />;
  if (me.isError || !me.data)
    return <div className="p-6 text-hl-red">error: {String(me.error)}</div>;

  const myTgId = me.data.user.id;
  const inviteUrl = `https://t.me/${BOT_HANDLE}/${APP_SHORT}?startapp=ref_${myTgId}`;

  const handleInvite = () => {
    telegram.shareToChat(inviteUrl, 'Join me on Fantasy Token — pick crypto, win cash. ↗');
    telegram.hapticImpact('medium');
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper pb-14 text-ink">
      <Header
        firstName={me.data.user.first_name}
        photoUrl={me.data.user.photo_url}
        balanceCents={me.data.balanceCents}
        onTopUp={() => setTopUpOpen(true)}
      />
      <div className="flex gap-2 overflow-x-auto px-3 py-2">
        <Pill active={tab === 'friends'} onClick={() => setTab('friends')}>
          Friends
        </Pill>
        <Pill active={tab === 'global'} onClick={() => setTab('global')}>
          Global · top 100
        </Pill>
        <Pill active={tab === 'recruiters'} onClick={() => setTab('recruiters')}>
          Recruiters
        </Pill>
      </div>

      {tab === 'friends' && (
        <FriendsView
          data={friends.data}
          isLoading={friends.isLoading}
          isError={friends.isError}
          onInvite={handleInvite}
        />
      )}
      {tab === 'global' && (
        <GlobalView data={global.data} isLoading={global.isLoading} isError={global.isError} />
      )}
      {tab === 'recruiters' && (
        <RecruitersView
          data={recruiters.data}
          isLoading={recruiters.isLoading}
          isError={recruiters.isError}
          scope={recruitersScope}
          onScope={setRecruitersScope}
          onInvite={handleInvite}
        />
      )}

      <div className="flex-1" />
      <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />
    </div>
  );
}

function FriendsView({
  data,
  isLoading,
  isError,
  onInvite,
}: {
  data: FriendsRankingResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onInvite: () => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="px-3 py-2">
        <Label>friends · all-time P&amp;L</Label>
      </div>
      {isLoading && <div className="px-4 py-3 text-[11px] text-muted">loading…</div>}
      {isError && <div className="px-4 py-3 text-[11px] text-hl-red">error loading rankings</div>}
      {data && (
        <div className="flex flex-col gap-[4px] px-3">
          {data.rows.map((r) => (
            <Card
              key={r.userId}
              className={`flex items-center justify-between !px-[10px] !py-[7px] ${r.isMe ? 'bg-note' : ''}`}
            >
              <span className="flex items-center gap-[8px] text-[12px]">
                <strong className="font-mono text-[10px]">#{r.rank}</strong>
                <Avatar name={r.displayName} url={r.avatarUrl} size={26} />
                <span className="flex flex-col leading-tight">
                  <span className={r.tierRank >= 16 ? 'font-bold text-[#c9a227]' : ''}>
                    {r.displayName}
                    {r.isMe && <span className="ml-1 text-[10px] text-muted">(you)</span>}
                  </span>
                  <span className="flex items-center gap-[6px] text-[9px] text-muted">
                    <TierIcon rank={r.tierRank} size={14} showNumber={false} />
                    <span>
                      Rank {r.tierRank} · {r.contestsPlayed} contests
                    </span>
                  </span>
                </span>
              </span>
              <span
                className={`font-bold ${r.netPnlCents > 0 ? 'text-hl-green' : r.netPnlCents < 0 ? 'text-hl-red' : ''}`}
              >
                {formatPnlCents(r.netPnlCents)}
              </span>
            </Card>
          ))}
        </div>
      )}

      <InviteCard onInvite={onInvite} />
    </div>
  );
}

function GlobalView({
  data,
  isLoading,
  isError,
}: {
  data: GlobalRankingResponse | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <div className="flex flex-col">
      <div className="px-3 py-2">
        <Label>top 100 · all-time P&amp;L</Label>
      </div>
      {isLoading && <div className="px-4 py-3 text-[11px] text-muted">loading…</div>}
      {isError && <div className="px-4 py-3 text-[11px] text-hl-red">error loading rankings</div>}
      {data && data.top.length === 0 && (
        <div className="px-4 py-3 text-[11px] text-muted">No finalized contests yet.</div>
      )}
      {data && data.top.length > 0 && (
        <div className="flex flex-col gap-[3px] px-3">
          {data.top.map((r) => (
            <Card
              key={r.userId}
              className={`flex items-center justify-between !px-[10px] !py-[6px] ${r.isMe ? 'bg-note' : ''}`}
            >
              <span className="flex items-center gap-[8px] text-[12px]">
                <strong className="font-mono text-[10px]">#{r.rank}</strong>
                <Avatar name={r.displayName} url={r.avatarUrl} size={22} />
                <TierIcon rank={r.tierRank} size={16} showNumber={false} />
                <span className={r.tierRank >= 16 ? 'font-bold text-[#c9a227]' : ''}>
                  {r.displayName}
                  {r.isMe && <span className="ml-1 text-[10px] text-muted">(you)</span>}
                </span>
              </span>
              <span
                className={`font-bold ${r.netPnlCents > 0 ? 'text-hl-green' : r.netPnlCents < 0 ? 'text-hl-red' : ''}`}
              >
                {formatPnlCents(r.netPnlCents)}
              </span>
            </Card>
          ))}
        </div>
      )}
      {data?.me && (
        <div className="mt-2 px-3">
          <div className="text-[9px] uppercase tracking-[0.08em] text-muted">your position</div>
          <Card className="mt-1 flex items-center justify-between !px-[10px] !py-[7px] bg-note ring-2 ring-accent/40">
            <span className="flex items-center gap-[8px] text-[12px]">
              <strong className="font-mono text-[10px]">#{data.me.rank}</strong>
              <Avatar name={data.me.displayName} url={data.me.avatarUrl} size={22} />
              <TierIcon rank={data.me.tierRank} size={16} showNumber={false} />
              <span className={data.me.tierRank >= 16 ? 'font-bold text-[#c9a227]' : ''}>
                {data.me.displayName} <span className="text-[10px] text-muted">(you)</span>
              </span>
            </span>
            <span
              className={`font-bold ${data.me.netPnlCents > 0 ? 'text-hl-green' : data.me.netPnlCents < 0 ? 'text-hl-red' : ''}`}
            >
              {formatPnlCents(data.me.netPnlCents)}
            </span>
          </Card>
        </div>
      )}
    </div>
  );
}

function InviteCard({ onInvite }: { onInvite: () => void }) {
  return (
    <Card
      shadow
      variant="dim"
      className="m-3 mt-4 flex items-center justify-between gap-3 !px-[14px] !py-3"
    >
      <div className="flex-1">
        <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-accent">
          invite friends
        </div>
        <div className="mt-[3px] text-[11px] leading-snug">
          Share your link — anyone who opens it joins your friends leaderboard.
        </div>
      </div>
      <Button size="sm" variant="primary" onClick={onInvite}>
        ▷ Share
      </Button>
    </Card>
  );
}

function formatPnlCents(cents: number): string {
  if (cents === 0) return '$0.00';
  const sign = cents > 0 ? '+' : '-';
  return `${sign}${formatCents(Math.abs(cents))}`;
}

function RecruitersView({
  data,
  isLoading,
  isError,
  scope,
  onScope,
  onInvite,
}: {
  data: ReferralsLeaderboardResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  scope: RecruitersScope;
  onScope: (s: RecruitersScope) => void;
  onInvite: () => void;
}) {
  return (
    <>
      <div className="mx-3 mt-1 flex gap-2 text-[11px]">
        <Pill active={scope === 'global'} onClick={() => onScope('global')}>
          Global
        </Pill>
        <Pill active={scope === 'friends'} onClick={() => onScope('friends')}>
          Friends
        </Pill>
      </div>
      {isLoading && <div className="px-3 pt-3 font-mono text-[11px] text-muted">loading…</div>}
      {isError && (
        <div className="px-3 pt-3 text-[12px] text-hl-red">
          Couldn't load recruiters leaderboard.
        </div>
      )}
      {data && data.items.length === 0 && (
        <div className="px-3 pt-4">
          <div className="rounded-[6px] border-[1.5px] border-ink bg-note px-[14px] py-3">
            <div className="text-[13px] font-extrabold leading-tight">
              No recruiters yet — be the first.
            </div>
            <div className="mt-1 text-[11px] text-muted">
              Invite friends, earn 5% from their wins forever.
            </div>
          </div>
          <div className="mt-3">
            <InviteCard onInvite={onInvite} />
          </div>
        </div>
      )}
      {data && data.items.length > 0 && (
        <div className="flex flex-col gap-[6px] px-3 pt-3">
          {data.items.map((row) => (
            <RecruiterRow key={row.userId} row={row} />
          ))}
          {data.myRow && !data.items.some((r) => r.userId === data.myRow!.userId) && (
            <>
              <div className="my-2 text-center font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                · · ·
              </div>
              <RecruiterRow row={data.myRow} />
            </>
          )}
        </div>
      )}
    </>
  );
}

function RecruiterRow({ row }: { row: ReferralsLeaderboardResponse['items'][number] }) {
  return (
    <div
      className={`flex items-center gap-[10px] rounded-[6px] border-[1.5px] border-ink bg-paper px-[10px] py-[8px] ${
        row.isMe ? 'ring-2 ring-accent' : ''
      }`}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-ink bg-paper-dim font-mono text-[11px] font-bold">
        #{row.rank}
      </div>
      <Avatar name={row.firstName ?? '?'} url={row.photoUrl} size={32} />
      <div className="flex-1">
        <div className="text-[13px] font-bold leading-tight">
          {row.firstName ?? 'anonymous'}
          {row.isMe && <span className="ml-1 text-accent">· you</span>}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted">
          {row.l1Count} L1 invited
        </div>
      </div>
      <div className="font-mono text-[14px] font-extrabold text-hl-green">
        +{formatCents(row.totalEarnedCents)}
      </div>
    </div>
  );
}
