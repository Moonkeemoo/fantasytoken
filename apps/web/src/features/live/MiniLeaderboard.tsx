import type { LeaderboardEntry } from '@fantasytoken/shared';
import { formatPct } from '../../lib/format.js';

export interface MiniLeaderboardProps {
  top: LeaderboardEntry[];
  userRow: LeaderboardEntry | null;
  onViewAll: () => void;
}

export function MiniLeaderboard({ top, userRow, onViewAll }: MiniLeaderboardProps) {
  return (
    <div className="m-3 rounded border border-tg-text/10 bg-tg-bg-secondary p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-tg-hint">leaderboard</span>
        <button onClick={onViewAll} className="text-xs font-bold text-tg-button">
          VIEW ALL ›
        </button>
      </div>
      <div className="flex flex-col gap-1 text-xs">
        {top.slice(0, 2).map((e) => (
          <Row key={e.entryId} entry={e} />
        ))}
        {userRow && !top.slice(0, 2).some((t) => t.entryId === userRow.entryId) && (
          <div className="-mx-2 rounded bg-yellow-100/40 px-2 py-1">
            <Row entry={userRow} />
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ entry }: { entry: LeaderboardEntry }) {
  return (
    <div className="flex items-center justify-between">
      <span>
        <strong>#{entry.rank}</strong> {entry.displayName}
        {entry.isMe && ' (you)'}
      </span>
      <span className={`font-bold ${entry.scorePct >= 0 ? 'text-green-600' : 'text-tg-error'}`}>
        {formatPct(entry.scorePct)}
      </span>
    </div>
  );
}
