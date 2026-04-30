import { describe, expect, it } from 'vitest';
import type { ContestListItem } from '@fantasytoken/shared';
import { zoneContests } from './zones.js';

function mk(over: Partial<ContestListItem> & { id: string; minRank: number }): ContestListItem {
  return {
    id: over.id,
    name: over.name ?? 'X',
    type: over.type ?? 'bull',
    status: over.status ?? 'scheduled',
    entryFeeCents: over.entryFeeCents ?? 1,
    prizePoolCents: 0,
    maxCapacity: 20,
    spotsFilled: 0,
    startsAt: over.startsAt ?? new Date(Date.now() + 60_000).toISOString(),
    endsAt: over.endsAt ?? new Date(Date.now() + 600_000).toISOString(),
    isFeatured: false,
    minRank: over.minRank,
    payAll: over.payAll ?? false,
    virtualBudgetCents: 10_000_000,
    userHasEntered: over.userHasEntered ?? false,
  };
}

describe('lobby zoneContests', () => {
  it('routes user-entered live to MY', () => {
    const items = [mk({ id: 'a', minRank: 1, userHasEntered: true, status: 'active' })];
    const z = zoneContests(items, 5);
    expect(z.my.map((c) => c.id)).toEqual(['a']);
    expect(z.watch).toHaveLength(0);
  });

  it('routes scheduled-rank-eligible to SOON', () => {
    const items = [mk({ id: 'a', minRank: 3 })];
    const z = zoneContests(items, 5);
    expect(z.soon.map((c) => c.id)).toEqual(['a']);
  });

  it('routes active-not-entered to WATCH', () => {
    const items = [mk({ id: 'a', minRank: 3, status: 'active' })];
    const z = zoneContests(items, 5);
    expect(z.watch.map((c) => c.id)).toEqual(['a']);
  });

  it('routes scheduled-rank-locked to LOCKED', () => {
    const items = [mk({ id: 'a', minRank: 10 })];
    const z = zoneContests(items, 5);
    expect(z.locked.map((c) => c.id)).toEqual(['a']);
  });

  it('priority: MY beats SOON when user has entered', () => {
    const items = [mk({ id: 'a', minRank: 1, userHasEntered: true, status: 'scheduled' })];
    const z = zoneContests(items, 5);
    expect(z.my.map((c) => c.id)).toEqual(['a']);
    expect(z.soon).toHaveLength(0);
  });

  it('priority: WATCH catches active-rank-locked too (you can spectate above tier)', () => {
    const items = [mk({ id: 'a', minRank: 99, status: 'active' })];
    const z = zoneContests(items, 5);
    expect(z.watch.map((c) => c.id)).toEqual(['a']);
    expect(z.locked).toHaveLength(0);
  });

  it('MY sorts by ends_at ASC (most urgent first)', () => {
    const t = (sec: number) => new Date(Date.now() + sec * 1000).toISOString();
    const items = [
      mk({ id: 'late', minRank: 1, userHasEntered: true, status: 'active', endsAt: t(3600) }),
      mk({ id: 'soon', minRank: 1, userHasEntered: true, status: 'active', endsAt: t(60) }),
    ];
    const z = zoneContests(items, 5);
    expect(z.my.map((c) => c.id)).toEqual(['soon', 'late']);
  });

  it('LOCKED sorts by rank-distance ASC (closest unlock first)', () => {
    const items = [mk({ id: 'far', minRank: 25 }), mk({ id: 'close', minRank: 8 })];
    const z = zoneContests(items, 5);
    expect(z.locked.map((c) => c.id)).toEqual(['close', 'far']);
  });

  it('WATCH ties broken by entryFee DESC (whale-watching nudge)', () => {
    const t = (sec: number) => new Date(Date.now() + sec * 1000).toISOString();
    const items = [
      mk({ id: 'small', minRank: 1, status: 'active', endsAt: t(60), entryFeeCents: 1 }),
      mk({ id: 'whale', minRank: 1, status: 'active', endsAt: t(60), entryFeeCents: 500 }),
    ];
    const z = zoneContests(items, 5);
    expect(z.watch.map((c) => c.id)).toEqual(['whale', 'small']);
  });
});
