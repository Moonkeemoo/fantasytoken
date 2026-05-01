/**
 * Compact price + change pill. Replaces the V1 histogram per user
 * feedback ("графіки прибирай вони безтолкові"). Shows:
 *   - current price (formatted)
 *   - direction arrow (↑ green / ↓ red / · grey)
 *   - delta (% from a reference point — entry-relative on Live screens,
 *     24h on Browse)
 */

export interface PriceDeltaProps {
  /** Display price string (already formatted for sub-dollar precision). */
  price: string;
  /** Percentage change vs the reference point (entry on Live, 24h on Browse).
   * Pass as the raw % number, e.g. 2.5 for "+2.5%". */
  pct: number | null;
  /** Optional caption for the delta — "vs entry", "24h", etc. */
  refLabel?: string;
}

export function PriceDelta({ price, pct, refLabel }: PriceDeltaProps): JSX.Element {
  const arrow = pct === null ? '·' : pct > 0 ? '↑' : pct < 0 ? '↓' : '·';
  const colorClass = pct === null || pct === 0 ? 'text-muted' : pct > 0 ? 'text-bull' : 'text-bear';
  const pctLabel =
    pct === null ? '—' : `${pct > 0 ? '+' : ''}${pct.toFixed(Math.abs(pct) < 1 ? 2 : 1)}%`;

  return (
    <div className="flex flex-col items-end gap-px leading-none">
      <span className="font-mono text-[12px] font-bold text-ink">{price}</span>
      <span className={`flex items-center gap-1 font-mono text-[10px] ${colorClass}`}>
        <span className="text-[12px]">{arrow}</span>
        {pctLabel}
        {refLabel && <span className="text-muted">· {refLabel}</span>}
      </span>
    </div>
  );
}
