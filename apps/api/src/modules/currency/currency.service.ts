import type { TransactionType } from '@fantasytoken/shared';

export interface TransactArgs {
  userId: string;
  deltaCents: bigint;
  type: TransactionType;
  refType?: 'contest' | 'entry' | 'package';
  refId?: string;
  /** TG `telegram_payment_charge_id` — only set for COINS_PURCHASE. Stored
   * alongside the ledger row; UNIQUE WHERE NOT NULL guards against double
   * credits when Telegram retries the successful_payment webhook. */
  paymentChargeId?: string;
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
