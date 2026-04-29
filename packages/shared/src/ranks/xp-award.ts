// Pure XP-award calculator. Inputs are the user's contest result + that contest's
// xp_multiplier; returns a structured breakdown so UI can fade rows in 1-by-1.

export interface ContestResult {
  /** 1-based finish position in the contest, against the full room (incl. bots).
   * Matches the rank shown in the result UI ("rank #N of M"). */
  position: number;
  /** Total entries in the room (real + bot). Used for the top-30% fallback bonus. */
  totalRealUsers: number;
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

function positionBonus(position: number, totalRealUsers: number): number {
  if (position < 1) return 0;
  if (position === 1) return 100;
  if (position === 2) return 60;
  if (position === 3) return 40;
  if (position === 4 || position === 5) return 25;
  if (position >= 6 && position <= 10) return 15;
  // Inside top 30% of real users → +5
  const top30 = Math.max(1, Math.floor(totalRealUsers * 0.3));
  if (position <= top30) return 5;
  return 0;
}

function positionLabel(position: number): string {
  if (position === 1) return '1st place bonus';
  if (position === 2) return '2nd place bonus';
  if (position === 3) return '3rd place bonus';
  return `Position bonus (#${position})`;
}

/** Pure: compute xp + breakdown for a single user's contest result. */
export function awardXp(r: ContestResult): XpAward {
  const participation = PARTICIPATION_XP;
  const position = positionBonus(r.position, r.totalRealUsers);
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
