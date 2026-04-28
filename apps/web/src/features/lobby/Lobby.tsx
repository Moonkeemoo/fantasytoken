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

const IN_PROGRESS_STATUSES = new Set(['scheduled', 'active', 'finalizing']);

export function Lobby() {
  const navigate = useNavigate();
  const me = useMe();
  const [filter, setFilter] = useState<ContestFilter>('cash');
  const [topUpOpen, setTopUpOpen] = useState(false);

  const cash = useContests('cash');
  const free = useContests('free');
  const my = useContests('my');

  const counts: Record<ContestFilter, number> = {
    cash: cash.data?.items.length ?? 0,
    free: free.data?.items.length ?? 0,
    my: my.data?.items.length ?? 0,
  };

  const currentList = filter === 'cash' ? cash : filter === 'free' ? free : my;
  const items = currentList.data?.items ?? [];
  const featured = useMemo(() => items.find((c) => c.isFeatured), [items]);
  const others = useMemo(
    () => (featured ? items.filter((c) => c.id !== featured.id) : items),
    [items, featured],
  );

  const myItems = my.data?.items ?? [];
  const myInProgress = myItems.filter((c) => IN_PROGRESS_STATUSES.has(c.status));
  const myHistory = useMemo(
    () =>
      myItems
        .filter((c) => c.status === 'finalized' || c.status === 'cancelled')
        .slice()
        .sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1)),
    [myItems],
  );

  if (me.isLoading) return <div className="p-6 text-muted">loading…</div>;
  if (me.isError || !me.data)
    return <div className="p-6 text-hl-red">error: {String(me.error)}</div>;

  const goTeamBuilder = (id: string) => navigate(`/contests/${id}/build`);
  const goLive = (id: string) => navigate(`/contests/${id}/live`);
  const goResult = (id: string) => navigate(`/contests/${id}/result`);

  const isLiveTab = filter === 'my';

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <Header
        firstName={me.data.user.first_name}
        balanceCents={me.data.balanceCents}
        onTopUp={() => setTopUpOpen(true)}
      />
      {!isLiveTab && <ActiveBanner inProgress={myInProgress} onView={goLive} />}
      <Tabs active={filter} counts={counts} onChange={setFilter} />
      {isLiveTab ? (
        myInProgress.length === 0 && myHistory.length === 0 ? (
          <div className="px-4 py-6 text-center text-[11px] text-muted">
            No contests yet — pick one from <strong>Cash</strong> or <strong>Free</strong>.
          </div>
        ) : (
          <>
            {myInProgress.length > 0 && (
              <ContestList
                items={myInProgress}
                balanceCents={me.data.balanceCents}
                onJoin={goTeamBuilder}
                onView={goLive}
                onResult={goResult}
                onTopUp={() => setTopUpOpen(true)}
                heading="Live now"
              />
            )}
            {myHistory.length > 0 && (
              <ContestList
                items={myHistory}
                balanceCents={me.data.balanceCents}
                onJoin={goTeamBuilder}
                onView={goLive}
                onResult={goResult}
                onTopUp={() => setTopUpOpen(true)}
                heading="History"
              />
            )}
          </>
        )
      ) : (
        <>
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
        </>
      )}
      <BottomNav />
      <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />
    </div>
  );
}
