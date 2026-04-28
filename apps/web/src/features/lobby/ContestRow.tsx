import type { ContestListItem } from '@fantasytoken/shared';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { formatCents, formatTimeLeft } from '../../lib/format.js';
import { useCountdown } from '../../lib/countdown.js';

export interface ContestRowProps {
  contest: ContestListItem;
  balanceCents: number;
  onJoin: (id: string) => void;
  onTopUp: () => void;
}

export function ContestRow({ contest, balanceCents, onJoin, onTopUp }: ContestRowProps) {
  const ms = useCountdown(contest.startsAt);
  const isFull = contest.spotsFilled >= contest.maxCapacity;
  const cantAfford = balanceCents < contest.entryFeeCents;
  const fee = contest.entryFeeCents === 0 ? 'FREE' : formatCents(contest.entryFeeCents);

  let cta: { label: string; onClick: () => void; disabled?: boolean };
  if (isFull) {
    cta = { label: 'FULL', onClick: () => {}, disabled: true };
  } else if (cantAfford && contest.entryFeeCents > 0) {
    cta = { label: 'Top up', onClick: onTopUp };
  } else if (contest.userHasEntered) {
    cta = { label: 'Joined', onClick: () => onJoin(contest.id) };
  } else {
    cta = { label: 'JOIN', onClick: () => onJoin(contest.id) };
  }

  return (
    <Card className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-tg-bg text-xs">
        {fee}
      </div>
      <div className="flex-1">
        <div className="text-sm font-bold">{contest.name}</div>
        <div className="text-xs text-tg-hint">
          Win up to {formatCents(contest.prizePoolCents)} · {contest.spotsFilled}/
          {contest.maxCapacity} · {formatTimeLeft(ms)}
        </div>
      </div>
      <Button variant="primary" size="sm" onClick={cta.onClick} disabled={cta.disabled}>
        {cta.label}
      </Button>
    </Card>
  );
}
