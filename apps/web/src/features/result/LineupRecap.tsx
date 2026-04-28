import type { LineupFinalRow } from '@fantasytoken/shared';
import { Card } from '../../components/ui/Card.js';
import { Label } from '../../components/ui/Label.js';
import { formatPct } from '../../lib/format.js';

export function LineupRecap({ rows }: { rows: LineupFinalRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-[5px] px-3 py-2">
      <Label>your lineup · final</Label>
      {rows.map((r) => (
        <Card key={r.symbol} className="flex items-center gap-2 !px-[10px] !py-[6px]">
          <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] border-ink bg-paper font-mono text-[8px] font-bold">
            {r.symbol}
          </div>
          <div className="flex-1 text-[11px] font-bold">
            {r.symbol} <span className="font-normal text-muted">{r.alloc}%</span>
          </div>
          <div
            className={`text-[11px] font-bold ${r.finalPlPct >= 0 ? 'text-hl-green' : 'text-hl-red'}`}
          >
            {formatPct(r.finalPlPct)}
          </div>
        </Card>
      ))}
    </div>
  );
}
