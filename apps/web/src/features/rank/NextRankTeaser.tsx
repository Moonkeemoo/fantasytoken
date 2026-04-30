import type { TeaserResponse, RankResponse } from '@fantasytoken/shared';

export interface NextRankTeaserProps {
  teaser: TeaserResponse;
  rank: RankResponse;
}

/** Below this rank the teaser is always-on; above it the teaser only
 * surfaces when the player is in the last 20% of their current tier. */
const ALWAYS_VISIBLE_UPTO_RANK = 5;
const CLOSE_PROGRESS_RATIO = 0.8;

/**
 * Compact one-line unlock nudge. Progress bar + XP-to-next + target name +
 * target-rank pill, all on a single row. After Rank 5 the teaser stays
 * silent until the player gets close to the next unlock — a constant
 * always-on banner at every tier felt heavy.
 */
export function NextRankTeaser({ teaser, rank }: NextRankTeaserProps) {
  if (rank.atMax || teaser.nextUnlock === null) {
    return (
      <div className="mx-3 mt-2 flex items-center justify-between gap-2 rounded-md border border-ink bg-note px-3 py-1.5 text-[11px]">
        <span className="font-bold">Mythic crown</span>
        <span className="font-mono text-[10px] text-ink/70">
          {rank.xpSeason.toLocaleString('en-US')} XP this season
        </span>
      </div>
    );
  }

  const ratio = Math.min(1, rank.xpInRank / Math.max(1, rank.xpForRank));
  const targetRank = teaser.nextUnlock.rank;
  if (rank.currentRank >= ALWAYS_VISIBLE_UPTO_RANK && ratio < CLOSE_PROGRESS_RATIO) {
    return null;
  }

  return (
    <div className="mx-3 mt-2 flex items-center gap-2 rounded-md border border-ink bg-note px-3 py-1.5 text-[11px]">
      <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-ink/70">
        Next
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper">
        <div className="h-full bg-ink" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <span className="shrink-0 font-mono text-[10px] font-bold text-ink">
        {teaser.xpToNext} XP
      </span>
      <span className="shrink-0 truncate text-[11px] font-bold text-accent">
        {teaser.nextUnlock.name}
      </span>
      <span className="shrink-0 rounded border border-ink bg-paper px-1.5 py-px font-mono text-[8px] font-bold uppercase tracking-wider">
        R{targetRank}
      </span>
    </div>
  );
}
