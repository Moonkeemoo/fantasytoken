import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LeaderboardModal } from './LeaderboardModal.js';
import { LiveHeader } from './LiveHeader.js';
import { LiveHero } from './LiveHero.js';
import { LiveTeam } from './LiveTeam.js';
import { LocalLeaderboard } from './LocalLeaderboard.js';
import { useLive } from './useLive.js';
import { LoadingSplash } from '../loading/LoadingSplash.js';
import type { ContestMode } from '../team-builder/AllocSheet.js';

function inferMode(name: string): ContestMode {
  return /\bbear\b/i.test(name) ? 'bear' : 'bull';
}

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

  useEffect(() => {
    if (!live.data) return;
    const status = live.data.status;
    if (status === 'finalizing' || status === 'finalized' || status === 'cancelled') {
      navigate(`/contests/${id}/result`);
    } else if (status === 'scheduled') {
      // ADR-0003: pre-kickoff goes through the LockedScreen waiting room.
      // Lobby's "VIEW" CTA on already-entered scheduled contests bounces here;
      // redirect on so the player lands in the right state.
      navigate(`/contests/${id}/locked`, { replace: true });
    }
  }, [live.data, id, navigate]);

  const mode = useMemo<ContestMode>(
    () => (live.data ? inferMode(live.data.contestName) : 'bull'),
    [live.data],
  );

  // Slice the full leaderboard to a "[me−2 … me+2]" window for around-me.
  const aroundMe = useMemo(() => {
    if (!live.data) return [];
    const all = live.data.leaderboardAll;
    const meIdx = all.findIndex((e) => e.isMe);
    if (meIdx === -1) return [];
    const start = Math.max(0, meIdx - 2);
    const end = Math.min(all.length, meIdx + 3);
    return all.slice(start, end);
  }, [live.data]);

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
      <LiveHero
        rank={data.rank}
        totalEntries={data.totalEntries}
        pnlUsd={pnlUsd}
        pctChange={data.portfolio.plPct}
        prizeEstCents={prizeEstCents}
      />
      <LiveTeam rows={data.lineup} mode={mode} />
      <LocalLeaderboard
        top={data.leaderboardTop}
        around={aroundMe}
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
