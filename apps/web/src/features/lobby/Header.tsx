import { Button } from '../../components/ui/Button.js';
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
      <div className="flex min-w-0 items-center gap-2">
        <Avatar name={firstName} url={photoUrl ?? null} size={28} />
        <div className="min-w-0">
          <div className="truncate text-[12px] font-bold text-ink">Hi, {firstName}</div>
          <Label>balance · {formatCents(balanceCents)}</Label>
        </div>
      </div>
      <div className="flex items-center gap-[6px]">
        {rank.data && <RankChip rank={rank.data} />}
        <Button variant="ghost" size="sm" onClick={onTopUp}>
          + Top up
        </Button>
      </div>
    </div>
  );
}
