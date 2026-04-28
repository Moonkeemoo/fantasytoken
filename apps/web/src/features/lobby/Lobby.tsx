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

  const active = (my.data?.items ?? []).filter((c) => c.status === 'active');

  if (me.isLoading) return <div className="p-6 text-tg-hint">loading…</div>;
  if (me.isError || !me.data)
    return <div className="p-6 text-tg-error">error: {String(me.error)}</div>;

  const goTeamBuilder = (id: string) => navigate(`/contests/${id}/build`);
  const goLive = (id: string) => navigate(`/contests/${id}/live`);

  return (
    <div className="flex min-h-screen flex-col bg-tg-bg text-tg-text">
      <Header
        firstName={me.data.user.first_name}
        balanceCents={me.data.balanceCents}
        onTopUp={() => setTopUpOpen(true)}
      />
      <Tabs active={filter} counts={counts} onChange={setFilter} />
      {featured && <FeaturedHero contest={featured} onEnter={goTeamBuilder} />}
      <ContestList
        items={others}
        balanceCents={me.data.balanceCents}
        onJoin={goTeamBuilder}
        onTopUp={() => setTopUpOpen(true)}
      />
      <ActiveBanner active={active} onView={goLive} />
      <BottomNav />
      <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />
    </div>
  );
}
