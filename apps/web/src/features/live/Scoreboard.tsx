import { useCountdown } from '../../lib/countdown.js';
import { Card } from '../../components/ui/Card.js';
import { Label } from '../../components/ui/Label.js';
import { formatCents, formatPct, formatPnl, formatTimeLeft } from '../../lib/format.js';

export interface ScoreboardProps {
  plPct: number;
  startUsd: number;
  currentUsd: number;
  rank: number | null;
  totalEntries: number;
  projectedPrizeCents: number;
  /** Prize for 1st place — shown pre-start where ranks haven't crystallized yet. */
  topPrizeCents: number;
  startsAt: string;
  endsAt: string;
  status: 'scheduled' | 'active' | 'finalizing' | 'finalized' | 'cancelled';
  /** When true, every entry receives a payout — subtitle reads "all positions paid". */
  payAll?: boolean;
}

export function Scoreboard({
  plPct,
  startUsd,
  currentUsd,
  rank,
  totalEntries,
  projectedPrizeCents,
  topPrizeCents,
  startsAt,
  endsAt,
  status,
  payAll = false,
}: ScoreboardProps) {
  const isPreStart = status === 'scheduled';
  const ms = useCountdown(isPreStart ? startsAt : endsAt);
  // When countdown to start is exhausted, the contest is technically still 'scheduled'
  // until the next tick locks it (≤10s). Show a transient "LOCKING" state instead of $0.
  const locking = isPreStart && ms <= 0;

  if (isPreStart) {
    return (
      <Card variant="dim" shadow className="m-3 px-[14px] py-4 text-center">
        <Label>{locking ? 'locking lineup' : 'starts in'}</Label>
        <div className="my-[10px] font-mono text-[42px] font-extrabold leading-none tracking-tight">
          {locking ? '…' : formatTimeLeft(ms)}
        </div>
        <div className="text-[11px] text-muted">
          {locking
            ? 'Bots filling empty seats'
            : `Get comfy — your $${startUsd.toFixed(0)} portfolio is set`}
        </div>
        <div className="mt-3 flex justify-between border-t border-dashed border-rule pt-[10px]">
          <Stat
            label="players"
            primary={`${totalEntries}`}
            sub={totalEntries === 1 ? 'just you so far' : 'in this room'}
          />
          <Stat
            label="potential prize"
            primary={formatCents(topPrizeCents)}
            sub={payAll ? 'all positions paid' : 'winner takes top'}
          />
        </div>
      </Card>
    );
  }

  return (
    <Card variant="dim" shadow className="m-3 px-[14px] py-3 text-center">
      <Label>your P&amp;L</Label>
      <div
        className={`my-[6px] text-[36px] font-extrabold leading-none tracking-tight ${plPct > 0 ? 'text-hl-green' : plPct < 0 ? 'text-hl-red' : ''}`}
      >
        {formatPnl(plPct)}
      </div>
      <div className="text-[11px] text-muted">
        {formatPct(plPct)} · ${startUsd.toFixed(2)} → ${currentUsd.toFixed(2)}
      </div>
      <div className="mt-3 flex justify-between border-t border-dashed border-rule pt-[10px]">
        <Stat label="rank" primary={rank !== null ? `#${rank}` : '—'} sub={`of ${totalEntries}`} />
        <Stat
          label="prize if end now"
          primary={formatCents(projectedPrizeCents)}
          sub={payAll ? 'all positions paid' : 'top 30% pays'}
        />
        <Stat label="time left" primary={formatTimeLeft(ms)} sub="hh:mm:ss" mono />
      </div>
    </Card>
  );
}

function Stat({
  label,
  primary,
  sub,
  mono = false,
}: {
  label: string;
  primary: string;
  sub: string;
  mono?: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className={`text-[18px] font-bold leading-tight ${mono ? 'font-mono' : ''}`}>
        {primary}
      </div>
      <div className="text-[9px] text-muted">{sub}</div>
    </div>
  );
}
