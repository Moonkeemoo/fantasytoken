import { histogramBars, HISTOGRAM_BAR_COUNT } from '@fantasytoken/shared';

export interface TokenHistogramProps {
  /** Seed (typically the token symbol) — same input → same shape. */
  symbol: string;
  /** Direction tint: bull green / bear red / neutral grey when null. */
  pctChange24h: number | null;
  /** Pixel width of the whole strip. Default 64 (~1/4 of a row). */
  width?: number;
  /** Pixel height. Default 24. */
  height?: number;
  className?: string;
}

/**
 * Mini histogram of 16 hourly bars showing the last 24h of trading.
 * Bars colored by net direction (up / down) and sized to suggest the
 * volatility magnitude. Used in TokenResultRow (Browse list) and
 * LiveTeam rows.
 *
 * V1 uses deterministic seed-based shapes (see shared/spark.ts) — not
 * a real price feed. Swap to real hourly snapshots when the backend
 * stores them.
 */
export function TokenHistogram({
  symbol,
  pctChange24h,
  width = 64,
  height = 24,
  className = '',
}: TokenHistogramProps): JSX.Element {
  const isUp = (pctChange24h ?? 0) >= 0;
  const heights = histogramBars(symbol, isUp, pctChange24h ?? 0);
  const color =
    pctChange24h === null
      ? 'rgb(var(--muted-rgb, 148 148 148) / 0.6)'
      : isUp
        ? 'rgb(var(--bull-rgb, 34 162 90))'
        : 'rgb(var(--bear-rgb, 200 50 50))';
  const gap = 1.5;
  const barWidth = (width - gap * (HISTOGRAM_BAR_COUNT - 1)) / HISTOGRAM_BAR_COUNT;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className={className}
    >
      {heights.map((h, i) => {
        const barH = Math.max(2, h * height);
        const x = i * (barWidth + gap);
        const y = height - barH;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barH}
            rx={1}
            fill={color}
            opacity={0.75 + (i / HISTOGRAM_BAR_COUNT) * 0.25}
          />
        );
      })}
    </svg>
  );
}
