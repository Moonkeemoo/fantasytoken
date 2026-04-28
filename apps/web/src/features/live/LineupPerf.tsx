import type { LineupRow } from '@fantasytoken/shared';
import { Bar } from '../../components/ui/Bar.js';
import { Card } from '../../components/ui/Card.js';
import { formatPct } from '../../lib/format.js';

export interface LineupPerfProps {
  rows: LineupRow[];
}

export function LineupPerf({ rows }: LineupPerfProps) {
  if (rows.length === 0) {
    return <div className="px-4 py-2 text-center text-xs text-tg-hint">no lineup</div>;
  }
  return (
    <div className="flex flex-col gap-1 p-3">
      <div className="text-xs uppercase tracking-wide text-tg-hint">your lineup · live</div>
      {rows.map((r) => {
        const pos = r.pctChange >= 0;
        const barWidth = Math.min(1, Math.abs(r.pctChange) * 4); // visualize 25% as full bar
        return (
          <Card key={r.symbol} className="flex items-center gap-2 p-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-tg-bg text-[8px] font-bold">
              {r.symbol}
            </div>
            <div className="flex-1 text-xs">
              <div className="font-bold">
                {r.symbol} <span className="font-normal text-tg-hint">{r.alloc}%</span>
              </div>
              <Bar value={pos ? barWidth : 0} />
            </div>
            <div className="text-right text-xs">
              <div className={`font-bold ${pos ? 'text-green-600' : 'text-tg-error'}`}>
                {formatPct(r.pctChange)}
              </div>
              <div className="text-tg-hint">
                {r.contribUsd >= 0 ? '+' : ''}${r.contribUsd.toFixed(2)} contrib
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
