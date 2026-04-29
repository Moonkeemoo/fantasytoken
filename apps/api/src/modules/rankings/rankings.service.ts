export interface RankingRow {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  tierRank: number;
  netPnlCents: number;
  contestsPlayed: number;
}

export interface RankingsRepo {
  /** Aggregate net P&L (sum of ENTRY_FEE+PRIZE_PAYOUT+REFUND deltas) for given users. */
  netPnlForUsers(userIds: string[]): Promise<Map<string, RankingRow>>;
  /** Top N users by net P&L globally. */
  topGlobal(limit: number): Promise<RankingRow[]>;
  /** Net P&L row for a single user (used to append "you" if outside top N). */
  netPnlForUser(userId: string): Promise<RankingRow | null>;
  /** Global rank (1-indexed) of a single user across all users with any gameplay tx. */
  globalRankOf(userId: string): Promise<number | null>;
}

export interface RankingsService {
  getFriends(args: { userId: string; friendIds: string[] }): Promise<{
    rows: Array<{
      rank: number;
      userId: string;
      displayName: string;
      avatarUrl: string | null;
      netPnlCents: number;
      contestsPlayed: number;
      isMe: boolean;
    }>;
  }>;
  getGlobal(args: { userId?: string; limit: number }): Promise<{
    top: Array<{
      rank: number;
      userId: string;
      displayName: string;
      avatarUrl: string | null;
      netPnlCents: number;
      contestsPlayed: number;
      isMe: boolean;
    }>;
    me: {
      rank: number;
      userId: string;
      displayName: string;
      avatarUrl: string | null;
      tierRank: number;
      netPnlCents: number;
      contestsPlayed: number;
    } | null;
  }>;
}

export interface RankingsServiceDeps {
  repo: RankingsRepo;
}

export function createRankingsService(deps: RankingsServiceDeps): RankingsService {
  return {
    async getFriends({ userId, friendIds }) {
      const ids = [userId, ...friendIds];
      const map = await deps.repo.netPnlForUsers(ids);
      const list = ids
        .map((id) => map.get(id))
        .filter((r): r is RankingRow => r !== undefined)
        .sort((a, b) => b.netPnlCents - a.netPnlCents);
      return {
        rows: list.map((r, i) => ({
          rank: i + 1,
          userId: r.userId,
          displayName: r.displayName,
          avatarUrl: r.avatarUrl,
          tierRank: r.tierRank,
          netPnlCents: r.netPnlCents,
          contestsPlayed: r.contestsPlayed,
          isMe: r.userId === userId,
        })),
      };
    },

    async getGlobal({ userId, limit }) {
      const top = await deps.repo.topGlobal(limit);
      const topRows = top.map((r, i) => ({
        rank: i + 1,
        userId: r.userId,
        displayName: r.displayName,
        avatarUrl: r.avatarUrl,
        tierRank: r.tierRank,
        netPnlCents: r.netPnlCents,
        contestsPlayed: r.contestsPlayed,
        isMe: r.userId === userId,
      }));

      let me: Awaited<ReturnType<RankingsService['getGlobal']>>['me'] = null;
      if (userId && !topRows.some((r) => r.userId === userId)) {
        const myRow = await deps.repo.netPnlForUser(userId);
        const myRank = await deps.repo.globalRankOf(userId);
        if (myRow && myRank !== null) {
          me = {
            rank: myRank,
            userId: myRow.userId,
            displayName: myRow.displayName,
            avatarUrl: myRow.avatarUrl,
            tierRank: myRow.tierRank,
            netPnlCents: myRow.netPnlCents,
            contestsPlayed: myRow.contestsPlayed,
          };
        }
      }
      return { top: topRows, me };
    },
  };
}
