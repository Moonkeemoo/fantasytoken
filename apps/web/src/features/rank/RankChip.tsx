import { useNavigate } from 'react-router-dom';
import type { RankResponse } from '@fantasytoken/shared';

/**
 * Compact ladder chip — `(7) Trader II · 240/350 XP`. Rank-circle on left
 * (filled with tier color), display + XP progress on right. Tap → /me.
 */
export function RankChip({ rank }: { rank: RankResponse }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate('/me')}
      className="flex items-center gap-[6px] rounded-[3px] border-[1.5px] border-ink bg-ink px-[5px] py-[3px] text-paper"
    >
      <span
        className="flex h-[18px] w-[18px] items-center justify-center rounded-full font-mono text-[10px] font-extrabold text-ink"
        style={{ backgroundColor: rank.color }}
      >
        {rank.currentRank}
      </span>
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.04em]">
        {rank.display}
      </span>
      <span className="font-mono text-[9px] text-paper/70">
        {rank.atMax ? 'MAX' : `${rank.xpInRank}/${rank.xpForRank}`}
      </span>
    </button>
  );
}
