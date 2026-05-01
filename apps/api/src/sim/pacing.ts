import type { PacingShape } from './sim.config.js';

/**
 * Density functions over normalised time t ∈ [0, 1].
 *
 * Used by joinContest to modulate per-tick probability across the
 * scheduled-window — without this, every synth would race for entry
 * at tick #1 and the wave would land in a single 60s burst.
 *
 * Output range: ≈ [0, 2]. Mean of 1 over [0,1] for `bell` and `uniform`,
 * roughly 1 for `exponential` too (integral ≈ 1). Caller multiplies the
 * persona's baseRate × density(t) → effective per-tick probability.
 *
 * Edge cases: t outside [0,1] → clamp to bounds. t exactly 0 or 1
 * returns finite values — no divide-by-zero or NaN.
 */
export function density(shape: PacingShape, t: number): number {
  const x = Math.max(0, Math.min(1, t));
  switch (shape) {
    case 'uniform':
      return 1;
    case 'bell':
      // Centered Gaussian-ish, peak at t=0.4 (slightly early — most users
      // join after seeing a contest listed but before lock approaches).
      // Integral over [0,1] ≈ 1, so mean preserved.
      return Math.exp(-Math.pow((x - 0.4) / 0.25, 2)) * 1.6;
    case 'exponential':
      // Decay from t=0; lambda chosen so integral over [0,1] ≈ 1.
      // density(0) ≈ 2.0, density(1) ≈ 0.27.
      return 2 * Math.exp(-2 * x);
  }
}
