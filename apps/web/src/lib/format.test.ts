import { describe, expect, it } from 'vitest';
import { formatCents, formatPct, formatPnl, formatTimeLeft } from './format.js';

// TZ-002: amounts are now whole COINS (1 coin = $1 fantasy display).
// Function name kept under `formatCents`; output uses 🪙 prefix + compact.
describe('formatCents', () => {
  it('formats whole coins under 1K', () => {
    expect(formatCents(100)).toBe('🪙 100');
  });
  it('formats thousands as compact K', () => {
    expect(formatCents(48_200)).toBe('🪙 48.2K');
  });
  it('formats zero', () => {
    expect(formatCents(0)).toBe('🪙 0');
  });
  it('millions as compact M', () => {
    expect(formatCents(1_500_000)).toBe('🪙 1.5M');
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
  it('positive +🪙 10 from score 0.10 on 100-coin portfolio', () => {
    expect(formatPnl(0.1)).toBe('+🪙 10');
  });
  it('negative -🪙 2 from score -0.025', () => {
    expect(formatPnl(-0.025)).toBe('-🪙 2');
  });
  it('zero shows 🪙 0 with no sign', () => {
    expect(formatPnl(0)).toBe('🪙 0');
  });
  it('sub-coin movement collapses to 🪙 0', () => {
    expect(formatPnl(0.001)).toBe('🪙 0');
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
