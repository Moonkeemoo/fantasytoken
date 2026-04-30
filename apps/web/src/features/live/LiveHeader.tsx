import { useNavigate } from 'react-router-dom';
import { fmtMoney } from '@fantasytoken/shared';
import { useCountdown } from '../../lib/countdown.js';
import { formatTimeLeft } from '../../lib/format.js';
import type { ContestMode } from '../team-builder/lineupReducer.js';

export interface LiveHeaderProps {
  contestName: string;
  mode: ContestMode;
  /** Virtual budget in dollars (e.g. 100_000). UX-only. */
  tier: number;
  startsAt: string;
  endsAt: string;
  status: 'scheduled' | 'active' | 'finalizing' | 'finalized' | 'cancelled';
}

export function LiveHeader({ contestName, mode, tier, startsAt, endsAt, status }: LiveHeaderProps) {
  const navigate = useNavigate();
  const isPreStart = status === 'scheduled';
  const ms = useCountdown(isPreStart ? startsAt : endsAt);
  const locking = isPreStart && ms <= 0;

  const modePillClass =
    mode === 'bear' ? 'border-bear text-bear bg-bear/5' : 'border-bull text-bull bg-bull/5';

  const durationMinutes = Math.round(
    (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000,
  );
  const durationLabel =
    durationMinutes >= 60 * 24
      ? `${Math.round(durationMinutes / 60 / 24)}d`
      : durationMinutes >= 60
        ? `${Math.round(durationMinutes / 60)}h`
        : `${durationMinutes}m`;
  const endLabel = new Date(endsAt).toLocaleString('en-US', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <header className="border-b border-line">
      <div className="relative px-3 pb-2 pt-3 text-center">
        <button
          onClick={() => navigate('/lobby')}
          className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-ink bg-paper text-[12px] leading-none"
          aria-label="Back to lobby"
        >
          ‹
        </button>
        <div className="flex items-center justify-center gap-1.5 text-[14px] font-bold leading-tight">
          <span>{contestName}</span>
          <span
            className={`rounded-full border px-1.5 py-px text-[9px] font-bold uppercase ${modePillClass}`}
          >
            {mode}
          </span>
          <span className="rounded-full bg-ink px-1.5 py-px font-mono text-[9px] font-bold text-paper">
            {fmtMoney(tier)}
          </span>
        </div>
        <div className="mt-0.5 text-[10px] text-muted">
          {durationLabel} · ends {endLabel}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-dashed border-line px-3 py-1.5">
        {status === 'active' && (
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-accent">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            LIVE
          </span>
        )}
        {isPreStart && !locking && (
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
            Pre-start
          </span>
        )}
        {locking && (
          <span className="text-[11px] font-bold uppercase tracking-wider text-accent">
            Locking…
          </span>
        )}
        {(status === 'finalizing' || status === 'finalized') && (
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
            {status === 'finalizing' ? 'Finalizing…' : 'Finalized'}
          </span>
        )}
        <span className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <span className="text-[10px] uppercase tracking-wider text-muted">
            {isPreStart ? 'Starts in' : 'Ends in'}
          </span>
          <span className="font-mono text-[14px] font-bold leading-none text-ink">
            {locking ? '00:00' : formatTimeLeft(ms)}
          </span>
        </span>
      </div>
    </header>
  );
}
