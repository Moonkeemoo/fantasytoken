import { useNavigate } from 'react-router-dom';
import { useCountdown } from '../../lib/countdown.js';
import { Label } from '../../components/ui/Label.js';
import { formatTimeLeft } from '../../lib/format.js';

export interface LiveHeaderProps {
  contestName: string;
  endsAt: string;
  status: 'scheduled' | 'active' | 'finalizing' | 'finalized' | 'cancelled';
}

export function LiveHeader({ contestName, endsAt, status }: LiveHeaderProps) {
  const navigate = useNavigate();
  const ms = useCountdown(endsAt);

  return (
    <div className="flex items-center justify-between border-b-[1.5px] border-ink px-3 py-2">
      <button onClick={() => navigate('/lobby')} className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-ink bg-paper text-[12px] leading-none">
          ‹
        </span>
        <div className="text-left">
          <div className="text-[12px] font-bold leading-tight">{contestName}</div>
          <Label>ends in {formatTimeLeft(ms)}</Label>
        </div>
      </button>
      {status === 'active' && (
        <span className="rounded-[3px] border-[1.5px] border-accent bg-accent px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-paper">
          ● LIVE
        </span>
      )}
      {status === 'scheduled' && (
        <span className="rounded-[3px] border-[1.5px] border-ink bg-paper-dim px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-muted">
          PRE-START
        </span>
      )}
    </div>
  );
}
