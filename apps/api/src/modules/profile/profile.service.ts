export interface ProfileStats {
  contestsPlayed: number;
  /** wonContests / (wonContests + lostContests); even (cancelled-with-refund) excluded. */
  winRate: number | null;
  /** Best single-contest net P&L in cents, split by mode. */
  bestBullPnlCents: number | null;
  bestBearPnlCents: number | null;
  /** Legacy compound — max of bull/bear. Kept for back-compat with old clients. */
  bestPnlCents: number | null;
  allTimePnlCents: number;
}

export interface ProfileRecentContest {
  contestId: string;
  contestName: string;
  contestType: 'bull' | 'bear';
  finalRank: number | null;
  totalEntries: number;
  finishedAt: Date;
  netPnlCents: number;
}

export interface ProfileData {
  user: {
    telegramId: number;
    firstName: string;
    username: string | null;
    photoUrl: string | null;
  };
  balanceCents: number;
  stats: ProfileStats;
  recentContests: ProfileRecentContest[];
}

export interface ProfileRepo {
  load(userId: string, recentLimit: number): Promise<ProfileData | null>;
}

export interface ProfileService {
  load(userId: string): Promise<ProfileData | null>;
}

export function createProfileService(repo: ProfileRepo): ProfileService {
  return {
    async load(userId) {
      return repo.load(userId, 10);
    },
  };
}
