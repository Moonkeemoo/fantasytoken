import { rankFromXp, RANK_THRESHOLDS } from '@fantasytoken/shared';

export interface TierIconProps {
  /** 1..30 */
  rank: number;
  /** Rendered side length in px. Defaults to 28. */
  size?: number;
  /** Whether to show the rank number inside. Defaults to true. */
  showNumber?: boolean;
}

/**
 * Tier visual evolves with rank (RANK_SYSTEM.md §5.8):
 *   - Newbie: square
 *   - Trader: rounded square
 *   - Degen: rounded with 2px outer ring
 *   - Whale: rounded with 3px gold ring (premium)
 *   - Legend: shield-shape (clipped top)
 *   - Mythic: shield + crown ribbon
 *
 * All tiers share the same color-from-tier baseline so they're visually consistent
 * with the RankChip and Profile rank section.
 */
export function TierIcon({ rank, size = 28, showNumber = true }: TierIconProps) {
  // Look up tier color by mapping rank → its threshold's RankInfo. Threshold of
  // current rank is `RANK_THRESHOLDS[rank-1]`; rankFromXp on that gives back the
  // RankInfo with color/tier name.
  const thresholdXp = RANK_THRESHOLDS[Math.max(0, Math.min(29, rank - 1))]!;
  const info = rankFromXp(thresholdXp);
  const tier = info.tier;

  const radius =
    tier === 'Newbie'
      ? '2px'
      : tier === 'Trader'
        ? '4px'
        : tier === 'Degen' || tier === 'Whale'
          ? '6px'
          : '50% 50% 6px 6px'; // Legend/Mythic = shield top-rounded only

  const ring =
    tier === 'Whale'
      ? '0 0 0 2px #f6f1e8, 0 0 0 4px #c9a227'
      : tier === 'Legend'
        ? '0 0 0 2px #f6f1e8, 0 0 0 3px #c97a3a'
        : tier === 'Mythic'
          ? '0 0 0 2px #f6f1e8, 0 0 0 3px #d4441c'
          : 'none';

  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size }}>
      {tier === 'Mythic' && (
        <span
          className="absolute -top-[6px] z-10 text-[10px]"
          style={{ lineHeight: 1, filter: 'drop-shadow(1px 1px 0 #1a1814)' }}
        >
          👑
        </span>
      )}
      <span
        className="flex items-center justify-center border-[1.5px] border-ink font-extrabold text-ink"
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: info.color,
          boxShadow: ring,
          fontSize: size <= 22 ? '10px' : size <= 32 ? '12px' : '16px',
        }}
      >
        {showNumber ? rank : ''}
      </span>
    </span>
  );
}
