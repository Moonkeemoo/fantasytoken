/**
 * Deterministic sparkline path generator (TZ-001).
 *
 * Same `seed` → same path on every render and across reloads. Used in token rows,
 * Live team rows, and Browse previews where we want a price-shape *suggestion*
 * without round-tripping the full price history.
 *
 * NOT a real price feed — purely a visual primitive. When real price history is
 * wired in (Milestone post-v1), replace callers with the live series and retire
 * this module.
 */

const SPARK_WIDTH = 64;
const SPARK_HEIGHT = 24;
const SPARK_POINTS = 16;

/**
 * Mulberry32 — small, fast, good-enough PRNG. Same seed reproduces the sequence.
 * Inline rather than imported to keep `packages/shared` zero-dep.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Hash a string seed (e.g. token symbol) into a 32-bit integer.
 * djb2 — same property: deterministic, dependency-free, good distribution.
 */
function hashSeed(seed: string): number {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

/**
 * Returns an SVG `path d=...` string for a 64x24 sparkline.
 * `isUp=true` biases the trend upward over the window; `false` biases down.
 *
 * Example: `<path d={sparkPath('PEPE', true)} stroke="var(--bull)" fill="none" />`
 */
export function sparkPath(seed: string, isUp: boolean): string {
  const rng = mulberry32(hashSeed(seed));
  const points: Array<[number, number]> = [];
  const trendStep = (isUp ? -1 : 1) * (SPARK_HEIGHT / SPARK_POINTS) * 0.45;
  let y = isUp ? SPARK_HEIGHT * 0.75 : SPARK_HEIGHT * 0.25;

  for (let i = 0; i < SPARK_POINTS; i++) {
    const x = (i / (SPARK_POINTS - 1)) * SPARK_WIDTH;
    const noise = (rng() - 0.5) * SPARK_HEIGHT * 0.45;
    const yClamped = Math.max(2, Math.min(SPARK_HEIGHT - 2, y + noise));
    points.push([x, yClamped]);
    y += trendStep;
  }

  return points
    .map(([x, py], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${py.toFixed(2)}`)
    .join(' ');
}

export const SPARK_VIEWBOX = `0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}` as const;
export const SPARK_DIMENSIONS = { width: SPARK_WIDTH, height: SPARK_HEIGHT } as const;

// ─── Histogram — 16 hourly bars showing 24h volatility + direction ───

const HIST_BARS = 16;

/**
 * Returns an array of 16 normalized bar heights in [0, 1] for the
 * mini-histogram component. Deterministic per (seed, isUp, pctMagnitude)
 * — same token + same direction always renders the same shape, so the
 * rows don't shimmer between renders.
 *
 * Magnitude controls the spread: small movements (<2%) cluster bars
 * around the middle; bigger movements (>10%) push later bars near the
 * edges (visual "the move is happening NOW").
 *
 * NOT a real price feed — same disclaimer as sparkPath above. When we
 * have hourly price snapshots stored backend-side, swap callers to the
 * real series.
 */
export function histogramBars(seed: string, isUp: boolean, pctMagnitude = 1): number[] {
  const rng = mulberry32(hashSeed(seed));
  // Normalize magnitude: 0% → 0.15 spread, 10% → 0.85 spread.
  const spread = Math.max(0.15, Math.min(0.85, Math.abs(pctMagnitude) / 12));
  // Direction lifts the back half of the day.
  const trendBias = isUp ? 1 : -1;
  const out: number[] = [];
  for (let i = 0; i < HIST_BARS; i++) {
    // Recent hours weighted heavier — gives a "now" feel to the right edge.
    const recency = i / (HIST_BARS - 1);
    const noise = rng();
    // Base height: 0.5 ± noise×spread, plus a recency-weighted trend kick.
    const base = 0.5 + (noise - 0.5) * spread + trendBias * recency * spread * 0.6;
    out.push(Math.max(0.08, Math.min(1, base)));
  }
  return out;
}

export const HISTOGRAM_BAR_COUNT = HIST_BARS;
