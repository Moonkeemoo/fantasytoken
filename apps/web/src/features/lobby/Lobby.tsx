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
import { useReferralsSummary } from '../referrals/useReferrals.js';
import { PromoCarousel } from './PromoCarousel.js';
import { InviteSlide } from './InviteSlide.js';

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
  const referralsSummary = useReferralsSummary();

  const counts = {
    cash: cash.data?.items.length ?? 0,
    free: free.data?.items.length ?? 0,
  };

  const currentList = filter === 'cash' ? cash : free;
  const items = currentList.data?.items ?? [];
  // Unlocked-first, then locked sorted by min_rank ascending. Aspirational, not frustrating.
  const userRank = rank.data?.currentRank ?? 1;
  // Featured = the highest-min_rank contest the user has actually unlocked.
  // The latest unlock becomes the headline; older unlocks demote to All Contests.
  // No fallback to a static is_featured flag — keeps the headline truthful per user.
  // Cash-tab fallback: if the user hasn't unlocked any cash contest yet (fresh
  // Rank-1 player), surface a Free contest (typically Practice) so the lobby
  // has a real "Enter contest →" headline instead of an empty hero slot.
  const featured = useMemo(() => {
    const pickHighest = (pool: typeof items) => {
      const unlocked = pool.filter((c) => c.minRank <= userRank);
      if (unlocked.length === 0) return undefined;
      return unlocked.reduce((best, c) => (c.minRank > best.minRank ? c : best), unlocked[0]!);
    };
    const primary = pickHighest(items);
    if (primary) return primary;
    if (filter === 'cash') return pickHighest(free.data?.items ?? []);
    return undefined;
  }, [items, userRank, filter, free.data?.items]);
  const others = useMemo(() => {
    const list = featured ? items.filter((c) => c.id !== featured.id) : items;
    return list.slice().sort((a, b) => {
      const aLocked = !a.userHasEntered && a.minRank > userRank;
      const bLocked = !b.userHasEntered && b.minRank > userRank;
      if (aLocked !== bLocked) return aLocked ? 1 : -1;
      if (aLocked && bLocked) return a.minRank - b.minRank;
      return 0;
    });
  }, [items, featured, userRank]);

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
      {(() => {
        // Promo carousel = Featured contest + Invite slide. Invite slide only
        // appears for users with no active referrees (mirrors the old teaser
        // visibility rule). When neither Featured nor Invite are eligible,
        // the carousel renders nothing — no empty padding.
        const slides = [];
        if (featured) {
          slides.push(<FeaturedHero contest={featured} onEnter={goTeamBuilder} />);
        }
        if (referralsSummary.data && referralsSummary.data.l1ActiveCount === 0) {
          slides.push(<InviteSlide />);
        }
        return slides.length > 0 ? <PromoCarousel slides={slides} /> : null;
      })()}
      <Tabs active={filter} counts={counts} onChange={setFilter} />
      <ContestList
        items={others}
        balanceCents={me.data.balanceCents}
        userRank={userRank}
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
