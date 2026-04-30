import type { LineupRow } from '@fantasytoken/shared';
import { fmtPnL } from '@fantasytoken/shared';
import { TokenIcon } from '../../components/ui/TokenIcon.js';
import { Label } from '../../components/ui/Label.js';
import type { ContestMode } from '../team-builder/AllocSheet.js';

export interface LiveTeamProps {
  rows: LineupRow[];
  mode: ContestMode;
}

/**
 * Per-token P&L list (TZ-001 §08.3). Helping/hurting determined by mode:
 * bull contest → token up = helping. bear contest → token down = helping.
 * 3px left border in the corresponding color makes the contribution status
 * legible in a glance without reading the number.
 *
 * TOP badge marks the single biggest \$-contributor when their P&L is positive.
 */
export function LiveTeam({ rows, mode }: LiveTeamProps): JSX.Element {
  const winner = rows
    .filter((r) => r.contribUsd > 0)
    .sort((a, b) => b.contribUsd - a.contribUsd)[0];

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
        {rows.map((r) => {
          const isHelping = mode === 'bull' ? r.pctChange > 0 : r.pctChange < 0;
          const isHurting = mode === 'bull' ? r.pctChange < 0 : r.pctChange > 0;
          const borderClass = isHelping
            ? 'border-l-bull'
            : isHurting
              ? 'border-l-bear'
              : 'border-l-line';
          const pctColor =
            r.pctChange > 0 ? 'text-bull' : r.pctChange < 0 ? 'text-bear' : 'text-muted';
          const isTop = winner?.symbol === r.symbol && r.contribUsd > 0;
          const pnlColor =
            r.contribUsd > 0 ? 'text-bull' : r.contribUsd < 0 ? 'text-bear' : 'text-ink';

          return (
            <li
              key={r.symbol}
              className={`flex items-center gap-2 rounded-md border border-l-[3px] ${borderClass} border-line bg-paper px-2 py-1.5`}
            >
              <TokenIcon symbol={r.symbol} imageUrl={r.imageUrl} size={26} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5 text-[12px]">
                  <b className="font-bold text-ink">{r.symbol}</b>
                  <span className="text-[10px] text-muted">{r.alloc}%</span>
                  {isTop && (
                    <span className="rounded bg-gold/20 px-1.5 py-px text-[9px] font-bold text-gold">
                      TOP
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className={`font-mono text-[14px] font-bold ${pnlColor}`}>
                  {fmtPnL(r.contribUsd)}
                </div>
                <div className={`text-[10px] ${pctColor}`}>
                  {r.pctChange > 0 ? '+' : ''}
                  {r.pctChange.toFixed(2)}%
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
