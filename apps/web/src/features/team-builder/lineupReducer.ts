import { PORTFOLIO_TOKEN_COUNT, dollarsFor } from '@fantasytoken/shared';

/**
 * TZ-003: Equal-split allocation. The reducer no longer manages per-pick
 * allocations — they're derived from `lineup.length` (1 → 100%, 2 → 50/50,
 * 3 → ~33% each, 5 → 20% each). The reducer just maintains a 0–5 ordered
 * list of unique symbols + their display metadata.
 *
 * Display metadata is attached on add so LineupSummary can render real
 * icons + names without a separate symbol→token lookup.
 */
export interface LineupPick {
  symbol: string;
  /** Implicit equal-split alloc in % (computed; written here for
   * convenience by selectors). 100 / lineup.length, integer-rounded.
   * Single source of truth for accurate basis points lives server-side
   * (entries.service · evenAllocCents). */
  alloc: number;
  name?: string;
  imageUrl?: string | null;
}

export interface AddTokenInput {
  symbol: string;
  name?: string;
  imageUrl?: string | null;
}

const N_MAX = PORTFOLIO_TOKEN_COUNT; // 5

/** Pure: equal-split alloc% (rounded to nearest integer). Backend stores
 * the precise basis-point split; this is for UI display only. */
export function evenAllocPct(count: number): number {
  if (count <= 0) return 0;
  return Math.round(100 / count);
}

/** Stamp the implicit equal-split alloc on each pick so LineupSummary can
 * read it directly without recomputing. Pure. */
function stamp(picks: Omit<LineupPick, 'alloc'>[]): LineupPick[] {
  const pct = evenAllocPct(picks.length);
  return picks.map((p) => ({ ...p, alloc: pct }));
}

/** Add a token. Idempotent on duplicate symbol. Caps at N_MAX. */
export function addToken(lineup: LineupPick[], input: string | AddTokenInput): LineupPick[] {
  const meta: AddTokenInput = typeof input === 'string' ? { symbol: input } : input;
  if (lineup.some((p) => p.symbol === meta.symbol)) return lineup;
  if (lineup.length >= N_MAX) return lineup;
  const added = {
    symbol: meta.symbol,
    ...(meta.name !== undefined && { name: meta.name }),
    ...(meta.imageUrl !== undefined && { imageUrl: meta.imageUrl }),
  };
  return stamp([...lineup, added]);
}

/** Remove a token. Idempotent if the symbol isn't in the lineup. */
export function removeToken(lineup: LineupPick[], symbol: string): LineupPick[] {
  const next = lineup.filter((p) => p.symbol !== symbol);
  if (next.length === lineup.length) return lineup;
  return stamp(next);
}

/** Toggle: add if absent, remove if present. The single binding the FE
 * uses for both slot taps and token-row taps. */
export function toggleToken(lineup: LineupPick[], input: string | AddTokenInput): LineupPick[] {
  const sym = typeof input === 'string' ? input : input.symbol;
  if (lineup.some((p) => p.symbol === sym)) return removeToken(lineup, sym);
  return addToken(lineup, input);
}

/** Apply a "Last team" / preset — list of symbols (with optional metadata).
 * Allocations are recomputed evenly. */
export function applyPreset(picks: AddTokenInput[]): LineupPick[] {
  if (picks.length === 0) return [];
  if (picks.length > N_MAX) {
    throw new Error(`applyPreset: max ${N_MAX} picks, got ${picks.length}`);
  }
  return stamp(picks.map((p) => ({ ...p })));
}

export function reset(): LineupPick[] {
  return [];
}

/** A lineup is valid for submission with 1..5 unique symbols. */
export function isValid(lineup: LineupPick[]): boolean {
  if (lineup.length < 1 || lineup.length > N_MAX) return false;
  const syms = new Set(lineup.map((p) => p.symbol));
  return syms.size === lineup.length;
}

// ---------- Selectors (pure, used by DraftScreen sticky CTA) ----------

export function dollarsTotal(lineup: LineupPick[], tier: number): number {
  // With equal split, total committed always equals tier when length>=1.
  return lineup.length === 0 ? 0 : tier;
}

/** $ value of one pick (tier × 1/length, rounded). For UI display in slot. */
export function dollarsPerPick(lineup: LineupPick[], tier: number): number {
  if (lineup.length === 0) return 0;
  return Math.round(dollarsFor(evenAllocPct(lineup.length), tier));
}

export type ContestModeForCta = 'bull' | 'bear';
/** Re-exported for the rest of team-builder (was previously declared in
 * AllocSheet, which TZ-003 deletes). */
export type ContestMode = ContestModeForCta;

/** GO button state derived from the lineup. TZ-003 simplified state machine:
 *   `pick`  — empty lineup, prompt to pick
 *   `ready` — 1..5 picks, ready to lock in
 * The legacy `alloc` / `over` states are gone — equal-split makes them
 * impossible. */
export interface CtaState {
  kind: 'pick' | 'ready';
  label: string;
}

export function ctaState(
  lineup: LineupPick[],
  mode: ContestModeForCta,
  entryLabel: string,
): CtaState {
  if (isValid(lineup)) {
    return {
      kind: 'ready',
      label: `GO ${mode.toUpperCase()} · ${entryLabel}`,
    };
  }
  return { kind: 'pick', label: 'PICK 1+ TOKENS' };
}
