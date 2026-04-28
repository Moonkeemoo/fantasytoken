import {
  ALLOCATION_MAX_PCT,
  ALLOCATION_MIN_PCT,
  ALLOCATION_STEP_PCT,
  PORTFOLIO_PCT_TOTAL,
  PORTFOLIO_TOKEN_COUNT,
} from '@fantasytoken/shared';

export interface PickOutput {
  symbol: string;
  alloc: number;
}

const MIN = ALLOCATION_MIN_PCT;
const MAX = ALLOCATION_MAX_PCT;
const STEP = ALLOCATION_STEP_PCT;
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
  const allocs = new Array<number>(N).fill(MIN);
  const chunks = (TOTAL - N * MIN) / STEP;
  for (let c = 0; c < chunks; c++) {
    const eligible: number[] = [];
    for (let i = 0; i < N; i++) {
      if (allocs[i]! + STEP <= MAX) eligible.push(i);
    }
    if (eligible.length === 0) {
      throw new Error('randomAllocations: no eligible slot — invariant violated');
    }
    const idx = eligible[Math.floor(rng() * eligible.length)]!;
    allocs[idx] = allocs[idx]! + STEP;
  }
  return allocs;
}
