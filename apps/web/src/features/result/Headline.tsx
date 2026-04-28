import type { ResultResponse } from '@fantasytoken/shared';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { Label } from '../../components/ui/Label.js';
import { formatCents, formatPct } from '../../lib/format.js';

export interface HeadlineProps {
  result: ResultResponse;
  onShare: () => void;
}

export function Headline({ result, onShare }: HeadlineProps) {
  if (result.outcome === 'cancelled') {
    return (
      <Card variant="dim" shadow className="m-3 px-[14px] py-3 text-center">
        <Label>contest cancelled</Label>
        <div className="my-2 text-[24px] font-bold leading-tight">refund issued</div>
        <div className="text-[11px] text-muted">+{formatCents(result.entryFeeCents)} returned</div>
      </Card>
    );
  }
  if (result.outcome === 'won') {
    return (
      <Card variant="dim" shadow className="m-3 px-[14px] py-3 text-center">
        <Label>you won</Label>
        <div className="my-[6px] text-[42px] font-extrabold leading-none tracking-tight">
          {formatCents(result.prizeCents)}
        </div>
        <div className="text-[11px] text-muted">
          final P/L: {formatPct(result.finalPlPct)} · rank #{result.finalRank ?? '—'} of{' '}
          {result.totalEntries}
        </div>
        <div className="mt-[10px] flex items-center justify-center gap-[6px]">
          <Button size="sm" variant="primary" onClick={onShare}>
            ▷ Share
          </Button>
          <Button size="sm" variant="ghost">
            View on chain
          </Button>
        </div>
      </Card>
    );
  }
  // no_prize variant
  return (
    <Card variant="dim" shadow className="m-3 px-[14px] py-3 text-center">
      <Label>no prize this time</Label>
      <div className="my-2 text-[24px] font-bold leading-tight">{formatPct(result.finalPlPct)}</div>
      <div className="text-[11px] text-muted">
        rank #{result.finalRank ?? '—'} of {result.totalEntries}
      </div>
    </Card>
  );
}
