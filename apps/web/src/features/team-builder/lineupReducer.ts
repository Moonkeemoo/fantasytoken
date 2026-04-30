import {
  ALLOCATION_MAX_PCT,
  ALLOCATION_MIN_PCT,
  ALLOCATION_STEP_PCT,
  PORTFOLIO_PCT_TOTAL,
  PORTFOLIO_TOKEN_COUNT,
  dollarsFor,
} from '@fantasytoken/shared';

// Display metadata is attached on add so LineupSummary can render real
// icons + names without a separate symbol→token lookup. Only `symbol` and
// `alloc` go on the wire (extra fields are stripped at submission).
export interface LineupPick {
  symbol: string;
  alloc: number;
  name?: string;
  imageUrl?: string | null;
}

export interface AddTokenInput {
  symbol: string;
  name?: string;
  imageUrl?: string | null;
}

const STEP = ALLOCATION_STEP_PCT;
const MIN = ALLOCATION_MIN_PCT;
const MAX = ALLOCATION_MAX_PCT;
const TOTAL = PORTFOLIO_PCT_TOTAL;
const N = PORTFOLIO_TOKEN_COUNT;

/**
 * Add a token; rebalances all picks to equal split rounded to multiples of STEP,
 * with remainder going to the first pick. Caps at TOTAL and N picks.
 *
 * Accepts either a bare symbol string (legacy / tests) or a token-shaped
 * object so display metadata (name, imageUrl) can ride along.
 */
export function addToken(lineup: LineupPick[], input: string | AddTokenInput): LineupPick[] {
  const meta: AddTokenInput = typeof input === 'string' ? { symbol: input } : input;
  if (lineup.some((p) => p.symbol === meta.symbol)) return lineup;
  if (lineup.length >= N) return lineup;
  const added: LineupPick = {
    symbol: meta.symbol,
    alloc: 0,
    ...(meta.name !== undefined && { name: meta.name }),
    ...(meta.imageUrl !== undefined && { imageUrl: meta.imageUrl }),
  };
  return rebalanceEqual([...lineup, added]);
}

export function removeToken(lineup: LineupPick[], symbol: string): LineupPick[] {
  return lineup.filter((p) => p.symbol !== symbol);
}

/**
 * Bump a single token's alloc by delta (typically ±STEP). Clamps to [MIN, MAX].
 * Does NOT auto-balance other picks — user must manually keep sum=100.
 */
export function bumpAlloc(lineup: LineupPick[], symbol: string, delta: number): LineupPick[] {
  return lineup.map((p) => {
    if (p.symbol !== symbol) return p;
    const next = Math.max(MIN, Math.min(MAX, p.alloc + delta));
    return { ...p, alloc: next };
  });
}

/**
 * Set a token's alloc to an explicit integer percent. The AllocSheet's primary
 * mutator: it has already clamped to remaining cap, so this just writes through.
 * If `symbol` isn't in the lineup, it's appended (subject to the 5-slot cap).
 * Display metadata (name, imageUrl) can ride along on append; ignored on update.
 */
export function setAlloc(
  lineup: LineupPick[],
  input: AddTokenInput | string,
  alloc: number,
): LineupPick[] {
  const meta: AddTokenInput = typeof input === 'string' ? { symbol: input } : input;
  const clamped = Math.max(MIN, Math.min(MAX, Math.round(alloc)));
  const idx = lineup.findIndex((p) => p.symbol === meta.symbol);
  if (idx >= 0) {
    return lineup.map((p, i) => (i === idx ? { ...p, alloc: clamped } : p));
  }
  if (lineup.length >= N) return lineup;
  const added: LineupPick = {
    symbol: meta.symbol,
    alloc: clamped,
    ...(meta.name !== undefined && { name: meta.name }),
    ...(meta.imageUrl !== undefined && { imageUrl: meta.imageUrl }),
  };
  return [...lineup, added];
}

/**
 * Replace the entire lineup with a preset (e.g. "Last team", "Balanced").
 * Validates count and sum; throws on bad presets so callers see the bug
 * during development instead of submitting a silently-broken lineup.
 */
export function applyPreset(picks: LineupPick[]): LineupPick[] {
  if (picks.length !== N) {
    throw new Error(`applyPreset: expected ${N} picks, got ${picks.length}`);
  }
  const sum = picks.reduce((s, p) => s + p.alloc, 0);
  if (sum !== TOTAL) {
    throw new Error(`applyPreset: picks sum ${sum} ≠ ${TOTAL}`);
  }
  return picks.map((p) => ({ ...p }));
}

export function reset(): LineupPick[] {
  return [];
}

export function isValid(lineup: LineupPick[]): boolean {
  if (lineup.length !== N) return false;
  if (lineup.reduce((s, p) => s + p.alloc, 0) !== TOTAL) return false;
  return lineup.every((p) => p.alloc >= MIN && p.alloc <= MAX && p.alloc % STEP === 0);
}

// ---------- Selectors (pure, used by DraftScreen + ConfirmBar) ----------

export function totalAlloc(lineup: LineupPick[]): number {
  return lineup.reduce((s, p) => s + p.alloc, 0);
}

export function remainingPct(lineup: LineupPick[]): number {
  return Math.max(0, TOTAL - totalAlloc(lineup));
}

export function dollarsTotal(lineup: LineupPick[], tier: number): number {
  return dollarsFor(totalAlloc(lineup), tier);
}

export type ContestModeForCta = 'bull' | 'bear';

/** GO button state derived from the lineup. Mirrors TZ-001 §05.2 */
export interface CtaState {
  kind: 'pick' | 'alloc' | 'over' | 'ready';
  /** UI label, no translation layer in v1 */
  label: string;
}

export function ctaState(
  lineup: LineupPick[],
  mode: ContestModeForCta,
  entryFeeStars: number,
): CtaState {
  if (isValid(lineup)) {
    return {
      kind: 'ready',
      label: `GO ${mode.toUpperCase()} · ${entryFeeStars} ⭐ entry`,
    };
  }
  if (lineup.length < N) {
    return { kind: 'pick', label: `PICK ${N - lineup.length} MORE` };
  }
  const sum = totalAlloc(lineup);
  if (sum < TOTAL) {
    return { kind: 'alloc', label: `ALLOCATE ${TOTAL - sum}% MORE` };
  }
  return { kind: 'over', label: `OVER BUDGET BY ${sum - TOTAL}%` };
}

function rebalanceEqual(lineup: LineupPick[]): LineupPick[] {
  if (lineup.length === 0) return [];
  const equal = Math.floor(TOTAL / lineup.length / STEP) * STEP;
  const clampedEqual = Math.max(MIN, Math.min(MAX, equal));
  let remainder = TOTAL - clampedEqual * lineup.length;
  return lineup.map((p, i) => {
    if (i === 0) {
      const target = Math.min(MAX, clampedEqual + remainder);
      remainder -= target - clampedEqual;
      return { ...p, alloc: target };
    }
    return { ...p, alloc: clampedEqual };
  });
}
