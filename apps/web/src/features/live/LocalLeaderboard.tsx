import type { LeaderboardEntry } from '@fantasytoken/shared';
import { Label } from '../../components/ui/Label.js';
import { Avatar } from '../../components/ui/Avatar.js';
import { formatPnl } from '../../lib/format.js';

export interface LocalLeaderboardProps {
  top: LeaderboardEntry[];
  /** Pre-computed window of `[me-2 … me … me+2]` from `leaderboardAll`. */
  around: LeaderboardEntry[];
  /** Whole table — used to compute the window and to enable "view all". */
  all: LeaderboardEntry[];
  onViewAll: () => void;
}

/**
 * Top-3 + around-me leaderboard (TZ-001 §08.4). When my rank ≤ 5 the divider
 * is suppressed (top-3 already includes neighbors); when > 5, a "skip" row
 * makes the gap explicit so I see the gulf between the leader and me.
 */
export function LocalLeaderboard({
  top,
  around,
  all,
  onViewAll,
}: LocalLeaderboardProps): JSX.Element {
  const topThree = top.slice(0, 3);
  const me = around.find((e) => e.isMe) ?? null;
  const myRank = me?.rank ?? null;

  // Suppress the divider when the around-me window overlaps top-3.
  const showDivider =
    myRank !== null &&
    myRank > 5 &&
    around.length > 0 &&
    around[0]!.rank > topThree[topThree.length - 1]!.rank + 1;

  // Filter out around-me entries that would duplicate top-3.
  const topRanks = new Set(topThree.map((e) => e.rank));
  const aroundFiltered = around.filter((e) => !topRanks.has(e.rank));

  const lowestTopRank = topThree.length > 0 ? topThree[topThree.length - 1]!.rank : 0;
  const firstAroundRank = aroundFiltered.length > 0 ? aroundFiltered[0]!.rank : null;
  const skipRange =
    firstAroundRank !== null && firstAroundRank > lowestTopRank + 1
      ? `ranks ${lowestTopRank + 1}–${firstAroundRank - 1}`
      : '';

  return (
    <section className="px-3 pt-4">
      <div className="flex items-baseline justify-between">
        <Label>Around you</Label>
        <button
          type="button"
          onClick={onViewAll}
          className="font-mono text-[10px] font-bold uppercase tracking-wider text-accent"
        >
          {all.length > 0 ? `view all (${all.length}) →` : 'view all →'}
        </button>
      </div>
      <ul className="mt-2 space-y-0.5">
        {topThree.map((e) => (
          <Row key={e.entryId} entry={e} />
        ))}
        {showDivider && (
          <li className="flex items-center justify-center py-1 text-[10px] text-muted">
            ↕ skip · {skipRange}
          </li>
        )}
        {aroundFiltered.map((e) => (
          <Row key={e.entryId} entry={e} />
        ))}
      </ul>
    </section>
  );
}

function Row({ entry }: { entry: LeaderboardEntry }): JSX.Element {
  const pnlColor = entry.scorePct > 0 ? 'text-bull' : entry.scorePct < 0 ? 'text-bear' : 'text-ink';
  return (
    <li
      className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[12px] ${
        entry.isMe ? 'border border-ink bg-note/40' : ''
      }`}
    >
      <span className="flex items-center gap-2 truncate">
        <strong className="font-mono text-[11px] text-ink-soft">#{entry.rank}</strong>
        <Avatar name={entry.displayName} url={entry.avatarUrl} size={20} bot={entry.isBot} />
        <span className="truncate">{entry.isMe ? <b>You</b> : entry.displayName}</span>
      </span>
      <span className={`font-mono font-bold ${pnlColor}`}>{formatPnl(entry.scorePct)}</span>
    </li>
  );
}
