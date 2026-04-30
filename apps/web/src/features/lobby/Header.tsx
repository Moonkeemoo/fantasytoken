import { Label } from '../../components/ui/Label.js';
import { Avatar } from '../../components/ui/Avatar.js';
import { formatCents } from '../../lib/format.js';
import { RankChip } from '../rank/RankChip.js';
import { useRank } from '../rank/useRank.js';

export interface HeaderProps {
  firstName: string;
  photoUrl?: string | null | undefined;
  balanceCents: number;
  onTopUp: () => void;
}

export function Header({ firstName, photoUrl, balanceCents, onTopUp }: HeaderProps) {
  const rank = useRank();
  return (
    <div className="flex items-center justify-between gap-2 border-b-[1.5px] border-ink px-3 py-2">
      {/* Identity stack: avatar + greeting on top, rank chip directly below
          the name so it reads as "this is who I am, this is my tier". */}
      <div className="flex min-w-0 items-center gap-2">
        <Avatar name={firstName} url={photoUrl ?? null} size={32} />
        <div className="min-w-0 flex flex-col gap-0.5">
          <div className="truncate text-[13px] font-bold leading-tight text-ink">
            Hi, {firstName}
          </div>
          {rank.data ? (
            <div className="flex">
              <RankChip rank={rank.data} />
            </div>
          ) : (
            <Label>welcome</Label>
          )}
        </div>
      </div>
      {/* Wallet block: balance and top-up read as one piece — single border,
          shared bg, divider in between. Less visual noise than two siblings. */}
      <button
        type="button"
        onClick={onTopUp}
        className="flex shrink-0 items-stretch overflow-hidden rounded-md border border-ink bg-paper transition-colors active:bg-paper-dim"
        aria-label={`Balance ${formatCents(balanceCents)}, tap to top up`}
      >
        <span className="flex flex-col items-end justify-center gap-0 px-2.5 py-1 text-right leading-tight">
          <span className="font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-muted">
            balance
          </span>
          <span className="font-mono text-[12px] font-bold text-ink">
            {formatCents(balanceCents)}
          </span>
        </span>
        <span className="flex items-center justify-center border-l border-ink bg-ink px-2.5 font-mono text-[10px] font-bold uppercase tracking-wider text-paper">
          + Top up
        </span>
      </button>
    </div>
  );
}
