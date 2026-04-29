// Content unlock catalog (RANK_SYSTEM.md §3). Sparse — only ranks that gate something.
// Used by /lobby/teaser to show "Reach Rank N · Tier to unlock X" + by frontend
// to dim/lock contest cards.

export interface RankUnlock {
  rank: number;
  name: string;
  type: 'contest' | 'cosmetic' | 'feature';
  description: string;
}

export const RANK_UNLOCKS: readonly RankUnlock[] = [
  // Practice (R1) is the starter free contest — no teaser entry since
  // it's available the moment you sign up.
  {
    rank: 2,
    name: 'Quick Match',
    type: 'contest',
    description: '$1 entry · first real-money pool',
  },
  {
    rank: 3,
    name: 'Bear Trap',
    type: 'contest',
    description: 'Most-losing wins · core differentiator',
  },
  {
    rank: 4,
    name: 'Profile badge slot',
    type: 'cosmetic',
    description: 'Cosmetic badge on your profile',
  },
  {
    rank: 5,
    name: 'Memecoin Madness',
    type: 'contest',
    description: '$5 themed lineup',
  },
  {
    rank: 7,
    name: 'High-Stakes Quick Match',
    type: 'contest',
    description: '$10-entry · bigger pool',
  },
  {
    rank: 8,
    name: 'Custom Share-Card themes',
    type: 'cosmetic',
    description: 'Choose how your wins look in chat',
  },
  {
    rank: 10,
    name: 'Trader Cup',
    type: 'contest',
    description: 'Weekly tournament for ranks 10-14',
  },
  {
    rank: 12,
    name: 'Bear Apocalypse',
    type: 'contest',
    description: '$25 Bear contest with massive pool',
  },
  {
    rank: 14,
    name: 'Animated badge effects',
    type: 'cosmetic',
    description: 'Premium look on leaderboards',
  },
  {
    rank: 15,
    name: 'Degen-only contests',
    type: 'contest',
    description: 'Higher prizes, gated entry',
  },
  {
    rank: 18,
    name: 'Whale Vault',
    type: 'contest',
    description: 'Premium contests · largest prize pools',
  },
  {
    rank: 20,
    name: 'Gold username on rankings',
    type: 'cosmetic',
    description: 'Whale+ tier visual flex',
  },
  {
    rank: 23,
    name: 'Legend League',
    type: 'contest',
    description: 'Exclusive monthly tournament',
  },
  {
    rank: 30,
    name: 'Mythic Cup',
    type: 'contest',
    description: 'Top stake monthly · "I am the storm"',
  },
] as const;

/** Returns the first unlock at rank > current. null if user is at MAX_RANK or beyond. */
export function nextUnlockAfter(currentRank: number): RankUnlock | null {
  for (const u of RANK_UNLOCKS) {
    if (u.rank > currentRank) return u;
  }
  return null;
}
