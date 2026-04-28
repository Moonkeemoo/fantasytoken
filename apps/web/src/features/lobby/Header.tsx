import { Button } from '../../components/ui/Button.js';
import { Label } from '../../components/ui/Label.js';
import { Avatar } from '../../components/ui/Avatar.js';
import { formatCents } from '../../lib/format.js';

export interface HeaderProps {
  firstName: string;
  photoUrl?: string | null | undefined;
  balanceCents: number;
  onTopUp: () => void;
}

export function Header({ firstName, photoUrl, balanceCents, onTopUp }: HeaderProps) {
  return (
    <div className="flex items-center justify-between border-b-[1.5px] border-ink px-3 py-2">
      <div className="flex items-center gap-2">
        <Avatar name={firstName} url={photoUrl ?? null} size={28} />
        <div>
          <div className="text-[12px] font-bold text-ink">Hi, {firstName}</div>
          <Label>balance · {formatCents(balanceCents)}</Label>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onTopUp}>
        + Top up
      </Button>
    </div>
  );
}
