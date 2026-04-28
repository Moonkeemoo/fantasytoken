import type { LineupFinalRow } from '@fantasytoken/shared';
import { Card } from '../../components/ui/Card.js';
import { Label } from '../../components/ui/Label.js';
import { TokenIcon } from '../../components/ui/TokenIcon.js';
import { formatPct } from '../../lib/format.js';

export function LineupRecap({ rows }: { rows: LineupFinalRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-[5px] px-3 py-2">
      <Label>your lineup · final</Label>
      {rows.map((r) => (
        <Card key={r.symbol} className="flex items-center gap-2 !px-[10px] !py-[6px]">
          <TokenIcon symbol={r.symbol} imageUrl={r.imageUrl} size={22} />
          <div className="flex-1 text-[11px] font-bold">
            {r.symbol} <span className="font-normal text-muted">{r.alloc}%</span>
          </div>
          <div className="text-right text-[11px]">
            <div className={`font-bold ${r.finalPlPct >= 0 ? 'text-hl-green' : 'text-hl-red'}`}>
              {(() => {
                const contrib = r.alloc * r.finalPlPct;
                return `${contrib >= 0 ? '+' : '-'}$${Math.abs(contrib).toFixed(2)}`;
              })()}
            </div>
            <div className="text-[9px] text-muted">{formatPct(r.finalPlPct)} token</div>
          </div>
        </Card>
      ))}
    </div>
  );
}
