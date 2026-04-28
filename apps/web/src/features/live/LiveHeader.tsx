import { useNavigate } from 'react-router-dom';
import { useCountdown } from '../../lib/countdown.js';
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
    <div className="flex items-center justify-between border-b border-tg-text/10 p-3">
      <button onClick={() => navigate('/lobby')} className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-tg-text/20">
          ‹
        </span>
        <div className="text-left">
          <div className="text-sm font-bold">{contestName}</div>
          <div className="text-xs text-tg-hint">ends in {formatTimeLeft(ms)}</div>
        </div>
      </button>
      {status === 'active' && (
        <span className="rounded bg-tg-button px-2 py-1 text-xs font-bold text-tg-button-text">
          ● LIVE
        </span>
      )}
      {status === 'scheduled' && (
        <span className="rounded bg-tg-bg-secondary px-2 py-1 text-xs font-bold text-tg-hint">
          PRE-START
        </span>
      )}
    </div>
  );
}
