import type { TeaserResponse, RankResponse } from '@fantasytoken/shared';

export interface NextRankTeaserProps {
  teaser: TeaserResponse;
  rank: RankResponse;
}

/**
 * Yellow paper-note banner: "Reach Rank N · Tier to unlock NAME" + a progress
 * bar driven by xpInRank/xpForRank.
 */
export function NextRankTeaser({ teaser, rank }: NextRankTeaserProps) {
  if (rank.atMax || teaser.nextUnlock === null) {
    return (
      <div
        className="mx-3 mt-2 rounded-[6px] border-[1.5px] border-ink px-[12px] py-[8px]"
        style={{ backgroundColor: '#facc15' }}
      >
        <div className="text-[12px] font-bold leading-tight">
          Mythic crown · {rank.xpSeason} XP this season
        </div>
      </div>
    );
  }

  const ratio = Math.min(1, rank.xpInRank / Math.max(1, rank.xpForRank));
  return (
    // Compact single-row variant: title + XP-to-go on one line, then a thin
    // progress bar. ~⅔ the height of the previous block; carousel below
    // becomes the visual headline.
    <div
      className="mx-3 mt-2 rounded-[6px] border-[1.5px] border-ink px-[12px] py-[8px]"
      style={{ backgroundColor: '#facc15' }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="truncate text-[12px] font-bold leading-tight">
          Reach <span className="text-accent">R{teaser.nextRank}</span> →{' '}
          <span className="text-accent">{teaser.nextUnlock.name}</span>
        </div>
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.06em] text-ink/70">
          {teaser.xpToNext} XP
        </span>
      </div>
      <div className="mt-[6px] h-[4px] w-full overflow-hidden rounded-[2px] border border-ink bg-paper">
        <div className="h-full bg-ink" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
    </div>
  );
}
