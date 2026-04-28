import type { ResultResponse } from '@fantasytoken/shared';
import { formatCents } from '../../lib/format.js';

export function Breakdown({ result }: { result: ResultResponse }) {
  return (
    <div className="m-3 rounded border border-tg-text/10 bg-tg-bg-secondary p-3">
      <div className="text-xs uppercase tracking-wide text-tg-hint">breakdown</div>
      <div className="mt-2 flex justify-between text-xs">
        <span className="text-tg-hint">entry fee</span>
        <span>−{formatCents(result.entryFeeCents)}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-tg-hint">prize won</span>
        <span className={result.prizeCents > 0 ? 'font-bold text-green-600' : ''}>
          +{formatCents(result.prizeCents)}
        </span>
      </div>
      <div className="my-2 border-t border-dashed border-tg-text/20" />
      <div className="flex justify-between text-sm font-bold">
        <span>net</span>
        <span className={result.netCents >= 0 ? 'text-green-600' : 'text-tg-error'}>
          {result.netCents >= 0 ? '+' : ''}
          {formatCents(Math.abs(result.netCents))}
        </span>
      </div>
    </div>
  );
}
