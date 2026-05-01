import { useMemo } from 'react';
import type { LineupRow } from '@fantasytoken/shared';
import { fmtPnL } from '@fantasytoken/shared';
import { TokenIcon } from '../../components/ui/TokenIcon.js';
import { Label } from '../../components/ui/Label.js';
import { formatPct } from '../../lib/format.js';

function fmtPriceCompact(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  if (n < 1000) return `$${n.toFixed(2)}`;
  if (n < 1_000_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${(n / 1_000_000).toFixed(1)}M`;
}

export interface LiveTeamProps {
  rows: LineupRow[];
}

/**
 * Per-token P&L list (TZ-004 cleanup).
 *
 *   [icon] SYM                       $57.62      −$2
 *                                    −0.09%   −0.09%
 *
 * Left subtitle: current price + change-since-entry (sign-coded).
 * Right hero: $ PnL (mode-aware) + score %.
 * Border-left tints helping/hurting; rows sorted by $ PnL descending.
 */
export function LiveTeam({ rows }: LiveTeamProps): JSX.Element {
  const sorted = useMemo(() => [...rows].sort((a, b) => b.contribUsd - a.contribUsd), [rows]);
  const winner = sorted.find((r) => r.contribUsd > 0);

  return (
    <section className="px-3 pt-4">
      <div className="flex items-baseline justify-between">
        <Label>Your team</Label>
        {winner && (
          <span className="text-[11px] text-bull">
            ⭐ {winner.symbol} carrying · {fmtPnL(winner.contribUsd)}
          </span>
        )}
      </div>
      <ul className="mt-2 space-y-1.5">
        {sorted.map((r) => {
          const isHelping = r.contribUsd > 0;
          const isHurting = r.contribUsd < 0;
          // Border-left only on non-neutral rows (TZ-004 §1).
          const borderLeftClass = isHelping
            ? 'border-l-[2px] border-l-bull'
            : isHurting
              ? 'border-l-[2px] border-l-bear'
              : '';
          const isTop = winner?.symbol === r.symbol && r.contribUsd > 0;
          const pnlColor = isHelping ? 'text-bull' : isHurting ? 'text-bear' : 'text-muted';
          const sinceEntryColor =
            r.pctChange > 0 ? 'text-bull' : r.pctChange < 0 ? 'text-bear' : 'text-muted';
          // $0 → em-dash so dead rows don't shout.
          const pnlLabel = r.contribUsd === 0 ? '—' : fmtPnL(r.contribUsd);

          return (
            <li
              key={r.symbol}
              className={`flex items-center gap-2 rounded-md border border-line bg-paper px-2 py-1.5 ${borderLeftClass}`}
            >
              <TokenIcon symbol={r.symbol} imageUrl={r.imageUrl} size={26} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5 text-[13px]">
                  <b className="font-bold text-ink">{r.symbol}</b>
                  {isTop && (
                    <span className="rounded bg-gold/20 px-1.5 py-px text-[9px] font-bold text-gold">
                      TOP
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1.5 font-mono text-[11px] text-ink-soft">
                  <span>{fmtPriceCompact(r.currentPriceUsd)}</span>
                  <span className={sinceEntryColor}>{formatPct(r.pctChange)}</span>
                </div>
              </div>
              <div className="text-right leading-tight">
                <div className={`font-mono text-[17px] font-medium ${pnlColor}`}>{pnlLabel}</div>
                <div className={`font-mono text-[11px] ${pnlColor}`}>
                  {formatPct(r.contribUsd / 100)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
