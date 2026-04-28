import {
  computeActualPrizeCents,
  computePrizeCurve,
  type LiveResponse,
  type LeaderboardEntry,
  type LineupRow,
} from '@fantasytoken/shared';

export interface EntrySnapshot {
  entryId: string;
  isBot: boolean;
  userId: string | null;
  botHandle: string | null;
  submittedAt: Date;
  picks: { symbol: string; alloc: number }[];
}

export interface ContestSnapshot {
  id: string;
  name: string;
  status: 'scheduled' | 'active' | 'finalizing' | 'finalized' | 'cancelled';
  startsAt: Date;
  endsAt: Date;
  /** Guaranteed minimum (overlay floor). Actual pool is computed from real entries × fee × (1-rake). */
  prizePoolCents: number;
  entryFeeCents: number;
  type: 'bull' | 'bear';
}

export interface LeaderboardRepo {
  getContest(id: string): Promise<ContestSnapshot | null>;
  getEntries(contestId: string): Promise<EntrySnapshot[]>;
  getPriceSnapshots(contestId: string, phase: 'start' | 'end'): Promise<Map<string, number>>;
  getCurrentPrices(symbols: string[]): Promise<Map<string, number>>;
  getMyEntry(contestId: string, userId: string): Promise<EntrySnapshot | null>;
  getDisplayNameForUser(userId: string): Promise<string>;
  getImagesBySymbols(symbols: string[]): Promise<Map<string, string | null>>;
}

export interface LeaderboardServiceDeps {
  repo: LeaderboardRepo;
  rakePct: number;
}

export interface LeaderboardService {
  getLive(args: { contestId: string; userId?: string }): Promise<LiveResponse | null>;
}

export function createLeaderboardService(deps: LeaderboardServiceDeps): LeaderboardService {
  return {
    async getLive({ contestId, userId }) {
      const contest = await deps.repo.getContest(contestId);
      if (!contest) return null;

      const entries = await deps.repo.getEntries(contestId);
      const startPrices = await deps.repo.getPriceSnapshots(contestId, 'start');
      const allSymbols = [...new Set(entries.flatMap((e) => e.picks.map((p) => p.symbol)))];
      const currentPrices = await deps.repo.getCurrentPrices(allSymbols);

      // Compute score per entry.
      const scored = entries.map((e) => {
        const score = scoreOf(e.picks, startPrices, currentPrices);
        return { entry: e, score };
      });

      // Sort by score (DESC for bull, ASC for bear), submittedAt ASC tie-breaker.
      const dir = contest.type === 'bear' ? -1 : 1;
      scored.sort((a, b) => {
        if (b.score !== a.score) return dir * (b.score - a.score);
        return a.entry.submittedAt.getTime() - b.entry.submittedAt.getTime();
      });

      // Build display rows (mixed real + bot).
      const totalEntries = scored.length;
      const realEntries = scored.filter((s) => !s.entry.isBot).length;

      const display: LeaderboardEntry[] = await Promise.all(
        scored.map(async (s, i) => {
          const isMe = !!userId && s.entry.userId === userId;
          let displayName: string;
          if (s.entry.isBot) {
            displayName = s.entry.botHandle ?? 'bot';
          } else if (s.entry.userId) {
            displayName = await deps.repo.getDisplayNameForUser(s.entry.userId);
          } else {
            displayName = '—';
          }
          return {
            rank: i + 1,
            entryId: s.entry.entryId,
            isBot: s.entry.isBot,
            displayName,
            scorePct: s.score,
            isMe,
          };
        }),
      );

      // Find user's row.
      const userRow = userId ? (display.find((d) => d.isMe) ?? null) : null;

      // Projected prize: among real entries only, find user's real-rank, apply curve.
      // Pool is dynamic — derived from real entries × fee × (1-rake), with prize_pool_cents as floor.
      const actualPoolCents = computeActualPrizeCents({
        realCount: realEntries,
        entryFeeCents: contest.entryFeeCents,
        rakePct: deps.rakePct,
        guaranteedPoolCents: contest.prizePoolCents,
      });
      let projectedPrizeCents = 0;
      let userRank: number | null = null;
      if (userId && userRow) {
        userRank = userRow.rank;
        const realScored = scored.filter((s) => !s.entry.isBot);
        realScored.sort((a, b) => {
          if (b.score !== a.score) return dir * (b.score - a.score);
          return a.entry.submittedAt.getTime() - b.entry.submittedAt.getTime();
        });
        const realRank = realScored.findIndex((s) => s.entry.userId === userId) + 1;
        if (realRank > 0) {
          const curve = computePrizeCurve(realEntries, actualPoolCents);
          projectedPrizeCents = curve.get(realRank) ?? 0;
        }
      }

      // Lineup with per-pick perf for the user.
      let lineup: LineupRow[] = [];
      if (userId) {
        const my = await deps.repo.getMyEntry(contestId, userId);
        if (my) {
          const images = await deps.repo.getImagesBySymbols(my.picks.map((p) => p.symbol));
          lineup = my.picks.map((p) => {
            const start = startPrices.get(p.symbol) ?? null;
            const cur = currentPrices.get(p.symbol) ?? null;
            const pct = start && cur && start > 0 ? (cur - start) / start : 0;
            return {
              symbol: p.symbol,
              imageUrl: images.get(p.symbol) ?? null,
              alloc: p.alloc,
              pctChange: pct,
              contribUsd: (p.alloc / 100) * pct * 100,
            };
          });
        }
      }

      const myScore = userRow?.scorePct ?? 0;

      return {
        contestId: contest.id,
        contestName: contest.name,
        status: contest.status,
        startsAt: contest.startsAt.toISOString(),
        endsAt: contest.endsAt.toISOString(),
        portfolio: {
          startUsd: 100,
          currentUsd: 100 * (1 + myScore),
          plPct: myScore,
        },
        rank: userRank,
        totalEntries,
        realEntries,
        projectedPrizeCents,
        lineup,
        leaderboardTop: display.slice(0, 3),
        leaderboardAll: display.slice(0, 100),
        userRow,
      };
    },
  };
}

function scoreOf(
  picks: { symbol: string; alloc: number }[],
  startPrices: Map<string, number>,
  currentPrices: Map<string, number>,
): number {
  return picks.reduce((sum, p) => {
    const start = startPrices.get(p.symbol);
    const cur = currentPrices.get(p.symbol);
    if (start === undefined || cur === undefined || start <= 0) return sum;
    const pct = (cur - start) / start;
    return sum + (p.alloc / 100) * pct;
  }, 0);
}
