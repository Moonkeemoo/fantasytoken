import type { LineupRow } from '@fantasytoken/shared';
import { fmtPnL } from '@fantasytoken/shared';
import { TokenIcon } from '../../components/ui/TokenIcon.js';
import { TokenHistogram } from '../../components/ui/TokenHistogram.js';
import { Label } from '../../components/ui/Label.js';

export interface LiveTeamProps {
  rows: LineupRow[];
}

/**
 * Per-token P&L list (TZ-001 §08.3). Mode-aware accounting is on the backend
 * (contribUsd is inverted for Bear so a falling token contributes positively),
 * which lets the UI use a single sign-comparison for helping/hurting/TOP.
 */
export function LiveTeam({ rows }: LiveTeamProps): JSX.Element {
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
          // contribUsd is mode-aware on the backend (Bear inverts), so the
          // helping/hurting/TOP logic is straightforward sign comparison.
          const isHelping = r.contribUsd > 0;
          const isHurting = r.contribUsd < 0;
          const borderClass = isHelping
            ? 'border-l-bull'
            : isHurting
              ? 'border-l-bear'
              : 'border-l-line';
          // pctChange stays raw — universal "price up = green, down = red".
          // In Bear the player still sees red on a falling token (true) but
          // the dollar PnL beside it is green (player benefits). That dual
          // signal is correct and informative.
          const pctColor =
            r.pctChange > 0 ? 'text-bull' : r.pctChange < 0 ? 'text-bear' : 'text-muted';
          const isTop = winner?.symbol === r.symbol && r.contribUsd > 0;
          const pnlColor = isHelping ? 'text-bull' : isHurting ? 'text-bear' : 'text-ink';

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
              {/* Mini histogram of the last 24h — direction tints the bars
                  (bull / bear), magnitude spreads them. Same primitive as
                  the Browse list so the player builds a single visual
                  language across the app. */}
              <TokenHistogram
                symbol={r.symbol}
                pctChange24h={r.pctChange * 100}
                width={48}
                height={20}
                className="shrink-0"
              />
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
