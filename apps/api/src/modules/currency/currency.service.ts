import type { TransactionType } from '@fantasytoken/shared';

export interface TransactArgs {
  userId: string;
  deltaCents: bigint;
  type: TransactionType;
  refType?: 'contest' | 'entry';
  refId?: string;
}

export interface TransactResult {
  txId: string;
  balanceAfter: bigint;
}

export interface CurrencyRepo {
  /**
   * INV-9 atomic step: insert transaction → upsert balance → check ≥ 0 → rollback on overdraft.
   * Repo owns the DB transaction; service owns business rules.
   */
  transactAtomic(args: TransactArgs): Promise<TransactResult>;
  getBalance(userId: string): Promise<bigint>;
}

export interface CurrencyService {
  transact(args: TransactArgs): Promise<TransactResult>;
  getBalance(userId: string): Promise<bigint>;
}

export function createCurrencyService(repo: CurrencyRepo): CurrencyService {
  return {
    async transact(args) {
      if (args.deltaCents === 0n) {
        throw new Error('CurrencyService.transact: deltaCents must be non-zero');
      }
      return repo.transactAtomic(args);
    },

    async getBalance(userId) {
      return repo.getBalance(userId);
    },
  };
}
