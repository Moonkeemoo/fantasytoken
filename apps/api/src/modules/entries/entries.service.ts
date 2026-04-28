import type { EntryPick } from '@fantasytoken/shared';
import { errors } from '../../lib/errors.js';
import type { CurrencyService } from '../currency/currency.service.js';

export interface SubmitArgs {
  userId: string;
  contestId: string;
  picks: EntryPick[];
}

export interface SubmitResult {
  entryId: string;
  contestId: string;
  submittedAt: string;
  alreadyEntered: boolean;
}

export interface EntriesRepo {
  findExisting(args: { userId: string; contestId: string }): Promise<{ entryId: string } | null>;
  getOpenContest(id: string): Promise<{ id: string; entryFeeCents: bigint; startsAt: Date } | null>;
  unknownSymbols(symbols: string[]): Promise<string[]>;
  create(args: { userId: string; contestId: string; picks: EntryPick[] }): Promise<{
    id: string;
    submittedAt: Date;
  }>;
}

export interface EntriesServiceDeps {
  repo: EntriesRepo;
  currency: CurrencyService;
}

export interface EntriesService {
  submit(args: SubmitArgs): Promise<SubmitResult>;
}

export function createEntriesService(deps: EntriesServiceDeps): EntriesService {
  return {
    async submit({ userId, contestId, picks }) {
      const existing = await deps.repo.findExisting({ userId, contestId });
      if (existing) {
        return {
          entryId: existing.entryId,
          contestId,
          submittedAt: new Date().toISOString(),
          alreadyEntered: true,
        };
      }

      const contest = await deps.repo.getOpenContest(contestId);
      if (!contest) throw errors.contestClosed();

      const symbols = picks.map((p) => p.symbol);
      const unknown = await deps.repo.unknownSymbols(symbols);
      if (unknown.length > 0) {
        throw errors.invalidLineup({ unknownSymbols: unknown });
      }

      const balance = await deps.currency.getBalance(userId);
      if (balance < contest.entryFeeCents) throw errors.insufficientBalance();

      const created = await deps.repo.create({ userId, contestId, picks });
      try {
        await deps.currency.transact({
          userId,
          deltaCents: -contest.entryFeeCents,
          type: 'ENTRY_FEE',
          refType: 'entry',
          refId: created.id,
        });
      } catch {
        // INV-7: re-throw as INSUFFICIENT_BALANCE; AppError gets logged by global handler.
        throw errors.insufficientBalance();
      }

      return {
        entryId: created.id,
        contestId,
        submittedAt: created.submittedAt.toISOString(),
        alreadyEntered: false,
      };
    },
  };
}
