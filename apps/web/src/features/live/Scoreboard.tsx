import { useCountdown } from '../../lib/countdown.js';
import { formatCents, formatPct, formatTimeLeft } from '../../lib/format.js';

export interface ScoreboardProps {
  plPct: number;
  startUsd: number;
  currentUsd: number;
  rank: number | null;
  totalEntries: number;
  projectedPrizeCents: number;
  endsAt: string;
}

export function Scoreboard({
  plPct,
  startUsd,
  currentUsd,
  rank,
  totalEntries,
  projectedPrizeCents,
  endsAt,
}: ScoreboardProps) {
  const ms = useCountdown(endsAt);
  return (
    <div className="m-3 rounded border border-tg-text/10 bg-tg-bg-secondary p-4 text-center">
      <div className="text-xs uppercase tracking-wide text-tg-hint">your performance</div>
      <div className="my-2 text-4xl font-extrabold tracking-tight">{formatPct(plPct)}</div>
      <div className="text-xs text-tg-hint">
        portfolio: ${startUsd.toFixed(2)} → ${currentUsd.toFixed(2)}
      </div>
      <div className="mt-3 flex justify-between border-t border-dashed border-tg-text/20 pt-3">
        <Stat label="rank" primary={rank !== null ? `#${rank}` : '—'} sub={`of ${totalEntries}`} />
        <Stat
          label="prize if end now"
          primary={formatCents(projectedPrizeCents)}
          sub="top 30% pays"
        />
        <Stat label="time left" primary={formatTimeLeft(ms)} sub="hh:mm" />
      </div>
    </div>
  );
}

function Stat({ label, primary, sub }: { label: string; primary: string; sub: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-tg-hint">{label}</div>
      <div className="text-lg font-bold">{primary}</div>
      <div className="text-xs text-tg-hint">{sub}</div>
    </div>
  );
}
