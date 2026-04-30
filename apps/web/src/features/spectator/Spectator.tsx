import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card } from '../../components/ui/Card.js';
import { Label } from '../../components/ui/Label.js';
import { LoadingSplash } from '../loading/LoadingSplash.js';
import { useLive } from '../live/useLive.js';
import { LiveHeader } from '../live/LiveHeader.js';
import { formatPctPrecise } from '../../lib/format.js';

/**
 * Spectator screen — DESIGN.md §5. Watch-only render of a contest the user
 * is NOT in. Reuses `useLive` (the backend returns no lineup / userRow when
 * the caller has no entry, so `data.lineup === []`).
 *
 * Hard rule: NEVER reveal top-1 lineup picks while running. Anti-copycat.
 * The leaderboard shows ranks, P&L, display names — that's it.
 */
export function Spectator(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const live = useLive(id);

  // If the contest finalizes while we're watching, jump to the result page
  // (unauthenticated viewers fall through to a public-result render there).
  const navFiredRef = useRef(false);
  useEffect(() => {
    if (navFiredRef.current || !live.data) return;
    const status = live.data.status;
    if (status === 'finalizing' || status === 'finalized' || status === 'cancelled') {
      navFiredRef.current = true;
      navigate(`/contests/${id}/result`);
    }
  }, [live.data, id, navigate]);

  if (!id) return <div className="p-6 text-hl-red">missing contest id</div>;
  if (live.isLoading) return <LoadingSplash />;
  if (live.isError || !live.data) {
    return <div className="p-6 text-hl-red">contest not found</div>;
  }

  const data = live.data;
  const top10 = data.leaderboardAll.slice(0, 10);

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <LiveHeader
        contestName={data.contestName}
        mode={data.type}
        tier={Math.round(data.virtualBudgetCents / 100)}
        startsAt={data.startsAt}
        endsAt={data.endsAt}
        status={data.status}
      />

      {/* Spectate banner — explicit "you're watching" so UX is unambiguous. */}
      <div className="mx-3 mt-3 rounded-[6px] border-[1.5px] border-dashed border-ink/40 bg-paper-dim px-4 py-3 text-center font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
        👀 watch-only · you didn't enter this contest
      </div>

      {/* Top 10 leaderboard. */}
      <div className="px-3 py-2">
        <Label>top 10 · live</Label>
        <Card className="mt-2 flex flex-col gap-[6px] !px-[10px] !py-[10px]">
          {top10.length === 0 && (
            <div className="text-center text-[11px] text-muted">no entries yet</div>
          )}
          {top10.map((row, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${row.rank}`;
            const plClass =
              row.scorePct > 0 ? 'text-hl-green' : row.scorePct < 0 ? 'text-hl-red' : 'text-muted';
            return (
              <div key={row.rank} className="flex items-center gap-2">
                <div className="w-[36px] text-center font-mono text-[12px] font-bold">{medal}</div>
                <div className="flex-1 truncate text-[12px]">{row.displayName ?? 'anon'}</div>
                <div className={`text-right font-mono text-[12px] font-bold ${plClass}`}>
                  {formatPctPrecise(row.scorePct)}
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      {/* Capacity / context. */}
      <div className="px-3 py-1 text-center font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
        {data.realEntries} / {data.totalEntries} entries · prize 🪙 {Math.round(data.topPrizeCents)}
      </div>

      <div className="flex-1" />

      <div className="border-t border-rule px-4 py-3">
        <button
          onClick={() => navigate('/lobby')}
          className="w-full rounded-[6px] border-[1.5px] border-ink bg-paper py-2 font-mono text-[12px] font-bold uppercase tracking-[0.06em]"
        >
          ◂ back to lobby
        </button>
      </div>
    </div>
  );
}
