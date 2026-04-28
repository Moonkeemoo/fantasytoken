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
  startsAt: string;
  endsAt: string;
  status: 'scheduled' | 'active' | 'finalizing' | 'finalized' | 'cancelled';
}

export function Scoreboard({
  plPct,
  startUsd,
  currentUsd,
  rank,
  totalEntries,
  projectedPrizeCents,
  startsAt,
  endsAt,
  status,
}: ScoreboardProps) {
  const isPreStart = status === 'scheduled';
  const ms = useCountdown(isPreStart ? startsAt : endsAt);
  const timeLabel = isPreStart ? 'starts in' : 'time left';

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
          sub="top 30% pays"
        />
        <Stat label={timeLabel} primary={formatTimeLeft(ms)} sub="hh:mm:ss" mono />
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
