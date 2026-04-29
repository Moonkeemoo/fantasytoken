import type { ContestListItem } from '@fantasytoken/shared';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { formatCents, formatTimeLeft } from '../../lib/format.js';
import { useCountdown } from '../../lib/countdown.js';

export interface ContestRowProps {
  contest: ContestListItem;
  balanceCents: number;
  /** Caller's current rank — used to dim+lock contests above their rank. */
  userRank?: number;
  /** Tap to enter — for not-yet-entered scheduled contests. Routes to Team Builder. */
  onJoin: (id: string) => void;
  /** Tap to view live — for already-entered or active contests. Routes to Live page. */
  onView: (id: string) => void;
  /** Tap to view finished result — for finalized/cancelled contests. */
  onResult: (id: string) => void;
  onTopUp: () => void;
}

export function ContestRow({
  contest,
  balanceCents,
  userRank = 1,
  onJoin,
  onView,
  onResult,
  onTopUp,
}: ContestRowProps) {
  const ms = useCountdown(contest.startsAt);
  const isFull = contest.spotsFilled >= contest.maxCapacity;
  const cantAfford = balanceCents < contest.entryFeeCents;
  const fee = contest.entryFeeCents === 0 ? 'FR' : `$${Math.floor(contest.entryFeeCents / 100)}`;
  // Locked when contest gates by rank and user hasn't reached it yet — and they
  // haven't already managed to enter (legacy entries should still be visible).
  const isLocked = !contest.userHasEntered && contest.minRank > userRank;

  let cta: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    variant?: 'primary' | 'ghost';
  };
  if (isLocked) {
    cta = {
      label: `🔒 RANK ${contest.minRank}`,
      onClick: () => {},
      disabled: true,
      variant: 'ghost',
    };
  } else if (contest.userHasEntered) {
    if (contest.status === 'finalized' || contest.status === 'cancelled') {
      cta = { label: 'RESULT', onClick: () => onResult(contest.id), variant: 'ghost' };
    } else if (contest.status === 'active') {
      cta = { label: '● LIVE', onClick: () => onView(contest.id), variant: 'primary' };
    } else {
      cta = { label: 'VIEW', onClick: () => onView(contest.id), variant: 'ghost' };
    }
  } else if (contest.status !== 'scheduled') {
    cta = { label: 'CLOSED', onClick: () => {}, disabled: true, variant: 'ghost' };
  } else if (isFull) {
    cta = { label: 'FULL', onClick: () => {}, disabled: true, variant: 'ghost' };
  } else if (cantAfford && contest.entryFeeCents > 0) {
    cta = { label: 'Top up', onClick: onTopUp, variant: 'ghost' };
  } else {
    cta = { label: 'JOIN', onClick: () => onJoin(contest.id), variant: 'primary' };
  }

  // Second-line caption depends on status.
  let caption: string;
  if (contest.status === 'active') {
    caption = `LIVE NOW · ${contest.spotsFilled}/${contest.maxCapacity}`;
  } else if (contest.status === 'finalized' || contest.status === 'cancelled') {
    caption = `Final · ${contest.spotsFilled}/${contest.maxCapacity}`;
  } else {
    caption = `Win up to ${formatCents(contest.prizePoolCents)} · ${contest.spotsFilled}/${contest.maxCapacity} · ${formatTimeLeft(ms)}`;
  }

  const isBear = contest.type === 'bear';
  return (
    <Card
      className={`flex items-center gap-[10px] !px-[10px] !py-[6px] ${isBear ? 'border-l-[3px] border-l-hl-red' : ''} ${isLocked ? 'opacity-[0.55]' : ''}`}
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-ink bg-paper font-mono text-[9px] font-bold">
        {fee}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-[6px] text-[12px] font-bold leading-tight">
          {contest.name}
          <span
            className={`rounded-[2px] border-[1px] px-[4px] py-[1px] font-mono text-[8px] uppercase tracking-[0.06em] ${
              isBear ? 'border-hl-red text-hl-red' : 'border-hl-green text-hl-green'
            }`}
          >
            {isBear ? '↓ Bear' : '↑ Bull'}
          </span>
        </div>
        <div className="text-[10px] text-muted">{caption}</div>
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
