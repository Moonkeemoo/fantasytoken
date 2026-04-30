import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMe } from '../me/useMe.js';
import { useContests } from './useContests.js';
import { Header } from './Header.js';
import { ContestList } from './ContestList.js';
import { TopUpModal } from '../wallet/TopUpModal.js';
import { LoadingSplash } from '../loading/LoadingSplash.js';
import { NextRankTeaser } from '../rank/NextRankTeaser.js';
import { useRank, useTeaser } from '../rank/useRank.js';
import { PromoCarousel } from './PromoCarousel.js';
import { InviteSlide } from './InviteSlide.js';
import { zoneContests } from './zones.js';
import { applyOnboardingGate } from './onboarding-gate.js';

/**
 * Lobby v2 — 4 zones (DESIGN.md §4).
 *
 *   1. MY CONTESTS    — user's live entries, ends_at ASC
 *   2. STARTING SOON  — joinable scheduled, starts_at ASC
 *   3. WATCH LIVE     — active, not entered (spectator)
 *   4. LOCKED         — scheduled, rank > user.rank, sorted by closest unlock
 *
 * Header summary (`🎯 N live · ⏰ M soon · 👀 K watching`) sits below the
 * wallet header so the player can see at a glance what their day looks like.
 */
export function Lobby() {
  const navigate = useNavigate();
  const me = useMe();
  const [topUpOpen, setTopUpOpen] = useState(false);

  const cash = useContests('cash');
  const free = useContests('free');
  const my = useContests('my');
  const rank = useRank();
  const teaser = useTeaser();

  const userRank = rank.data?.currentRank ?? 1;
  const finalizedContests = me.data?.finalizedContests ?? 0;

  // Merge cash + free + my into one canonical list (dedupe by id), then zone.
  const zones = useMemo(() => {
    const byId = new Map<
      string,
      (typeof cash.data extends { items: infer T } ? T : never[])[number]
    >();
    for (const c of cash.data?.items ?? []) byId.set(c.id, c);
    for (const c of free.data?.items ?? []) byId.set(c.id, c);
    // /my response carries the authoritative `userHasEntered=true` for those rows.
    for (const c of my.data?.items ?? []) byId.set(c.id, c);
    const all = Array.from(byId.values());
    const z = zoneContests(all, userRank);
    // Onboarding gate (DESIGN.md §8) only applies to `soon` — we don't hide
    // user's own running contests, spectate cards, or locked aspirational tier.
    return { ...z, soon: applyOnboardingGate(z.soon, finalizedContests) };
  }, [cash.data, free.data, my.data, userRank, finalizedContests]);

  if (me.isLoading) return <LoadingSplash />;
  if (me.isError || !me.data)
    return <div className="p-6 text-hl-red">error: {String(me.error)}</div>;

  const goTeamBuilder = (id: string) => navigate(`/contests/${id}/build`);
  const goLive = (id: string) => navigate(`/contests/${id}/live`);
  const goLocked = (id: string) => navigate(`/contests/${id}/locked`);
  const goResult = (id: string) => navigate(`/contests/${id}/result`);
  const goWatch = (id: string) => navigate(`/contests/${id}/watch`);

  return (
    <div className="flex min-h-screen flex-col bg-paper pb-14 text-ink">
      <Header
        firstName={me.data.user.first_name}
        photoUrl={me.data.user.photo_url}
        balanceCents={me.data.balanceCents}
        onTopUp={() => setTopUpOpen(true)}
      />

      {/* Permanent summary bar — orientator. */}
      <div className="flex items-center gap-3 border-b border-rule px-4 py-2 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
        <span>🎯 {zones.my.length} live</span>
        <span>·</span>
        <span>⏰ {zones.soon.length} soon</span>
        <span>·</span>
        <span>👀 {zones.watch.length} watching</span>
      </div>

      {rank.data && teaser.data && <NextRankTeaser rank={rank.data} teaser={teaser.data} />}

      {/* Invite promo only after the user has played a few contests (DESIGN.md
          §8 R3 — once they've done 3 finals they have something to share).
          Earlier than that the "Earn 5%" pitch reads as noise. */}
      {finalizedContests >= 3 && <PromoCarousel slides={[<InviteSlide key="invite" />]} />}

      {zones.my.length > 0 && (
        <ContestList
          items={zones.my}
          balanceCents={me.data.balanceCents}
          userRank={userRank}
          onJoin={goTeamBuilder}
          onView={goLive}
          onLocked={goLocked}
          onResult={goResult}
          onTopUp={() => setTopUpOpen(true)}
          heading={`my contests · ${zones.my.length} live`}
        />
      )}

      {zones.soon.length > 0 && (
        <ContestList
          items={zones.soon}
          balanceCents={me.data.balanceCents}
          userRank={userRank}
          onJoin={goTeamBuilder}
          onView={goLive}
          onLocked={goLocked}
          onResult={goResult}
          onTopUp={() => setTopUpOpen(true)}
          heading="starting soon · join now"
        />
      )}

      {zones.watch.length > 0 && (
        <ContestList
          items={zones.watch}
          balanceCents={me.data.balanceCents}
          userRank={userRank}
          onJoin={goTeamBuilder}
          onView={goWatch}
          onLocked={goLocked}
          onResult={goResult}
          onTopUp={() => setTopUpOpen(true)}
          heading={`watch live · ${zones.watch.length} running`}
        />
      )}

      {zones.locked.length > 0 && (
        <ContestList
          // Show only the next 3 locked tiers — anything further is buried as
          // a long-tail wall. The full list is implied by the rank teaser.
          items={zones.locked.slice(0, 3)}
          balanceCents={me.data.balanceCents}
          userRank={userRank}
          onJoin={goTeamBuilder}
          onView={goLive}
          onLocked={goLocked}
          onResult={goResult}
          onTopUp={() => setTopUpOpen(true)}
          heading="locked · keep playing to unlock"
        />
      )}

      <div className="flex-1" />
      <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />
    </div>
  );
}
