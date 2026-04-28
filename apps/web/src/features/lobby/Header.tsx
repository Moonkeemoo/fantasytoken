import { Button } from '../../components/ui/Button.js';
import { Label } from '../../components/ui/Label.js';
import { formatCents } from '../../lib/format.js';

export interface HeaderProps {
  firstName: string;
  balanceCents: number;
  onTopUp: () => void;
}

export function Header({ firstName, balanceCents, onTopUp }: HeaderProps) {
  return (
    <div className="flex items-center justify-between border-b-[1.5px] border-ink px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-ink bg-paper text-[11px] font-bold text-ink">
          {firstName.charAt(0).toUpperCase()}
        </div>
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
