import type { ResultResponse } from '@fantasytoken/shared';
import { Button } from '../../components/ui/Button.js';
import { formatCents, formatPct } from '../../lib/format.js';

export interface HeadlineProps {
  result: ResultResponse;
  onShare: () => void;
}

export function Headline({ result, onShare }: HeadlineProps) {
  if (result.outcome === 'cancelled') {
    return (
      <div className="m-3 rounded border border-tg-text/10 bg-tg-bg-secondary p-4 text-center">
        <div className="text-xs uppercase tracking-wide text-tg-hint">contest cancelled</div>
        <div className="my-2 text-2xl font-bold">refund issued</div>
        <div className="text-xs text-tg-hint">+{formatCents(result.entryFeeCents)} returned</div>
      </div>
    );
  }
  if (result.outcome === 'won') {
    return (
      <div className="m-3 rounded border border-tg-text/10 bg-tg-bg-secondary p-4 text-center">
        <div className="text-xs uppercase tracking-wide text-tg-hint">you won</div>
        <div className="my-2 text-4xl font-extrabold">{formatCents(result.prizeCents)}</div>
        <div className="text-xs text-tg-hint">
          final P/L: {formatPct(result.finalPlPct)} · rank #{result.finalRank ?? '—'} of{' '}
          {result.totalEntries}
        </div>
        <div className="mt-3 flex justify-center gap-2">
          <Button size="sm" variant="primary" onClick={onShare}>
            ▷ Share
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="m-3 rounded border border-tg-text/10 bg-tg-bg-secondary p-4 text-center">
      <div className="text-xs uppercase tracking-wide text-tg-hint">no prize this time</div>
      <div className="my-2 text-2xl font-bold">{formatPct(result.finalPlPct)}</div>
      <div className="text-xs text-tg-hint">
        rank #{result.finalRank ?? '—'} of {result.totalEntries}
      </div>
    </div>
  );
}
