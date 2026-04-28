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
  const fee = contest.entryFeeCents === 0 ? 'FR' : `$${Math.floor(contest.entryFeeCents / 100)}`;

  let cta: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    variant?: 'primary' | 'ghost';
  };
  if (isFull) {
    cta = { label: 'FULL', onClick: () => {}, disabled: true, variant: 'ghost' };
  } else if (cantAfford && contest.entryFeeCents > 0) {
    cta = { label: 'Top up', onClick: onTopUp, variant: 'ghost' };
  } else if (contest.userHasEntered) {
    cta = { label: 'JOINED', onClick: () => onJoin(contest.id), variant: 'ghost' };
  } else {
    cta = { label: 'JOIN', onClick: () => onJoin(contest.id), variant: 'primary' };
  }

  return (
    <Card className="flex items-center gap-[10px] !px-[10px] !py-[6px]">
      <div className="flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-ink bg-paper font-mono text-[9px] font-bold">
        {fee}
      </div>
      <div className="flex-1">
        <div className="text-[12px] font-bold leading-tight">{contest.name}</div>
        <div className="text-[10px] text-muted">
          Win up to {formatCents(contest.prizePoolCents)} · {contest.spotsFilled}/
          {contest.maxCapacity} · {formatTimeLeft(ms)}
        </div>
      </div>
      <Button
        variant={cta.variant ?? 'primary'}
        size="sm"
        onClick={cta.onClick}
        disabled={cta.disabled}
      >
        {cta.label}
      </Button>
    </Card>
  );
}
