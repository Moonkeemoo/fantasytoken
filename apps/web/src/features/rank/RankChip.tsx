import { useNavigate } from 'react-router-dom';
import type { RankResponse } from '@fantasytoken/shared';
import { TierIcon } from './TierIcon.js';

/**
 * Compact ladder chip — TierIcon evolves with tier, display + XP progress on right.
 * Visually identical to Profile rank section's tier icon for continuity.
 */
export function RankChip({ rank }: { rank: RankResponse }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate('/me')}
      className="flex items-center gap-[6px] rounded-[3px] border-[1.5px] border-ink bg-ink px-[5px] py-[3px] text-paper"
    >
      <TierIcon rank={rank.currentRank} size={18} />
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.04em]">
        {rank.display}
      </span>
      <span className="font-mono text-[9px] text-paper/70">
        {rank.atMax ? 'MAX' : `${rank.xpInRank}/${rank.xpForRank}`}
      </span>
    </button>
  );
}
