import { describe, expect, it } from 'vitest';
import type { ContestListItem } from '@fantasytoken/shared';
import { applyOnboardingGate } from './onboarding-gate.js';

function mk(over: Partial<ContestListItem> & { id: string }): ContestListItem {
  return {
    id: over.id,
    name: over.name ?? 'X',
    type: over.type ?? 'bull',
    status: 'scheduled',
    entryFeeCents: over.entryFeeCents ?? 1,
    prizePoolCents: 0,
    maxCapacity: 20,
    spotsFilled: 0,
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 600_000).toISOString(),
    isFeatured: false,
    minRank: 1,
    payAll: over.payAll ?? false,
    virtualBudgetCents: 10_000_000,
    userHasEntered: false,
    prizeFormat: 'gpp',
    payingRanks: 5,
    topPrize: 0,
    minCash: 0,
    mirrorContestId: null,
  };
}

describe('applyOnboardingGate', () => {
  const practice = mk({ id: 'practice', name: 'Practice', entryFeeCents: 0, payAll: true });
  const quickBull = mk({ id: 'quick', name: 'Quick Match', entryFeeCents: 1, type: 'bull' });
  const bearTrap = mk({ id: 'bear', name: 'Bear Trap', entryFeeCents: 1, type: 'bear' });
  const memecoin = mk({ id: 'meme', name: 'Memecoin', entryFeeCents: 5, type: 'bull' });

  it('R1 fresh (0 done): only Practice', () => {
    const out = applyOnboardingGate([practice, quickBull, bearTrap, memecoin], 0);
    expect(out.map((c) => c.id)).toEqual(['practice']);
  });

  it('R2 (1 done): Practice + Quick', () => {
    const out = applyOnboardingGate([practice, quickBull, bearTrap, memecoin], 1);
    expect(out.map((c) => c.id).sort()).toEqual(['practice', 'quick']);
  });

  it('R3 (3+ done): nothing hidden', () => {
    const out = applyOnboardingGate([practice, quickBull, bearTrap, memecoin], 3);
    expect(out.map((c) => c.id).sort()).toEqual(['bear', 'meme', 'practice', 'quick']);
  });

  it('post-onboarding (10 done): all pass through', () => {
    const out = applyOnboardingGate([practice, quickBull, bearTrap, memecoin], 10);
    expect(out).toHaveLength(4);
  });
});
