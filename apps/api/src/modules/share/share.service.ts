export interface ShareCardData {
  entryId: string;
  contestName: string;
  contestType: 'bull' | 'bear';
  finalRank: number | null;
  totalEntries: number;
  realEntries: number;
  netPnlCents: number;
  prizeCents: number;
  finishedAt: Date;
  user: {
    displayName: string;
    username: string | null;
    avatarUrl: string | null;
    telegramId: number;
  };
}

export interface ShareRepo {
  /** Load all data needed for the share card. Null if entry not found or
   * contest not yet finalized/cancelled. */
  load(entryId: string): Promise<ShareCardData | null>;
}

export interface ShareService {
  load(entryId: string): Promise<ShareCardData | null>;
}

export function createShareService(repo: ShareRepo): ShareService {
  return {
    async load(entryId) {
      return repo.load(entryId);
    },
  };
}
