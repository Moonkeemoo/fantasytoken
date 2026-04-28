import { describe, expect, it } from 'vitest';
import { formatCents, formatPct, formatPnl, formatTimeLeft } from './format.js';

describe('formatCents', () => {
  it('formats whole dollars', () => {
    expect(formatCents(10_000)).toBe('$100.00');
  });
  it('formats with 2 decimals', () => {
    expect(formatCents(4820)).toBe('$48.20');
  });
  it('formats zero', () => {
    expect(formatCents(0)).toBe('$0.00');
  });
});

describe('formatPct', () => {
  it('positive with sign', () => {
    expect(formatPct(0.184)).toBe('+18.4%');
  });
  it('negative preserves sign', () => {
    expect(formatPct(-0.025)).toBe('-2.5%');
  });
  it('zero with no sign', () => {
    expect(formatPct(0)).toBe('0.0%');
  });
});

describe('formatPnl', () => {
  it('positive +$0.13 from score 0.0013 on $100 budget', () => {
    expect(formatPnl(0.0013)).toBe('+$0.13');
  });
  it('negative -$2.50 from score -0.025', () => {
    expect(formatPnl(-0.025)).toBe('-$2.50');
  });
  it('zero shows $0.00 with no sign', () => {
    expect(formatPnl(0)).toBe('$0.00');
  });
  it('rounds correctly (no floating drift)', () => {
    expect(formatPnl(0.001)).toBe('+$0.10');
  });
});

describe('formatTimeLeft', () => {
  it('formats hh:mm:ss when > 1h', () => {
    expect(formatTimeLeft(3 * 3600_000 + 47 * 60_000 + 12_000)).toBe('03:47:12');
  });
  it('formats mm:ss when < 1h', () => {
    expect(formatTimeLeft(2 * 60_000 + 30_000)).toBe('02:30');
  });
  it('returns 00:00 for past', () => {
    expect(formatTimeLeft(-1)).toBe('00:00');
  });
});
