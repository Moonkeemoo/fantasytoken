import type { ContestFilter, ContestStatus, PrizeFormat } from '@fantasytoken/shared';

export interface ContestRowFromRepo {
  id: string;
  name: string;
  type: 'bull' | 'bear';
  status: ContestStatus;
  entryFeeCents: number;
  prizePoolCents: number;
  maxCapacity: number;
  spotsFilled: number;
  startsAt: string;
  endsAt: string;
  isFeatured: boolean;
  minRank: number;
  payAll: boolean;
  /** ADR-0003: $-first UX layer (display-only). */
  virtualBudgetCents: number;
  userHasEntered: boolean;
  // ADR-0008: prize structure summary for the lobby card.
  prizeFormat: PrizeFormat;
  payingRanks: number;
  topPrize: number;
  minCash: number;
  /** ADR-0009: when this contest is FILLED (spotsFilled ≥ maxCapacity)
   * and a sibling instance for the same matrix cell has available
   * capacity, this is the sibling's id so the lobby card can render an
   * "open a seat in the next instance" CTA pointing straight at it.
   * null when there's no sibling, or the contest isn't full. */
  mirrorContestId: string | null;
}

export interface CreateContestArgs {
  name: string;
  entryFeeCents: number;
  prizePoolCents: number;
  maxCapacity: number;
  startsAt: Date;
  endsAt: Date;
  isFeatured: boolean;
  createdByUserId: string;
}

export interface ContestsRepo {
  list(args: { filter: ContestFilter; userId?: string }): Promise<ContestRowFromRepo[]>;
  getById(id: string, userId?: string): Promise<ContestRowFromRepo | null>;
  create(args: CreateContestArgs): Promise<{ id: string }>;
}

export interface ContestsService {
  list(args: { filter: ContestFilter; userId?: string }): Promise<ContestRowFromRepo[]>;
  getById(id: string, userId?: string): Promise<ContestRowFromRepo | null>;
  create(args: CreateContestArgs): Promise<{ id: string }>;
}

export function createContestsService(repo: ContestsRepo): ContestsService {
  return {
    async list({ filter, userId }) {
      const args = userId === undefined ? { filter } : { filter, userId };
      return repo.list(args);
    },
    async getById(id, userId) {
      const u = userId === undefined ? undefined : userId;
      return repo.getById(id, u);
    },
    async create(args) {
      if (args.endsAt <= args.startsAt) {
        throw new Error('contest endsAt must be after startsAt');
      }
      return repo.create(args);
    },
  };
}
