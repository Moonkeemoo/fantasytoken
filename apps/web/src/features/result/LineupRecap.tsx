import type { LineupFinalRow } from '@fantasytoken/shared';
import { Card } from '../../components/ui/Card.js';
import { formatPct } from '../../lib/format.js';

export function LineupRecap({ rows }: { rows: LineupFinalRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 p-3">
      <div className="text-xs uppercase tracking-wide text-tg-hint">your lineup · final</div>
      {rows.map((r) => (
        <Card key={r.symbol} className="flex items-center gap-2 p-2 text-xs">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-tg-bg text-[8px] font-bold">
            {r.symbol}
          </div>
          <div className="flex-1 font-bold">
            {r.symbol} <span className="font-normal text-tg-hint">{r.alloc}%</span>
          </div>
          <div className={`font-bold ${r.finalPlPct >= 0 ? 'text-green-600' : 'text-tg-error'}`}>
            {formatPct(r.finalPlPct)}
          </div>
        </Card>
      ))}
    </div>
  );
}
