// Pure XP-award calculator. Inputs are the user's contest result + that contest's
// xp_multiplier; returns a structured breakdown so UI can fade rows in 1-by-1.

export interface ContestResult {
  /** 1-based finish position in the contest, against the full room (incl. bots).
   * Matches the rank shown in the result UI ("rank #N of M"). */
  position: number;
  /** Total entries in the room (real + bot). Drives the top-50% bonus cutoff. */
  totalEntries: number;
  /** Stored on contests table, accounts for tier + bear etc; 1.0 = baseline. */
  contestMultiplier: number;
  /** Used purely so the breakdown can label "Bear contest ×1.5". */
  contestType?: 'bull' | 'bear';
}

export interface XpBreakdownRow {
  /** Display label, e.g. "Participation" / "3rd place bonus" / "Bear contest ×1.5". */
  reason: string;
  /** Δxp this row contributes, after multipliers (so the rows literally sum to total). */
  amount: number;
}

export interface XpAward {
  participation: number;
  position: number;
  bonusMultiplier: number;
  total: number;
  breakdown: XpBreakdownRow[];
}

export const PARTICIPATION_XP = 10;
const PODIUM_BONUSES: Record<number, number> = { 1: 100, 2: 60, 3: 40 };
const MID_PEAK_BONUS = 25; // bonus at position #4 in a large room
const MID_FLOOR_BONUS = 5; // bonus at the last paying position (= floor(N/2))

/**
 * Bonus scales with position **relative to room size** so a 5th-of-10 finish
 * and a 10th-of-20 finish both feel like "you made the top half". Anything
 * past the median earns participation only — no XP for the bottom half.
 *
 *   cutoff = floor(totalEntries / 2)   (must be ≥ 1)
 *   position > cutoff       → 0
 *   position 1 / 2 / 3      → 100 / 60 / 40 (podium emphasis preserved)
 *   position 4 .. cutoff    → linear from MID_PEAK (#4) down to MID_FLOOR (cutoff)
 *
 * If the room is too small to have a "mid" band (cutoff ≤ 3), the linear
 * branch is skipped — only podium positions get a bonus.
 */
function positionBonus(position: number, totalEntries: number): number {
  if (position < 1) return 0;
  const cutoff = Math.max(1, Math.floor(totalEntries / 2));
  if (position > cutoff) return 0;
  const podium = PODIUM_BONUSES[position];
  if (podium !== undefined) return podium;
  if (cutoff <= 3) return 0;
  // share = 1.0 at p=4, 0.0 at p=cutoff → linear interpolation between peak and floor.
  const share = (cutoff - position) / (cutoff - 3);
  return Math.round(MID_FLOOR_BONUS + (MID_PEAK_BONUS - MID_FLOOR_BONUS) * share);
}

function positionLabel(position: number): string {
  if (position === 1) return '1st place bonus';
  if (position === 2) return '2nd place bonus';
  if (position === 3) return '3rd place bonus';
  return `Top-half bonus (#${position})`;
}

/** Pure: compute xp + breakdown for a single user's contest result. */
export function awardXp(r: ContestResult): XpAward {
  const participation = PARTICIPATION_XP;
  const position = positionBonus(r.position, r.totalEntries);
  const baseSum = participation + position;
  const bonusMultiplier = r.contestMultiplier > 0 ? r.contestMultiplier : 1;
  const total = Math.ceil(baseSum * bonusMultiplier);

  // Build breakdown so the rows literally sum to `total`. The multiplier is shown
  // as its own row carrying the delta vs the baseline (= base × (mult − 1)),
  // rounded to keep the visual breakdown honest.
  const breakdown: XpBreakdownRow[] = [];
  breakdown.push({ reason: 'Participation', amount: participation });
  if (position > 0) {
    breakdown.push({ reason: positionLabel(r.position), amount: position });
  }
  if (bonusMultiplier !== 1) {
    const multDelta = total - baseSum;
    if (multDelta !== 0) {
      const label =
        r.contestType === 'bear' && bonusMultiplier === 1.5
          ? 'Bear contest ×1.5'
          : `Multiplier ×${bonusMultiplier}`;
      breakdown.push({ reason: label, amount: multDelta });
    }
  }
  return { participation, position, bonusMultiplier, total, breakdown };
}
