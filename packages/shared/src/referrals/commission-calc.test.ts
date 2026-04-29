import { describe, expect, it } from 'vitest';
import { computeCommission } from './commission-calc.js';
import { MAX_REFERRAL_DEPTH, REFERRAL_RATES } from './referral-rates.js';

describe('computeCommission', () => {
  it('USD L1 5% — 10000c prize → 500c commission', () => {
    const r = computeCommission({ prizeCents: 10_000n, currency: 'USD' }, 1);
    expect(r.level).toBe(1);
    expect(r.pctBps).toBe(500);
    expect(r.payoutCents).toBe(500n);
  });

  it('USD L2 1% — 10000c prize → 100c commission', () => {
    const r = computeCommission({ prizeCents: 10_000n, currency: 'USD' }, 2);
    expect(r.pctBps).toBe(100);
    expect(r.payoutCents).toBe(100n);
  });

  it('TON L1 2.5% — 200 units → 5 units', () => {
    const r = computeCommission({ prizeCents: 200n, currency: 'TON' }, 1);
    expect(r.pctBps).toBe(250);
    expect(r.payoutCents).toBe(5n);
  });

  it('TON L2 0.5% — 200 units → 1 unit', () => {
    const r = computeCommission({ prizeCents: 200n, currency: 'TON' }, 2);
    expect(r.pctBps).toBe(50);
    expect(r.payoutCents).toBe(1n);
  });

  it('STARS L1 3% — 1000 units → 30 units', () => {
    const r = computeCommission({ prizeCents: 1_000n, currency: 'STARS' }, 1);
    expect(r.pctBps).toBe(300);
    expect(r.payoutCents).toBe(30n);
  });

  it('zero prize → zero commission', () => {
    expect(computeCommission({ prizeCents: 0n, currency: 'USD' }, 1).payoutCents).toBe(0n);
    expect(computeCommission({ prizeCents: 0n, currency: 'TON' }, 2).payoutCents).toBe(0n);
  });

  it('floors sub-cent dust to house (no surprise mint, INV-9 spirit)', () => {
    // 199 cents × 250 bps / 10000 = 4.975 → 4 cents to L1, 0.975c stays with house.
    const r = computeCommission({ prizeCents: 199n, currency: 'TON' }, 1);
    expect(r.payoutCents).toBe(4n);
  });

  it('handles large bigint without overflow (TON-style 18-decimal nominals)', () => {
    // 10 TON = 10 * 10^9 nano-TON style (well within bigint safe range).
    const huge = 10_000_000_000n;
    const r = computeCommission({ prizeCents: huge, currency: 'TON' }, 1);
    expect(r.payoutCents).toBe(250_000_000n); // 2.5%
  });

  it('depth cap = 2 (INV-15)', () => {
    expect(MAX_REFERRAL_DEPTH).toBe(2);
  });

  it('rates frozen as documented in REFERRAL_SYSTEM.md §5', () => {
    // Snapshot guard — bumping any rate is a deliberate spec change.
    expect(REFERRAL_RATES.USD).toEqual({ l1Bps: 500, l2Bps: 100 });
    expect(REFERRAL_RATES.STARS).toEqual({ l1Bps: 300, l2Bps: 50 });
    expect(REFERRAL_RATES.TON).toEqual({ l1Bps: 250, l2Bps: 50 });
  });
});
