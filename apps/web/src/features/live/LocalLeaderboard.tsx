import type { LeaderboardEntry } from '@fantasytoken/shared';
import { fmtPnL } from '@fantasytoken/shared';
import { Label } from '../../components/ui/Label.js';
import { Avatar } from '../../components/ui/Avatar.js';

export interface LocalLeaderboardProps {
  top: LeaderboardEntry[];
  /** Pre-computed window of `[me-2 … me … me+2]` from `leaderboardAll`. */
  around: LeaderboardEntry[];
  /** Whole table — used to compute the window and to enable "view all". */
  all: LeaderboardEntry[];
  onViewAll: () => void;
  /** Contest virtual budget in dollars — for converting per-row scorePct
   * to $ PnL so the leaderboard reads in the same currency as the hero
   * card (`+$0.12`). Without this rows showed `🪙 0` because formatPnl
   * was treating a 0..1 ratio as a coin amount. */
  budgetUsd: number;
  /** Last paying rank (= contest.payingRanks). Ranks ≤ payingRanks get
   * highlighted in green ("you're cashing"); below = grey ("no cash").
   * Optional for backward-compat. */
  payingRanks?: number;
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
  budgetUsd,
  payingRanks,
}: LocalLeaderboardProps): JSX.Element {
  // Show top 10 in the inline leaderboard — the screen has plenty of
  // room and a longer ladder gives the player a real sense of where the
  // pack is. The around-me window still kicks in when their rank is
  // outside the top 10 (showDivider logic below).
  const topTen = top.slice(0, 10);
  const me = around.find((e) => e.isMe) ?? null;
  const myRank = me?.rank ?? null;

  // Suppress the divider when the around-me window overlaps top-3.
  const showDivider =
    myRank !== null &&
    myRank > 5 &&
    around.length > 0 &&
    around[0]!.rank > topTen[topTen.length - 1]!.rank + 1;

  // Filter out around-me entries that would duplicate top-3.
  const topRanks = new Set(topTen.map((e) => e.rank));
  const aroundFiltered = around.filter((e) => !topRanks.has(e.rank));

  const lowestTopRank = topTen.length > 0 ? topTen[topTen.length - 1]!.rank : 0;
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
        {topTen.map((e) => (
          <Row key={e.entryId} entry={e} budgetUsd={budgetUsd} payingRanks={payingRanks} />
        ))}
        {/* Cash-line marker — rendered between top-K-paid and the first
            non-paying rank in the top-10 view. Mirrors DraftKings'
            "money bubble" indicator so the player knows where the
            cutoff is even when they're not on it. */}
        {payingRanks !== undefined &&
          payingRanks > 0 &&
          payingRanks < (topTen[topTen.length - 1]?.rank ?? 0) && (
            <li
              className="flex items-center justify-center gap-1 border-t border-dashed border-bull/40 py-1 text-[9px] uppercase tracking-wider text-bull"
              aria-label="cash line"
            >
              ─── cash line · top {payingRanks} paid ───
            </li>
          )}
        {showDivider && (
          <li className="flex items-center justify-center py-1 text-[10px] text-muted">
            ↕ skip · {skipRange}
          </li>
        )}
        {aroundFiltered.map((e) => (
          <Row key={e.entryId} entry={e} budgetUsd={budgetUsd} payingRanks={payingRanks} />
        ))}
      </ul>
    </section>
  );
}

function Row({
  entry,
  budgetUsd,
  payingRanks,
}: {
  entry: LeaderboardEntry;
  budgetUsd: number;
  payingRanks: number | undefined;
}): JSX.Element {
  const pnlColor = entry.scorePct > 0 ? 'text-bull' : entry.scorePct < 0 ? 'text-bear' : 'text-ink';
  // Paying-band indicator: rank ≤ payingRanks → "you're cashing" (subtle
  // green left border). Below cutoff → no decoration.
  const isCashing = payingRanks !== undefined && entry.rank <= payingRanks;
  const cashingClass = isCashing ? 'border-l-[3px] border-l-bull pl-[5px]' : '';
  return (
    <li
      className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[12px] ${
        entry.isMe ? 'border border-ink bg-note/40' : ''
      } ${cashingClass}`}
    >
      <span className="flex items-center gap-2 truncate">
        <strong className="font-mono text-[11px] text-ink-soft">#{entry.rank}</strong>
        <Avatar name={entry.displayName} url={entry.avatarUrl} size={20} bot={entry.isBot} />
        <span className="truncate">{entry.isMe ? <b>You</b> : entry.displayName}</span>
      </span>
      <span className={`font-mono font-bold ${pnlColor}`}>
        {fmtPnL(entry.scorePct * budgetUsd)}
      </span>
    </li>
  );
}
