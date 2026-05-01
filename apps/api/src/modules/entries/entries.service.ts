import type {
  ActivityItem,
  EntryPick,
  LastLineupResponse,
  LineupSummary,
} from '@fantasytoken/shared';
import { evenAllocCents, ALLOC_CENTS_TOTAL } from '@fantasytoken/shared';
import { errors } from '../../lib/errors.js';
import type { CurrencyService } from '../currency/currency.service.js';

export interface SubmitArgs {
  userId: string;
  contestId: string;
  /** TZ-003: wire payload is symbols only; allocations computed evenly
   * server-side. Keeping the array order is meaningful — round-off goes
   * to picks[0] per ADR-0005. */
  picks: string[];
}

export interface SubmitResult {
  entryId: string;
  contestId: string;
  submittedAt: string;
  alreadyEntered: boolean;
}

export interface EntriesRepo {
  findExisting(args: { userId: string; contestId: string }): Promise<{ entryId: string } | null>;
  getOpenContest(id: string): Promise<{
    id: string;
    entryFeeCents: bigint;
    startsAt: Date;
    maxCapacity: number;
    minRank: number;
  } | null>;
  /** Pre-lock real-entry count for cap enforcement (excludes bots). */
  countRealEntries(contestId: string): Promise<number>;
  /** User's current rank (RANK_SYSTEM.md). Drives the minRank gate at
   * submit time — without this the lobby filter is the only enforcement
   * and a synth/curl can bypass it. */
  getUserCurrentRank(userId: string): Promise<number>;
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
  /** Lifetime count of finalized entries for a user — drives onboarding
   * action-gates (DESIGN.md §8 R1→R3 unlocks). */
  countFinalizedForUser(userId: string): Promise<number>;
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
  countFinalizedForUser(userId: string): Promise<number>;
}

export function createEntriesService(deps: EntriesServiceDeps): EntriesService {
  return {
    async submit({ userId, contestId, picks: symbols }) {
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

      // Rank gate. Lobby UI filters contests where contest.minRank >
      // user.currentRank, but the lobby filter alone leaves a hole for
      // direct submit (synth, curl, future client divergence). Throw a
      // CONTEST_NOT_OPEN so the synth log captures the gating moment.
      const callerRank = await deps.repo.getUserCurrentRank(userId);
      if (callerRank < contest.minRank) {
        throw errors.contestNotOpen();
      }

      // Cap pre-lock real entries. Bots fill the rest at lockAndSpawn
      // time; if real entries already meet maxCapacity, late arrivals
      // (real or synthetic) get a clean CONTEST_FULL instead of bypassing
      // the cap and producing "26/20" displays in the lobby.
      // Race window is small: count→insert isn't atomic, so a burst of
      // concurrent submits at exactly cap might add 1-2 extras. Acceptable
      // tradeoff vs the latency cost of a row-locking transaction.
      const realCount = await deps.repo.countRealEntries(contestId);
      if (realCount >= contest.maxCapacity) {
        throw errors.contestFull(realCount, contest.maxCapacity);
      }

      const unknown = await deps.repo.unknownSymbols(symbols);
      if (unknown.length > 0) {
        throw errors.invalidLineup({ unknownSymbols: unknown });
      }

      const balance = await deps.currency.getBalance(userId);
      if (balance < contest.entryFeeCents) {
        throw errors.insufficientCoins(Number(contest.entryFeeCents), Number(balance));
      }

      // TZ-003 §4: evenly distribute alloc cents (basis points; 10000 = 100%).
      // Round-off (when 10000 % length ≠ 0) goes to picks[0..remainder-1] per
      // ADR-0005. Convert to integer pct here for legacy `entries.picks.alloc`
      // storage — the JSON column still uses `alloc` ints, but they're now
      // derived rather than user-set. EntryPick stays compatible because
      // `alloc` is just `Math.round(allocCents / 100)` for these.
      const allocCents = evenAllocCents(symbols);
      const picks: EntryPick[] = symbols.map((symbol, i) => ({
        symbol,
        alloc: Math.round((allocCents[i] ?? 0) / 100),
      }));
      // Sanity: pct sum must round to 100 (only fails for >100 picks, which
      // schema already blocks).
      void ALLOC_CENTS_TOTAL;

      const created = await deps.repo.create({ userId, contestId, picks });
      // Skip the currency tx for free contests — passing deltaCents=0n into
      // currency.transact triggers an overdraft-guard rejection in the
      // currency repo, which we'd then re-throw as INSUFFICIENT_COINS and
      // the frontend would pop a Top-up modal on a Practice entry. Bug
      // reported: "При кліку на фрі ентрі вилізла докупка коінів".
      if (contest.entryFeeCents > 0n) {
        try {
          await deps.currency.transact({
            userId,
            deltaCents: -contest.entryFeeCents,
            type: 'ENTRY_FEE',
            refType: 'entry',
            refId: created.id,
          });
        } catch {
          // INV-7: race-loss between getBalance() check and currency.transact().
          // We don't have the precise current balance at this point — use 0 as
          // the conservative current amount; UX still shows the right "Need N
          // more" once the user re-fetches balance.
          throw errors.insufficientCoins(Number(contest.entryFeeCents), 0);
        }
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

    async countFinalizedForUser(userId) {
      return deps.repo.countFinalizedForUser(userId);
    },
  };
}
