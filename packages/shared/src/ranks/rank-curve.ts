// 30-rank progression ladder, 6 tiers × 5 sub-ranks. Thresholds are cumulative XP
// (geometric ~b=1.22, eyeballed for psychologically nice numbers — see RANK_SYSTEM.md §1.3).
export const RANK_THRESHOLDS = [
  0,
  30,
  80,
  150,
  250, // Newbie I-V
  400,
  600,
  850,
  1150,
  1500, // Trader I-V
  2000,
  2600,
  3300,
  4100,
  5000, // Degen I-V
  6200,
  7500,
  9000,
  10800,
  12800, // Whale I-V
  15000,
  17500,
  20500,
  24000,
  28000, // Legend I-V
  33000,
  39000,
  46000,
  54000,
  65000, // Mythic I-V
] as const;

export const MAX_RANK = 30;

export interface TierGroup {
  name: string;
  /** [first_rank, last_rank] inclusive, 1-based. */
  ranks: readonly [number, number];
  color: string;
}

export const TIER_GROUPS: readonly TierGroup[] = [
  { name: 'Newbie', ranks: [1, 5], color: '#8a8478' },
  { name: 'Trader', ranks: [6, 10], color: '#6b8e6b' },
  { name: 'Degen', ranks: [11, 15], color: '#5a7ba8' },
  { name: 'Whale', ranks: [16, 20], color: '#8a5fa8' },
  { name: 'Legend', ranks: [21, 25], color: '#c97a3a' },
  { name: 'Mythic', ranks: [26, 30], color: '#d4441c' },
] as const;

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

export interface RankInfo {
  /** 1..MAX_RANK */
  rank: number;
  tier: string;
  tierRoman: string;
  /** "Trader II" — for `Rank 7 · Trader II` rendering, prefix the rank yourself. */
  display: string;
  color: string;
}

function tierFor(rank: number): TierGroup {
  for (const t of TIER_GROUPS) {
    if (rank >= t.ranks[0] && rank <= t.ranks[1]) return t;
  }
  // Cap at last tier.
  return TIER_GROUPS[TIER_GROUPS.length - 1]!;
}

/** Pure: highest rank whose threshold ≤ xp. Capped at MAX_RANK. */
export function rankFromXp(xp: number): RankInfo {
  if (xp < 0 || !Number.isFinite(xp)) xp = 0;
  let rank = 1;
  for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= RANK_THRESHOLDS[i]!) {
      rank = i + 1;
      break;
    }
  }
  const tier = tierFor(rank);
  const subIndex = rank - tier.ranks[0]; // 0..4
  const tierRoman = ROMAN[subIndex] ?? 'V';
  return {
    rank,
    tier: tier.name,
    tierRoman,
    display: `${tier.name} ${tierRoman}`,
    color: tier.color,
  };
}

export interface XpProgress {
  /** Cumulative XP. */
  xp: number;
  /** Current rank's threshold. */
  thresholdLow: number;
  /** Next rank's threshold (or current threshold if at MAX_RANK). */
  thresholdHigh: number;
  /** xp − thresholdLow, clamped ≥ 0. */
  xpInRank: number;
  /** thresholdHigh − thresholdLow (1 if at MAX_RANK to avoid div-by-zero on the UI side). */
  xpForRank: number;
  /** thresholdHigh − xp, clamped ≥ 0. 0 if at MAX_RANK. */
  remainingToNext: number;
  /** True if user is on rank MAX_RANK (no more progression). */
  atMax: boolean;
}

/** Pure: progress of `xp` within the current rank, plus remaining to next. */
export function xpToNextRank(xp: number): XpProgress {
  if (xp < 0 || !Number.isFinite(xp)) xp = 0;
  const info = rankFromXp(xp);
  const atMax = info.rank >= MAX_RANK;
  const thresholdLow = RANK_THRESHOLDS[info.rank - 1]!;
  const thresholdHigh = atMax ? thresholdLow : RANK_THRESHOLDS[info.rank]!;
  const xpInRank = Math.max(0, xp - thresholdLow);
  const xpForRank = atMax ? 1 : thresholdHigh - thresholdLow;
  const remainingToNext = atMax ? 0 : Math.max(0, thresholdHigh - xp);
  return { xp, thresholdLow, thresholdHigh, xpInRank, xpForRank, remainingToNext, atMax };
}

/** Pure: soft season reset — drop 5 ranks, capped at Rank 5 minimum. */
export function applySeasonReset(currentRank: number): number {
  return Math.max(5, currentRank - 5);
}
