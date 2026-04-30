import type { ResultResponse } from '@fantasytoken/shared';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { Label } from '../../components/ui/Label.js';
import { formatCents, formatPct, formatPctPrecise, formatPnl } from '../../lib/format.js';

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
          P&amp;L: {formatPnl(result.finalPlPct)} ({formatPct(result.finalPlPct)}) · rank #
          {result.finalRank ?? '—'} of {result.totalEntries}
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
  // no_prize variant — the headline used to show the user's portfolio P&L
  // converted into "fake $" (e.g. +0.01% on a $100 budget rendered as
  // "+\$0.01"), which players reasonably mistook for an actual cent of
  // winnings landing on their balance. Show the rank as the big number
  // and label the P&L row explicitly as a percentage so nothing looks
  // like cash. The breakdown card below carries the truthful −\$1 net.
  const plClass =
    result.finalPlPct > 0 ? 'text-hl-green' : result.finalPlPct < 0 ? 'text-hl-red' : 'text-muted';
  return (
    <Card variant="dim" shadow className="m-3 px-[14px] py-3 text-center">
      <Label>no prize this time</Label>
      <div className="my-2 text-[36px] font-extrabold leading-none">
        #{result.finalRank ?? '—'}
        <span className="ml-1 text-[18px] font-bold text-muted">of {result.totalEntries}</span>
      </div>
      <div className={`text-[12px] font-mono uppercase tracking-[0.06em] ${plClass}`}>
        portfolio P&amp;L {formatPctPrecise(result.finalPlPct)}
      </div>
      <div className="mt-1 text-[10px] text-muted">
        {formatPct(result.finalPlPct)} on a 🪙 100 lineup — outside paying ranks
      </div>
    </Card>
  );
}
