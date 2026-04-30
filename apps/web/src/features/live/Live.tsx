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

  // Once-only gate: prevents the locked↔live ping-pong that piled up
  // history.replaceState calls and crashed TG WebView with SecurityError.
  const finalizeNavRef = useRef(false);
  useEffect(() => {
    if (finalizeNavRef.current || !live.data) return;
    const status = live.data.status;
    if (status === 'finalizing' || status === 'finalized' || status === 'cancelled') {
      finalizeNavRef.current = true;
      navigate(`/contests/${id}/result`);
    }
    // Pre-kickoff (status='scheduled') is now rendered inline as a "starting
    // soon" banner — the previous redirect-back-to-locked race-looped against
    // LockedScreen's auto-nav-to-live and crashed history.replaceState.
  }, [live.data, id, navigate]);

  const slice = useLiveSlice(live.data ?? null);

  if (!id) return <div className="p-6 text-hl-red">missing contest id</div>;
  if (live.isLoading) return <LoadingSplash />;
  if (live.isError || !live.data) return <div className="p-6 text-hl-red">contest not found</div>;

  const data = live.data;
  const prizeEstCents = data.projectedPrizeCents > 0 ? data.projectedPrizeCents : null;
  const pnlUsd = data.portfolio.currentUsd - data.portfolio.startUsd;

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <LiveHeader
        contestName={data.contestName}
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
      <LiveTeam rows={data.lineup} mode={data.type} />
      <LocalLeaderboard
        top={data.leaderboardTop}
        around={slice.aroundMe}
        all={data.leaderboardAll}
        onViewAll={() => setModalOpen(true)}
      />
      <LeaderboardModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        entries={data.leaderboardAll}
      />
    </div>
  );
}
