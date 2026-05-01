import { useMemo } from 'react';
import type { LineupFinalRow } from '@fantasytoken/shared';
import { fmtMoneyExact } from '@fantasytoken/shared';
import { Card } from '../../components/ui/Card.js';
import { Label } from '../../components/ui/Label.js';
import { TokenIcon } from '../../components/ui/TokenIcon.js';
import { formatPct } from '../../lib/format.js';

function fmtSpot(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  if (n < 1000) return `$${n.toFixed(2)}`;
  if (n < 1_000_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${(n / 1_000_000).toFixed(1)}M`;
}

export function LineupRecap({
  rows,
  budgetUsd,
}: {
  rows: LineupFinalRow[];
  /** Contest virtual budget so the section subheader can show committed $. */
  budgetUsd: number;
}): JSX.Element | null {
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const aPnl = a.alloc * a.finalPlPct;
        const bPnl = b.alloc * b.finalPlPct;
        return bPnl - aPnl;
      }),
    [rows],
  );
  if (sorted.length === 0) return null;
  const committedUsd = sorted.reduce((sum, r) => sum + (r.alloc / 100) * budgetUsd, 0);

  return (
    <div className="flex flex-col gap-[5px] px-3 py-2">
      <div className="flex items-baseline justify-between">
        <Label>your lineup · final</Label>
        <span className="text-[10px] text-muted">{fmtMoneyExact(committedUsd)} committed</span>
      </div>
      {sorted.map((r) => {
        const allocUsd = (r.alloc / 100) * budgetUsd;
        const contribUsd = allocUsd * r.finalPlPct;
        const isUp = contribUsd > 0;
        const isDown = contribUsd < 0;
        const borderLeftClass = isUp
          ? 'border-l-[2px] border-l-bull'
          : isDown
            ? 'border-l-[2px] border-l-bear'
            : '';
        const pnlColor = isUp ? 'text-bull' : isDown ? 'text-bear' : 'text-muted';
        const pnlLabel =
          contribUsd === 0
            ? '—'
            : `${isUp ? '+' : '−'}$${Math.abs(contribUsd).toFixed(
                Math.abs(contribUsd) < 1 ? 2 : 0,
              )}`;
        return (
          <Card
            key={r.symbol}
            className={`flex items-center gap-2 !px-[10px] !py-[8px] ${borderLeftClass}`}
          >
            <TokenIcon symbol={r.symbol} imageUrl={r.imageUrl} size={22} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold text-ink">{r.symbol}</div>
              <div className="font-mono text-[11px] text-ink-soft">
                {fmtSpot(r.startPriceUsd)} → {fmtSpot(r.finalPriceUsd)}
              </div>
            </div>
            <div className="text-right leading-tight">
              <div className={`font-mono text-[17px] font-medium ${pnlColor}`}>{pnlLabel}</div>
              <div className={`font-mono text-[11px] ${pnlColor}`}>{formatPct(r.finalPlPct)}</div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
