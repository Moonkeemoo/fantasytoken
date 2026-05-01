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
      // Neutral chrome: thin paper-dim background instead of the heavy
      // ink fill — competing with the wallet pill and primary CTAs in
      // the header. Stays clickable, just stops shouting.
      className="flex items-center gap-[6px] rounded-[3px] border border-rule bg-paper-dim px-[5px] py-[3px] text-ink-soft"
    >
      <TierIcon rank={rank.currentRank} size={18} />
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.04em]">
        {rank.display}
      </span>
      <span className="font-mono text-[9px] text-muted">
        {rank.atMax ? 'MAX' : `${rank.xpInRank}/${rank.xpForRank}`}
      </span>
    </button>
  );
}
