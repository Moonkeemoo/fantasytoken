import type { ResultResponse } from '@fantasytoken/shared';
import { Card } from '../../components/ui/Card.js';
import { Label } from '../../components/ui/Label.js';
import { formatCents } from '../../lib/format.js';

export function Breakdown({ result }: { result: ResultResponse }) {
  return (
    <Card className="m-3 px-[14px] py-2">
      <Label>breakdown</Label>
      <div className="mt-1 flex justify-between text-[11px]">
        <span className="text-muted">entry fee</span>
        <span>−{formatCents(result.entryFeeCents)}</span>
      </div>
      <div className="flex justify-between text-[11px]">
        <span className="text-muted">prize won</span>
        <span className={result.prizeCents > 0 ? 'font-bold text-hl-green' : ''}>
          +{formatCents(result.prizeCents)}
        </span>
      </div>
      <div className="my-[6px] border-t border-dashed border-rule" />
      <div className="flex justify-between text-[12px] font-bold">
        <span>net</span>
        <span className={result.netCents >= 0 ? 'text-hl-green' : 'text-hl-red'}>
          {result.netCents >= 0 ? '+' : ''}
          {formatCents(Math.abs(result.netCents))}
        </span>
      </div>
    </Card>
  );
}
