import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LiveHeader } from './LiveHeader.js';
import { Scoreboard } from './Scoreboard.js';
import { LineupPerf } from './LineupPerf.js';
import { MiniLeaderboard } from './MiniLeaderboard.js';
import { LeaderboardModal } from './LeaderboardModal.js';
import { useLive } from './useLive.js';
import { LoadingSplash } from '../loading/LoadingSplash.js';

export function Live() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const live = useLive(id);
  const [modalOpen, setModalOpen] = useState(false);

  // Auto-redirect to /result on endsAt or when contest is finalizing/finalized
  useEffect(() => {
    if (!live.data) return;
    const status = live.data.status;
    if (status === 'finalizing' || status === 'finalized' || status === 'cancelled') {
      navigate(`/contests/${id}/result`);
    }
  }, [live.data, id, navigate]);

  if (!id) return <div className="p-6 text-hl-red">missing contest id</div>;
  if (live.isLoading) return <LoadingSplash />;
  if (live.isError || !live.data) return <div className="p-6 text-hl-red">contest not found</div>;

  const data = live.data;

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <LiveHeader
        contestName={data.contestName}
        startsAt={data.startsAt}
        endsAt={data.endsAt}
        status={data.status}
      />
      <Scoreboard
        plPct={data.portfolio.plPct}
        startUsd={data.portfolio.startUsd}
        currentUsd={data.portfolio.currentUsd}
        rank={data.rank}
        totalEntries={data.totalEntries}
        projectedPrizeCents={data.projectedPrizeCents}
        startsAt={data.startsAt}
        endsAt={data.endsAt}
        status={data.status}
      />
      <LineupPerf rows={data.lineup} />
      <MiniLeaderboard
        top={data.leaderboardTop}
        userRow={data.userRow}
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
