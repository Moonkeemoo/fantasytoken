import type { LineupRow } from '@fantasytoken/shared';
import { Card } from '../../components/ui/Card.js';
import { Label } from '../../components/ui/Label.js';
import { TokenIcon } from '../../components/ui/TokenIcon.js';
import { formatPct } from '../../lib/format.js';

export interface LineupPerfProps {
  rows: LineupRow[];
}

export function LineupPerf({ rows }: LineupPerfProps) {
  if (rows.length === 0) {
    return <div className="px-4 py-2 text-center text-[10px] text-muted">no lineup</div>;
  }
  return (
    <div className="flex flex-col gap-[5px] px-3 py-2">
      <Label>your lineup · live</Label>
      {rows.map((r) => {
        const pos = r.pctChange >= 0;
        const barWidth = Math.min(1, Math.abs(r.pctChange) * 4);
        return (
          <Card key={r.symbol} className="flex items-center gap-2 !px-[10px] !py-[6px]">
            <TokenIcon symbol={r.symbol} imageUrl={r.imageUrl} size={22} />
            <div className="flex-1 text-[11px]">
              <div className="font-bold leading-tight">
                {r.symbol} <span className="font-normal text-muted">{r.alloc}%</span>
              </div>
              <div className="mt-[3px] h-1 w-full overflow-hidden rounded-full bg-paper-dim">
                <div
                  className={`h-full ${pos ? 'bg-hl-green' : 'bg-hl-red'}`}
                  style={{ width: `${barWidth * 100}%` }}
                />
              </div>
            </div>
            <div className="text-right text-[11px]">
              <div className={`font-bold ${pos ? 'text-hl-green' : 'text-hl-red'}`}>
                {r.contribUsd >= 0 ? '+' : '-'}${Math.abs(r.contribUsd).toFixed(2)}
              </div>
              <div className="text-[9px] text-muted">{formatPct(r.pctChange)} token</div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
