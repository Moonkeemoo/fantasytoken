import type { ResultResponse } from '@fantasytoken/shared';

export interface ResultEntrySnapshot {
  entryId: string;
  userId: string | null;
  isBot: boolean;
  submittedAt: Date;
  picks: Array<{ symbol: string; alloc: number }>;
  finalScore: number; // from entries.final_score (0 if not yet finalized — caller should not invoke for non-terminal contests)
  prizeCents: number;
}

export interface ResultRepo {
  getContest(id: string): Promise<{
    id: string;
    name: string;
    status: 'scheduled' | 'active' | 'finalizing' | 'finalized' | 'cancelled';
    prizePoolCents: number;
    entryFeeCents: number;
  } | null>;
  getEntries(contestId: string): Promise<ResultEntrySnapshot[]>;
  findMyEntry(
    contestId: string,
    userId?: string,
    entryId?: string,
  ): Promise<ResultEntrySnapshot | null>;
  getPriceSnapshots(contestId: string): Promise<Map<string, { start: number; end: number }>>;
  hasRefund(entryId: string): Promise<boolean>;
  getImagesBySymbols(symbols: string[]): Promise<Map<string, string | null>>;
}

export interface ResultServiceDeps {
  repo: ResultRepo;
}

export interface ResultService {
  get(args: {
    contestId: string;
    userId?: string;
    entryId?: string;
  }): Promise<ResultResponse | null>;
}

export function createResultService(deps: ResultServiceDeps): ResultService {
  return {
    async get({ contestId, userId, entryId }) {
      const contest = await deps.repo.getContest(contestId);
      if (!contest) return null;
      if (contest.status !== 'finalized' && contest.status !== 'cancelled') return null;

      const myEntry = await deps.repo.findMyEntry(contestId, userId, entryId);
      if (!myEntry) return null;

      const allEntries = await deps.repo.getEntries(contestId);
      const prices = await deps.repo.getPriceSnapshots(contestId);

      // Sort all entries by finalScore DESC, submittedAt ASC.
      const sorted = [...allEntries].sort((a, b) => {
        if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
        return a.submittedAt.getTime() - b.submittedAt.getTime();
      });
      const finalRank = sorted.findIndex((e) => e.entryId === myEntry.entryId) + 1;
      const realEntries = sorted.filter((e) => !e.isBot).length;

      // Outcome.
      let outcome: 'won' | 'no_prize' | 'cancelled';
      let netCents: number;
      if (contest.status === 'cancelled') {
        outcome = 'cancelled';
        const refunded = await deps.repo.hasRefund(myEntry.entryId);
        netCents = refunded ? 0 : -contest.entryFeeCents;
      } else if (myEntry.prizeCents > 0) {
        outcome = 'won';
        netCents = myEntry.prizeCents - contest.entryFeeCents;
      } else {
        outcome = 'no_prize';
        netCents = -contest.entryFeeCents;
      }

      // Lineup recap with per-pick % change.
      const images = await deps.repo.getImagesBySymbols(myEntry.picks.map((p) => p.symbol));
      const lineupFinal = myEntry.picks.map((p) => {
        const pr = prices.get(p.symbol);
        const pct = pr && pr.start > 0 ? (pr.end - pr.start) / pr.start : 0;
        return {
          symbol: p.symbol,
          imageUrl: images.get(p.symbol) ?? null,
          alloc: p.alloc,
          finalPlPct: pct,
        };
      });

      return {
        contestId: contest.id,
        contestName: contest.name,
        outcome,
        prizeCents: myEntry.prizeCents,
        entryFeeCents: contest.entryFeeCents,
        netCents,
        finalPlPct: myEntry.finalScore,
        finalRank: finalRank > 0 ? finalRank : null,
        totalEntries: sorted.length,
        realEntries,
        lineupFinal,
      };
    },
  };
}
