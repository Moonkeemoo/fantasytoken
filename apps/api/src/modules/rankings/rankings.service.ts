import type { RankingMode } from '@fantasytoken/shared';

export interface RankingRow {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  tierRank: number;
  netPnlCents: number;
  bullPnlCents: number;
  bearPnlCents: number;
  contestsPlayed: number;
}

export interface RankingsRepo {
  /** Aggregate per-mode PnL for given users. Shape is mode-agnostic; caller picks sort axis. */
  netPnlForUsers(userIds: string[]): Promise<Map<string, RankingRow>>;
  /** Top N users by `mode`-specific PnL. */
  topGlobal(limit: number, mode: RankingMode): Promise<RankingRow[]>;
  /** Aggregate row for a single user (legacy single-user lookup). */
  netPnlForUser(userId: string): Promise<RankingRow | null>;
  /** Global rank (1-indexed) of a single user along the given sort axis. */
  globalRankOf(userId: string, mode: RankingMode): Promise<number | null>;
}

interface RankingResultRow {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  tierRank: number;
  netPnlCents: number;
  bullPnlCents: number;
  bearPnlCents: number;
  contestsPlayed: number;
  isMe: boolean;
}

export interface RankingsService {
  getFriends(args: {
    userId: string;
    friendIds: string[];
    mode: RankingMode;
  }): Promise<{ rows: RankingResultRow[] }>;
  getGlobal(args: { userId?: string; limit: number; mode: RankingMode }): Promise<{
    top: RankingResultRow[];
    me: Omit<RankingResultRow, 'isMe'> | null;
  }>;
}

export interface RankingsServiceDeps {
  repo: RankingsRepo;
}

function pickSortKey(row: RankingRow, mode: RankingMode): number {
  if (mode === 'bull') return row.bullPnlCents;
  if (mode === 'bear') return row.bearPnlCents;
  return row.netPnlCents;
}

function toResultRow(r: RankingRow, rank: number, isMe: boolean): RankingResultRow {
  return {
    rank,
    userId: r.userId,
    displayName: r.displayName,
    avatarUrl: r.avatarUrl,
    tierRank: r.tierRank,
    netPnlCents: r.netPnlCents,
    bullPnlCents: r.bullPnlCents,
    bearPnlCents: r.bearPnlCents,
    contestsPlayed: r.contestsPlayed,
    isMe,
  };
}

export function createRankingsService(deps: RankingsServiceDeps): RankingsService {
  return {
    async getFriends({ userId, friendIds, mode }) {
      const ids = [userId, ...friendIds];
      const map = await deps.repo.netPnlForUsers(ids);
      const list = ids
        .map((id) => map.get(id))
        .filter((r): r is RankingRow => r !== undefined)
        .sort((a, b) => pickSortKey(b, mode) - pickSortKey(a, mode));
      return {
        rows: list.map((r, i) => toResultRow(r, i + 1, r.userId === userId)),
      };
    },

    async getGlobal({ userId, limit, mode }) {
      const top = await deps.repo.topGlobal(limit, mode);
      const topRows = top.map((r, i) => toResultRow(r, i + 1, r.userId === userId));

      let me: { rank: number } & Omit<RankingResultRow, 'rank' | 'isMe'> = null as never;
      let appended: Omit<RankingResultRow, 'isMe'> | null = null;
      if (userId && !topRows.some((r) => r.userId === userId)) {
        const myRow = await deps.repo.netPnlForUser(userId);
        const myRank = await deps.repo.globalRankOf(userId, mode);
        if (myRow && myRank !== null) {
          appended = {
            rank: myRank,
            userId: myRow.userId,
            displayName: myRow.displayName,
            avatarUrl: myRow.avatarUrl,
            tierRank: myRow.tierRank,
            netPnlCents: myRow.netPnlCents,
            bullPnlCents: myRow.bullPnlCents,
            bearPnlCents: myRow.bearPnlCents,
            contestsPlayed: myRow.contestsPlayed,
          };
        }
      }
      void me;
      return { top: topRows, me: appended };
    },
  };
}
