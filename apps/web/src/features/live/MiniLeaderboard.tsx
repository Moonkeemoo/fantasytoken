import type { LeaderboardEntry } from '@fantasytoken/shared';
import { Card } from '../../components/ui/Card.js';
import { Label } from '../../components/ui/Label.js';
import { formatPct } from '../../lib/format.js';

export interface MiniLeaderboardProps {
  top: LeaderboardEntry[];
  userRow: LeaderboardEntry | null;
  onViewAll: () => void;
}

export function MiniLeaderboard({ top, userRow, onViewAll }: MiniLeaderboardProps) {
  return (
    <Card className="m-3 !px-[10px] !py-2">
      <div className="mb-[6px] flex items-center justify-between">
        <Label>leaderboard</Label>
        <button
          onClick={onViewAll}
          className="font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-accent"
        >
          VIEW ALL ›
        </button>
      </div>
      <div className="flex flex-col gap-[3px] text-[11px]">
        {top.slice(0, 3).map((e) => (
          <Row key={e.entryId} entry={e} />
        ))}
        {userRow && !top.slice(0, 3).some((t) => t.entryId === userRow.entryId) && (
          <div className="-mx-1 rounded-[2px] bg-note px-1 py-[2px]">
            <Row entry={userRow} />
          </div>
        )}
      </div>
    </Card>
  );
}

function Row({ entry }: { entry: LeaderboardEntry }) {
  return (
    <div className="flex items-center justify-between">
      <span>
        <strong>#{entry.rank}</strong> {entry.displayName}
        {entry.isMe && ' (you)'}
      </span>
      <span className={`font-bold ${entry.scorePct >= 0 ? 'text-hl-green' : 'text-hl-red'}`}>
        {formatPct(entry.scorePct)}
      </span>
    </div>
  );
}
