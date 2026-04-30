import type {
  ActivityItem,
  EntryPick,
  LastLineupResponse,
  LineupSummary,
} from '@fantasytoken/shared';
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
  /**
   * Caller's most recently submitted entry for the StartFromStrip "Last team"
   * preset (TZ-001 §05.3). Returns null when the user has never entered.
   * Latest known PnL is included so the preset card can show "+12.4%".
   */
  findLastLineupForUser(userId: string): Promise<LastLineupResponse['lineup']>;
  /**
   * Recent lock-in events for the LockedScreen rotating activity row
   * (TZ-001 §06.2). Privacy contract: first-name handles only — never
   * username + stake combinations.
   */
  listActivity(args: { contestId: string; limit: number }): Promise<ActivityItem[]>;
  /**
   * Fetch entries for a contest, projected for the public Browse-others feed.
   * Returns ONLY user handle + symbols + submittedAt — never allocations,
   * stake, or PnL (privacy contract per ADR-0003 / handoff §13 Q5).
   * `filter='recent'` orders by submittedAt DESC; otherwise stable submittedAt ASC.
   */
  listPublicLineups(args: {
    contestId: string;
    filter: 'all' | 'friends' | 'recent';
    limit: number;
  }): Promise<{ lineups: LineupSummary[]; total: number }>;
}

export interface EntriesServiceDeps {
  repo: EntriesRepo;
  currency: CurrencyService;
}

export interface ListLineupsArgs {
  contestId: string;
  filter: 'all' | 'friends' | 'recent';
  limit: number;
}

export interface EntriesService {
  submit(args: SubmitArgs): Promise<SubmitResult>;
  listPublicLineups(args: ListLineupsArgs): Promise<{ lineups: LineupSummary[]; total: number }>;
  findLastLineupForUser(userId: string): Promise<LastLineupResponse['lineup']>;
  listActivity(args: { contestId: string; limit: number }): Promise<ActivityItem[]>;
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

    async listPublicLineups({ contestId, filter, limit }) {
      const clamped = Math.max(1, Math.min(200, limit));
      return deps.repo.listPublicLineups({ contestId, filter, limit: clamped });
    },

    async findLastLineupForUser(userId) {
      return deps.repo.findLastLineupForUser(userId);
    },

    async listActivity({ contestId, limit }) {
      const clamped = Math.max(1, Math.min(50, limit));
      return deps.repo.listActivity({ contestId, limit: clamped });
    },
  };
}
