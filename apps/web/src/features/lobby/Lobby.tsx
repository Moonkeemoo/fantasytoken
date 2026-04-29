import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ContestFilter } from '@fantasytoken/shared';
import { useMe } from '../me/useMe.js';
import { useContests } from './useContests.js';
import { Header } from './Header.js';
import { Tabs } from './Tabs.js';
import { FeaturedHero } from './FeaturedHero.js';
import { ContestList } from './ContestList.js';
import { ActiveBanner } from './ActiveBanner.js';
import { BottomNav } from './BottomNav.js';
import { TopUpModal } from '../wallet/TopUpModal.js';
import { LoadingSplash } from '../loading/LoadingSplash.js';
import { NextRankTeaser } from '../rank/NextRankTeaser.js';
import { useRank, useTeaser } from '../rank/useRank.js';

const IN_PROGRESS_STATUSES = new Set(['scheduled', 'active', 'finalizing']);

export function Lobby() {
  const navigate = useNavigate();
  const me = useMe();
  const [filter, setFilter] = useState<Exclude<ContestFilter, 'my'>>('cash');
  const [topUpOpen, setTopUpOpen] = useState(false);

  const cash = useContests('cash');
  const free = useContests('free');
  const my = useContests('my');
  const rank = useRank();
  const teaser = useTeaser();

  const counts = {
    cash: cash.data?.items.length ?? 0,
    free: free.data?.items.length ?? 0,
  };

  const currentList = filter === 'cash' ? cash : free;
  const items = currentList.data?.items ?? [];
  const featured = useMemo(() => items.find((c) => c.isFeatured), [items]);
  const others = useMemo(
    () => (featured ? items.filter((c) => c.id !== featured.id) : items),
    [items, featured],
  );

  // Banner shows ANY user-entered contest that isn't yet finalized — quick jump to Live.
  const myInProgress = (my.data?.items ?? []).filter((c) => IN_PROGRESS_STATUSES.has(c.status));

  if (me.isLoading) return <LoadingSplash />;
  if (me.isError || !me.data)
    return <div className="p-6 text-hl-red">error: {String(me.error)}</div>;

  const goTeamBuilder = (id: string) => navigate(`/contests/${id}/build`);
  const goLive = (id: string) => navigate(`/contests/${id}/live`);
  const goResult = (id: string) => navigate(`/contests/${id}/result`);

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <Header
        firstName={me.data.user.first_name}
        photoUrl={me.data.user.photo_url}
        balanceCents={me.data.balanceCents}
        onTopUp={() => setTopUpOpen(true)}
      />
      <ActiveBanner inProgress={myInProgress} onView={goLive} />
      {rank.data && teaser.data && <NextRankTeaser rank={rank.data} teaser={teaser.data} />}
      <Tabs active={filter} counts={counts} onChange={setFilter} />
      {featured && <FeaturedHero contest={featured} onEnter={goTeamBuilder} />}
      <ContestList
        items={others}
        balanceCents={me.data.balanceCents}
        onJoin={goTeamBuilder}
        onView={goLive}
        onResult={goResult}
        onTopUp={() => setTopUpOpen(true)}
        heading="All contests"
      />
      <div className="flex-1" />
      <BottomNav />
      <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />
    </div>
  );
}
