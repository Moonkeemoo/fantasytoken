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
  // Display the rank where the unlock actually gates (e.g. Bear Trap @ R3),
  // NOT the immediately-next rank. The two diverge whenever there's a gap
  // between unlocks (R1 → R3 etc.) and showing "R2 → Bear Trap" while the
  // contest list says "RANK 3" was confusing players.
  const targetRank = teaser.nextUnlock.rank;
  return (
    <div
      className="mx-3 mt-2 rounded-[6px] border-[1.5px] border-ink px-[12px] py-[10px]"
      style={{ backgroundColor: '#facc15' }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[11px] font-mono uppercase tracking-[0.06em] text-ink/70">
          Next unlock
        </div>
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.06em] text-ink/70">
          R{rank.currentRank} → R{targetRank}
        </span>
      </div>
      <div className="mt-[2px] text-[14px] font-extrabold leading-tight">
        <span className="text-accent">{teaser.nextUnlock.name}</span>
        <span className="ml-[6px] rounded-[3px] border-[1.5px] border-ink bg-paper px-[5px] py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-ink">
          R{targetRank}
        </span>
      </div>
      <p className="mt-[2px] text-[11px] leading-snug text-ink/80">
        {teaser.nextUnlock.description}
      </p>
      <div className="mt-[6px] flex items-center gap-2">
        <div className="h-[5px] flex-1 overflow-hidden rounded-[2px] border border-ink bg-paper">
          <div className="h-full bg-ink" style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
        <span className="shrink-0 font-mono text-[10px] font-bold tracking-tight text-ink">
          {teaser.xpToNext} XP
        </span>
      </div>
    </div>
  );
}
