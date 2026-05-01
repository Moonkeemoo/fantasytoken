import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LeaderboardModal } from './LeaderboardModal.js';
import { LiveHeader } from './LiveHeader.js';
import { LiveHero } from './LiveHero.js';
import { LiveTeam } from './LiveTeam.js';
import { LocalLeaderboard } from './LocalLeaderboard.js';
import { useLive } from './useLive.js';
import { useLiveSlice } from './useLiveSlice.js';
import { LoadingSplash } from '../loading/LoadingSplash.js';
import { MomentBanner } from './MomentBanner.js';

/**
 * Live screen — $-first redesign (TZ-001 §08).
 * Split hero (rank/PnL equal weight), per-token PnL with helping/hurting
 * borders, top-3 + around-me leaderboard with skip divider.
 *
 * Polling stays at 5s (existing useLive hook) since the prior team felt that
 * cadence was right for the price-refresh window. Handoff §13 Q2 calls for
 * 30s in v1; we keep 5s as a known divergence — the screen behaves correctly
 * at any interval.
 */
export function Live(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const live = useLive(id);
  const [modalOpen, setModalOpen] = useState(false);

  // Once-only gate per Live mount — fires at most one navigation. Combined
  // with LockedScreen's own once-only ref this closes the locked↔live
  // ping-pong that previously piled up history.replaceState calls and
  // crashed TG WebView with SecurityError.
  const navFiredRef = useRef(false);
  useEffect(() => {
    if (navFiredRef.current || !live.data) return;
    const status = live.data.status;
    if (status === 'finalizing' || status === 'finalized' || status === 'cancelled') {
      navFiredRef.current = true;
      navigate(`/contests/${id}/result`);
    } else if (status === 'scheduled') {
      // User landed on /live for a contest that hasn't kicked off — bounce
      // them to the locked-room countdown where the pre-kickoff UX lives.
      // BUT only if kickoff is meaningfully in the future. Within 5s we
      // sit tight: the backend cron runs every 60s, so during the kickoff
      // window /me/contests can still return scheduled while LockedScreen
      // already redirected us here on `Date.now() >= startsAt`. Without
      // this buffer the two screens ping-pong as fast as React can render.
      const startsAt = new Date(live.data.startsAt).getTime();
      if (startsAt - Date.now() > 5_000) {
        navFiredRef.current = true;
        navigate(`/contests/${id}/locked`);
      }
    }
  }, [live.data, id, navigate]);

  const slice = useLiveSlice(live.data ?? null);

  if (!id) return <div className="p-6 text-hl-red">missing contest id</div>;
  if (live.isLoading) return <LoadingSplash />;
  if (live.isError || !live.data) return <div className="p-6 text-hl-red">contest not found</div>;

  const data = live.data;
  const prizeEstCents = data.projectedPrizeCents > 0 ? data.projectedPrizeCents : null;
  const pnlUsd = data.portfolio.currentUsd - data.portfolio.startUsd;

  return (
    <div
      className="flex min-h-screen flex-col bg-paper text-ink"
      // Reserve room for BottomNav + iPhone safe-area inset (see Lobby.tsx).
      style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
    >
      <LiveHeader
        contestName={data.contestName}
        mode={data.type}
        // Post coins-economy (TZ-002) virtual_budget_cents stores whole coins
        // (1 coin = $1 fantasy). The legacy /100 divide turned a $100 Practice
        // budget into "$1" — drop it.
        tier={data.virtualBudgetCents}
        startsAt={data.startsAt}
        endsAt={data.endsAt}
        status={data.status}
      />
      <MomentBanner rank={data.rank} rankDelta1h={slice.rankDelta1h} />
      <LiveHero
        rank={data.rank}
        totalEntries={data.totalEntries}
        pnlUsd={pnlUsd}
        pctChange={data.portfolio.plPct}
        prizeEstCents={prizeEstCents}
      />
      <LiveTeam rows={data.lineup} />
      <LocalLeaderboard
        top={data.leaderboardTop}
        around={slice.aroundMe}
        all={data.leaderboardAll}
        onViewAll={() => setModalOpen(true)}
        budgetUsd={data.virtualBudgetCents}
      />
      <LeaderboardModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        entries={data.leaderboardAll}
        budgetUsd={data.virtualBudgetCents}
      />
    </div>
  );
}
