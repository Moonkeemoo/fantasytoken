import { useNavigate } from 'react-router-dom';
import { Label } from '../../components/ui/Label.js';
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
    <div className="flex items-center justify-between border-b-[1.5px] border-ink px-3 py-2">
      <button onClick={onBack} className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-ink bg-paper text-[12px] leading-none">
          ‹
        </span>
        <div className="text-left">
          <div className="text-[12px] font-bold leading-tight">{name}</div>
          <Label>
            {formatCents(entryFeeCents)} entry · pool {formatCents(prizePoolCents)}
          </Label>
        </div>
      </button>
      <span className="font-mono text-[10px] text-muted">step 1/2</span>
    </div>
  );
}
