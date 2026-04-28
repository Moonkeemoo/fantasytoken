import { computePrizeCurve } from '@fantasytoken/shared';

export interface FinalizeInputEntry {
  entryId: string;
  isBot: boolean;
  userId: string | null;
  submittedAt: Date;
  picks: Array<{ symbol: string; alloc: number }>;
}

export interface FinalizeArgs {
  entries: FinalizeInputEntry[];
  prices: Map<string, { start: number; end: number }>;
  prizePoolCents: number;
  /** 'bull' = highest P&L wins; 'bear' = most-losing P&L wins (rank ASC). Default 'bull'. */
  contestType?: 'bull' | 'bear';
}

export interface FinalizedEntry {
  entryId: string;
  isBot: boolean;
  userId: string | null;
  finalScore: number;
  finalRank: number;
  prizeCents: number;
}

export interface PayoutPlan {
  entryId: string;
  userId: string;
  cents: number;
}

export interface FinalizeResult {
  entries: FinalizedEntry[];
  payouts: PayoutPlan[];
}

export function finalizeContest(args: FinalizeArgs): FinalizeResult {
  const { entries, prices, prizePoolCents, contestType = 'bull' } = args;
  const dir = contestType === 'bear' ? -1 : 1;

  const scored = entries.map((e) => ({
    entry: e,
    score: scoreOf(e.picks, prices),
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) return dir * (b.score - a.score);
    return a.entry.submittedAt.getTime() - b.entry.submittedAt.getTime();
  });

  const displayEntries: FinalizedEntry[] = scored.map((s, i) => ({
    entryId: s.entry.entryId,
    isBot: s.entry.isBot,
    userId: s.entry.userId,
    finalScore: s.score,
    finalRank: i + 1,
    prizeCents: 0,
  }));

  const realScored = scored.filter((s) => !s.entry.isBot);
  const realCount = realScored.length;
  const curve = computePrizeCurve(realCount, prizePoolCents);

  const payouts: PayoutPlan[] = [];
  realScored.forEach((s, i) => {
    const realRank = i + 1;
    const cents = curve.get(realRank) ?? 0;
    if (cents > 0 && s.entry.userId) {
      payouts.push({ entryId: s.entry.entryId, userId: s.entry.userId, cents });
      const display = displayEntries.find((d) => d.entryId === s.entry.entryId);
      if (display) display.prizeCents = cents;
    }
  });

  return { entries: displayEntries, payouts };
}

function scoreOf(
  picks: Array<{ symbol: string; alloc: number }>,
  prices: Map<string, { start: number; end: number }>,
): number {
  return picks.reduce((sum, p) => {
    const pr = prices.get(p.symbol);
    if (!pr || pr.start <= 0) return sum;
    const pct = (pr.end - pr.start) / pr.start;
    return sum + (p.alloc / 100) * pct;
  }, 0);
}
