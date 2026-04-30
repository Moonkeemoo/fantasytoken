import { Label } from '../../components/ui/Label.js';
import { Avatar } from '../../components/ui/Avatar.js';
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
    <div
      className="flex items-center justify-between gap-2 border-b-[1.5px] border-ink px-3 py-2"
      // iPhone notch / Dynamic Island guard. Without this the wallet pill
      // collides with the carrier bar on devices with safe-area top inset.
      style={{ paddingTop: 'max(8px, env(safe-area-inset-top))' }}
    >
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
      {/* Wallet block (TZ-002): coins balance + Top-up as one tap-target.
          The whole pill opens TopUpModal — the explicit "+" cap on the right
          tells the player there's a buy flow without forcing them to read. */}
      <button
        type="button"
        onClick={onTopUp}
        className="flex shrink-0 items-stretch overflow-hidden rounded-md border border-ink bg-paper transition-colors active:bg-paper-dim"
        aria-label={`Balance ${balanceCents.toLocaleString('en-US')} coins, tap to top up`}
      >
        <span className="flex items-center gap-1 px-2.5 py-1.5 leading-none">
          <span className="text-[14px]" aria-hidden="true">
            🪙
          </span>
          <span className="font-mono text-[13px] font-bold text-ink">
            {balanceCents.toLocaleString('en-US')}
          </span>
        </span>
        <span className="flex items-center justify-center border-l border-ink bg-ink px-2.5 font-mono text-[14px] font-bold leading-none text-paper">
          +
        </span>
      </button>
    </div>
  );
}
