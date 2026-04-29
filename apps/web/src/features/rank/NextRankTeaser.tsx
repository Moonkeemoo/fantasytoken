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
        className="m-3 rounded-[6px] border-[1.5px] border-ink px-[14px] py-3"
        style={{ backgroundColor: '#facc15' }}
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.08em]">
          mythic crown · {rank.xpSeason} XP this season
        </div>
        <div className="mt-1 text-[14px] font-bold leading-tight">
          Defend your spot — top season XP wins.
        </div>
      </div>
    );
  }

  const ratio = Math.min(1, rank.xpInRank / Math.max(1, rank.xpForRank));
  return (
    <div
      className="m-3 rounded-[6px] border-[1.5px] border-ink px-[14px] py-3"
      style={{ backgroundColor: '#facc15' }}
    >
      <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-ink/70">
        <span>next unlock</span>
        <span>{teaser.xpToNext} XP to go</span>
      </div>
      <div className="mt-[2px] text-[13px] font-bold leading-snug">
        Reach <span className="text-accent">Rank {teaser.nextRank}</span> to unlock{' '}
        <span className="text-accent">{teaser.nextUnlock.name}</span>
      </div>
      <div className="mt-2 h-[6px] w-full overflow-hidden rounded-[3px] border-[1.5px] border-ink bg-paper">
        <div className="h-full bg-ink" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] text-ink/70">
        <span>{rank.xpInRank} XP</span>
        <span>{rank.xpForRank} XP</span>
      </div>
    </div>
  );
}
