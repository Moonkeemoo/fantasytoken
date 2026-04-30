import { useNavigate, useParams } from 'react-router-dom';
import { fmtPnL } from '@fantasytoken/shared';
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

  // Earlier we redirected to /contests/:id/result on finalize, but that page
  // requires the caller to have an entry — spectators don't, so the redirect
  // produced a hostile "result not ready" wall. Stay on Spectator and let
  // the leaderboard render the final standings; the LiveHeader switches to
  // "Finalized" caption automatically based on `status`.

  if (!id) return <div className="p-6 text-hl-red">missing contest id</div>;
  if (live.isLoading) return <LoadingSplash />;
  if (live.isError || !live.data) {
    return <div className="p-6 text-hl-red">contest not found</div>;
  }

  const data = live.data;
  const top10 = data.leaderboardAll.slice(0, 10);

  return (
    <div
      className="flex min-h-screen flex-col bg-paper text-ink"
      style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
    >
      <LiveHeader
        contestName={data.contestName}
        mode={data.type}
        // virtual_budget_cents stores whole coins post TZ-002 (1 coin = $1).
        tier={data.virtualBudgetCents}
        startsAt={data.startsAt}
        endsAt={data.endsAt}
        status={data.status}
      />

      {/* Spectate banner — explicit "you're watching" so UX is unambiguous. */}
      <div className="mx-3 mt-3 rounded-[6px] border-[1.5px] border-dashed border-ink/40 bg-paper-dim px-4 py-3 text-center font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
        {data.status === 'finalized' || data.status === 'finalizing'
          ? '🏁 contest finished — final standings below'
          : data.status === 'cancelled'
            ? '⛔ contest cancelled'
            : '👀 watch-only · live leaderboard updates every 15s'}
      </div>

      {/* Top 10 leaderboard. */}
      <div className="px-3 py-2">
        <Label>{data.status === 'active' ? 'top 10 · live' : 'top 10 · final'}</Label>
        <Card className="mt-2 flex flex-col gap-[6px] !px-[10px] !py-[10px]">
          {top10.length === 0 && (
            <div className="text-center text-[11px] text-muted">no entries yet</div>
          )}
          {top10.map((row, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${row.rank}`;
            const plClass =
              row.scorePct > 0 ? 'text-hl-green' : row.scorePct < 0 ? 'text-hl-red' : 'text-muted';
            // Both $ PnL (matches the hero card on Live screen) and the
            // raw % so spectators can compare apples-to-apples regardless
            // of contest tier. Bigger pill is $; smaller is the %.
            const pnlUsd = row.scorePct * data.virtualBudgetCents;
            return (
              <div key={row.rank} className="flex items-center gap-2">
                <div className="w-[36px] text-center font-mono text-[12px] font-bold">{medal}</div>
                <div className="flex-1 truncate text-[12px]">{row.displayName ?? 'anon'}</div>
                <div className="text-right leading-tight">
                  <div className={`font-mono text-[13px] font-bold ${plClass}`}>
                    {fmtPnL(pnlUsd)}
                  </div>
                  <div className={`font-mono text-[10px] ${plClass}`}>
                    {formatPctPrecise(row.scorePct)}
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      {/* Capacity / context. `totalEntries` already includes bot fillers,
          so the room reads as "full" the moment kickoff happens — that
          matches what the lobby cards show (e.g. "20/20"). The previous
          `realEntries / totalEntries` wording rendered "0 / 20 entries"
          for a Practice that was bot-filled, which read as "empty room"
          to the player. */}
      <div className="px-3 py-1 text-center font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
        {data.totalEntries} entries
        {data.realEntries > 0 ? ` (${data.realEntries} real)` : ''} · prize 🪙{' '}
        {Math.round(data.topPrizeCents)}
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
