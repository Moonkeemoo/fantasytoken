import type { ContestListItem, PrizeFormat } from '@fantasytoken/shared';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { formatTimeLeft } from '../../lib/format.js';
import { useCountdown } from '../../lib/countdown.js';

/** Short label shown on the format pill — DraftKings-style mode tag. */
function prizeFormatLabel(f: PrizeFormat): string {
  switch (f) {
    case 'linear':
      return 'PRACTICE';
    case '50_50':
      return '50/50';
    case '3x':
      return '3X';
    case '5x':
      return '5X';
    case 'gpp':
      return 'GPP';
  }
}

/** Long-form tooltip for the format pill — surfaces the rule at a glance. */
function prizeFormatTooltip(f: PrizeFormat): string {
  switch (f) {
    case 'linear':
      return 'Practice — every player wins 1–2 coins';
    case '50_50':
      return 'Top half doubles their entry · bottom half loses';
    case '3x':
      return 'Top 1/3 wins ~2.7× entry · rest lose';
    case '5x':
      return 'Top 1/5 wins ~4.5× entry · rest lose';
    case 'gpp':
      return 'Tournament — top 25% paid, top-heavy prizes';
  }
}

export interface ContestRowProps {
  contest: ContestListItem;
  balanceCents: number;
  /** Caller's current rank — used to dim+lock contests above their rank. */
  userRank?: number;
  /** Tap to enter — for not-yet-entered scheduled contests. Routes to Team Builder. */
  onJoin: (id: string) => void;
  /** Tap to view live — for already-entered active contests. Routes to Live. */
  onView: (id: string) => void;
  /** Tap to view the locked-room countdown — for entered scheduled contests. */
  onLocked: (id: string) => void;
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
  onLocked,
  onResult,
  onTopUp,
}: ContestRowProps) {
  const ms = useCountdown(contest.startsAt);
  const msToEnd = useCountdown(contest.endsAt);
  const isFull = contest.spotsFilled >= contest.maxCapacity;
  const cantAfford = balanceCents < contest.entryFeeCents;
  const isFree = contest.entryFeeCents === 0;
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
      // Pre-kickoff: route back to the locked-room waiting screen, not the
      // live screen (which would render an empty pre-start state and confuse
      // the player). User reported re-entering a scheduled contest dropped
      // them on the live page incorrectly.
      cta = { label: 'VIEW', onClick: () => onLocked(contest.id), variant: 'ghost' };
    }
  } else if (contest.status === 'active') {
    // Active + not entered → spectator (Lobby v2 Watch zone). Pre-v2 this
    // showed "CLOSED" because the lobby only ever surfaced scheduled
    // contests; with the spectator route live we route on tap.
    cta = { label: 'WATCH', onClick: () => onView(contest.id), variant: 'ghost' };
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
    // Live contests: show "ends in MM:SS" so spectators know how long they
    // have to watch. Without this the row read "LIVE NOW · 20/20" with no
    // sense of how soon the result drops.
    caption = `LIVE · ends in ${formatTimeLeft(msToEnd)} · ${contest.spotsFilled}/${contest.maxCapacity}`;
  } else if (contest.status === 'finalized' || contest.status === 'cancelled') {
    caption = `Final · ${contest.spotsFilled}/${contest.maxCapacity}`;
  } else {
    // Win-up copy switches by format. Multipliers / 50_50 advertise the
    // marketed multiple ("Win 1.8× / 2.7× / 4.5×"), GPP shows top prize
    // ("Win up to 🪙 N · top X paid"), Practice shows the friendly fixed
    // top prize ("Win up to 🪙 2").
    const fmt = contest.prizeFormat;
    const top = contest.topPrize > 0 ? contest.topPrize : null;
    let prizeLine: string;
    if (fmt === '50_50') prizeLine = 'Win ~1.8× entry';
    else if (fmt === '3x') prizeLine = 'Win ~2.7× entry';
    else if (fmt === '5x') prizeLine = 'Win ~4.5× entry';
    else if (top !== null) prizeLine = `Win up to 🪙 ${top}`;
    else prizeLine = 'Open';
    const cutoff = contest.payingRanks > 0 ? ` · top ${contest.payingRanks} paid` : '';
    caption = `${prizeLine}${cutoff} · ${contest.spotsFilled}/${contest.maxCapacity} · ${formatTimeLeft(ms)}`;
  }

  const isBear = contest.type === 'bear';
  return (
    <Card
      className={`flex items-center gap-[10px] !px-[10px] !py-[8px] ${isBear ? 'border-l-[3px] border-l-hl-red' : ''} ${isLocked ? 'opacity-[0.55]' : ''}`}
    >
      <div className="min-w-0 flex-1">
        {/* Top row: name + mode tag + fee tag. The fee escaped its old
            28×28 avatar circle (large coin amounts overflowed); inline pill
            shape scales to any digit count and reads as cost-information
            rather than "this is the contest's icon". */}
        <div className="flex flex-wrap items-center gap-[6px] text-[12px] font-bold leading-tight">
          <span className="truncate">{contest.name}</span>
          <span
            className={`rounded-[2px] border-[1px] px-[4px] py-[1px] font-mono text-[8px] uppercase tracking-[0.06em] ${
              isBear ? 'border-hl-red text-hl-red' : 'border-hl-green text-hl-green'
            }`}
          >
            {isBear ? '↓ Bear' : '↑ Bull'}
          </span>
          <span
            className={`rounded-[2px] px-[5px] py-[1px] font-mono text-[8px] font-bold uppercase tracking-[0.06em] ${
              isFree ? 'bg-hl-green text-paper' : 'border-[1px] border-ink bg-paper-dim text-ink'
            }`}
          >
            {isFree ? 'FREE' : `🪙 ${contest.entryFeeCents}`}
          </span>
          {/* Format pill — DraftKings-style mode tag so the player
              knows the prize structure at a glance (50/50 / 3X / GPP). */}
          {contest.prizeFormat !== 'linear' && (
            <span
              className="rounded-[2px] border-[1px] border-ink bg-paper px-[4px] py-[1px] font-mono text-[8px] font-bold uppercase tracking-[0.06em] text-ink"
              title={prizeFormatTooltip(contest.prizeFormat)}
            >
              {prizeFormatLabel(contest.prizeFormat)}
            </span>
          )}
        </div>
        <div className="mt-[2px] truncate text-[10px] text-muted">{caption}</div>
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
