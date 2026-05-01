export interface WipeResult {
  deletedUsers: number;
  deletedTransactions: number;
  deletedEntries: number;
  deletedLogRows: number;
  dryRun: boolean;
}

export interface WipeRepo {
  /**
   * Counts what would be deleted. Read-only — no side effects.
   * Returned counts feed the dry-run preview and the post-wipe assertion.
   */
  countSynthetic(): Promise<{
    users: number;
    transactions: number;
    entries: number;
    logRows: number;
  }>;
  /**
   * Wipe in one transaction. Order matters because not every user-FK is
   * CASCADE: balances/transactions are RESTRICT (audit-log preservation
   * for real users); we delete the synthetic rows explicitly. If any FK
   * to a synthetic user comes from a real user (would only happen via
   * referrals once real traffic mixes in — see TZ §12 risk), the
   * transaction rolls back and the operator sees the violation.
   */
  wipe(): Promise<WipeResult>;
}

export interface WipeServiceDeps {
  repo: WipeRepo;
}

export interface WipeService {
  wipe(args: { dryRun: boolean }): Promise<WipeResult>;
}

export function createWipeService(deps: WipeServiceDeps): WipeService {
  return {
    async wipe({ dryRun }) {
      if (dryRun) {
        const c = await deps.repo.countSynthetic();
        return {
          deletedUsers: c.users,
          deletedTransactions: c.transactions,
          deletedEntries: c.entries,
          deletedLogRows: c.logRows,
          dryRun: true,
        };
      }
      return deps.repo.wipe();
    },
  };
}
