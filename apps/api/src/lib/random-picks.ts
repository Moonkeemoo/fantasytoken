import { PORTFOLIO_PCT_TOTAL, PORTFOLIO_TOKEN_COUNT } from '@fantasytoken/shared';

export interface PickOutput {
  symbol: string;
  alloc: number;
}

// ADR-0003: bot lineups intentionally use a coarser distribution than user input.
// `step=1, min=0` (per @fantasytoken/shared) on 5 slots produces noisy allocations
// like [3, 47, 12, 31, 7]; bots should look like players, not random-noise generators.
const BOT_MIN = 5;
const BOT_MAX = 80;
const BOT_STEP = 5;
const TOTAL = PORTFOLIO_PCT_TOTAL;
const N = PORTFOLIO_TOKEN_COUNT;

export function generateRandomPicks(symbols: readonly string[], rng: () => number): PickOutput[] {
  if (symbols.length < N) {
    throw new Error(`generateRandomPicks: need at least ${N} symbols, got ${symbols.length}`);
  }
  const chosen = shuffle([...symbols], rng).slice(0, N);
  const allocs = randomAllocations(rng);
  return chosen.map((symbol, i) => ({ symbol, alloc: allocs[i]! }));
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function randomAllocations(rng: () => number): number[] {
  const allocs = new Array<number>(N).fill(BOT_MIN);
  const chunks = (TOTAL - N * BOT_MIN) / BOT_STEP;
  for (let c = 0; c < chunks; c++) {
    const eligible: number[] = [];
    for (let i = 0; i < N; i++) {
      if (allocs[i]! + BOT_STEP <= BOT_MAX) eligible.push(i);
    }
    if (eligible.length === 0) {
      throw new Error('randomAllocations: no eligible slot — invariant violated');
    }
    const idx = eligible[Math.floor(rng() * eligible.length)]!;
    allocs[idx] = allocs[idx]! + BOT_STEP;
  }
  return allocs;
}
