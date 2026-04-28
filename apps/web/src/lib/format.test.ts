import { describe, expect, it } from 'vitest';
import { formatCents, formatPct, formatTimeLeft } from './format.js';

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

describe('formatTimeLeft', () => {
  it('formats hh:mm when > 1h', () => {
    expect(formatTimeLeft(3 * 3600_000 + 47 * 60_000)).toBe('03:47');
  });
  it('formats mm:ss when < 1h', () => {
    expect(formatTimeLeft(2 * 60_000 + 30_000)).toBe('02:30');
  });
  it('returns 00:00 for past', () => {
    expect(formatTimeLeft(-1)).toBe('00:00');
  });
});
