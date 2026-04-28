import { useNavigate } from 'react-router-dom';
import { formatCents } from '../../lib/format.js';

export interface ContextBarProps {
  name: string;
  entryFeeCents: number;
  prizePoolCents: number;
  hasUnsavedPicks: boolean;
}

export function ContextBar({
  name,
  entryFeeCents,
  prizePoolCents,
  hasUnsavedPicks,
}: ContextBarProps) {
  const navigate = useNavigate();
  const onBack = () => {
    if (hasUnsavedPicks && !confirm('Discard your lineup?')) return;
    navigate(-1);
  };
  return (
    <div className="flex items-center justify-between border-b border-tg-text/10 p-3">
      <button onClick={onBack} className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-tg-text/20">
          ‹
        </span>
        <div className="text-left">
          <div className="text-sm font-bold">{name}</div>
          <div className="text-xs text-tg-hint">
            {formatCents(entryFeeCents)} entry · pool {formatCents(prizePoolCents)}
          </div>
        </div>
      </button>
      <span className="font-mono text-xs text-tg-hint">step 1/2</span>
    </div>
  );
}
