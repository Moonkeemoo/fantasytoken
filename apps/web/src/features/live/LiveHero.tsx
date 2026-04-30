import { fmtPnL } from '@fantasytoken/shared';
import { formatCents } from '../../lib/format.js';
import { Label } from '../../components/ui/Label.js';

export interface LiveHeroProps {
  rank: number | null;
  totalEntries: number;
  /** Current portfolio P&L in dollars (e.g. +340, −96). */
  pnlUsd: number;
  /** Same value as `plPct` from the wire — already a percentage. */
  pctChange: number;
  /** Estimated prize at current rank in cents. `null` when not in money. */
  prizeEstCents: number | null;
}

/**
 * Split hero — both rank and P&L given equal visual weight (TZ-001 §08.2).
 * Rank tells the player where they stand; P&L tells them what they're earning.
 * Either alone is half the story.
 */
export function LiveHero({
  rank,
  totalEntries,
  pnlUsd,
  pctChange,
  prizeEstCents,
}: LiveHeroProps): JSX.Element {
  const trendUp = pnlUsd > 0;
  const trendDown = pnlUsd < 0;
  const pnlColor = trendUp ? 'text-bull' : trendDown ? 'text-bear' : 'text-ink';
  const pctSign = pctChange > 0 ? '+' : '';

  return (
    <section className="grid grid-cols-2 gap-2 px-3 pt-3">
      <div className="rounded-lg border border-line bg-paper-dim/50 p-3 text-center">
        <Label>Your rank</Label>
        <div className="mt-1 font-mono text-big-number text-ink">
          {rank === null ? '—' : `#${rank}`}
        </div>
        <div className="mt-1 text-[11px] text-muted">of {totalEntries}</div>
      </div>
      <div className="rounded-lg border border-line bg-paper-dim/50 p-3 text-center">
        <Label>Your portfolio</Label>
        <div className={`mt-1 font-mono text-pnl-big ${pnlColor}`}>{fmtPnL(pnlUsd)}</div>
        <div className={`text-[11px] ${pnlColor}`}>
          {pctSign}
          {pctChange.toFixed(2)}%
        </div>
        {prizeEstCents !== null && prizeEstCents > 0 && (
          <div className="mt-0.5 text-[10px] text-gold">
            prize est. {formatCents(prizeEstCents)}
          </div>
        )}
      </div>
    </section>
  );
}
