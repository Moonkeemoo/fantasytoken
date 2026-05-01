import type { TokenBias } from './sim.config.js';

/**
 * Lineup picking with persona-aware token bias.
 *
 * Pure module — input: token snapshot list + persona bias + size + seed;
 * output: deterministic array of 1..5 unique symbols. Lives off-DB so
 * tests can drive it with fakes; the actual token catalog comes from
 * tokens.repo at runtime.
 *
 * Bias semantics:
 *   bluechip — top by marketCapUsd (top ~30 of catalog).
 *   meme     — bottom by marketCapUsd; preference for symbols matching
 *              meme-y patterns (PEPE, DOGE, SHIB, BONK, WIF, etc.). The
 *              symbol filter is a heuristic, not a guarantee — synthetics
 *              are simulating users with vibes, not a curated list.
 *   mixed    — uniform random across the whole catalog.
 *   volatile — top by abs(pct_change_24h).
 */

export interface PoolToken {
  symbol: string;
  marketCapUsd: number | null;
  pctChange24h: number | null;
}

const MEME_HEURISTIC = /(PEPE|DOGE|SHIB|BONK|WIF|FLOKI|BABYDOGE|MEME|CAT|MOG|TURBO|TRUMP)/i;

export function filterPoolByBias(pool: readonly PoolToken[], bias: TokenBias): PoolToken[] {
  if (pool.length === 0) return [];
  switch (bias) {
    case 'mixed':
      return [...pool];
    case 'bluechip': {
      // Top 30 by market cap; ties broken by symbol alpha for stability.
      const sorted = [...pool].sort((a, b) => {
        const am = a.marketCapUsd ?? 0;
        const bm = b.marketCapUsd ?? 0;
        if (bm !== am) return bm - am;
        return a.symbol.localeCompare(b.symbol);
      });
      return sorted.slice(0, Math.min(30, sorted.length));
    }
    case 'meme': {
      // Memecoins by symbol heuristic; if pool too small, fall through to
      // the lowest-mcap segment so we never return an empty filter.
      const named = pool.filter((t) => MEME_HEURISTIC.test(t.symbol));
      if (named.length >= 5) return named;
      const sorted = [...pool].sort((a, b) => {
        const am = a.marketCapUsd ?? 0;
        const bm = b.marketCapUsd ?? 0;
        return am - bm;
      });
      // Combine known memes with the smallest-cap tail.
      const tail = sorted.slice(0, Math.min(50, sorted.length));
      const merged = new Map<string, PoolToken>();
      for (const t of named) merged.set(t.symbol, t);
      for (const t of tail) if (!merged.has(t.symbol)) merged.set(t.symbol, t);
      return [...merged.values()];
    }
    case 'volatile': {
      const sorted = [...pool]
        .filter((t) => t.pctChange24h !== null)
        .sort((a, b) => Math.abs(b.pctChange24h ?? 0) - Math.abs(a.pctChange24h ?? 0));
      return sorted.slice(0, Math.min(30, sorted.length));
    }
  }
}

/**
 * Deterministic Fisher-Yates over a copy. Returns the shuffled list,
 * does not mutate input.
 */
export function shuffle<T>(arr: readonly T[], rand: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

export interface PickArgs {
  pool: readonly PoolToken[];
  bias: TokenBias;
  size: number;
  rand: () => number;
}

/**
 * Pick `size` unique symbols from the pool, biased by `bias`.
 * Returns fewer symbols only when the filtered pool is smaller than `size`.
 */
export function pickLineup(args: PickArgs): string[] {
  const filtered = filterPoolByBias(args.pool, args.bias);
  if (filtered.length === 0) return [];
  const shuffled = shuffle(filtered, args.rand);
  return shuffled.slice(0, Math.max(1, Math.min(args.size, filtered.length))).map((t) => t.symbol);
}
