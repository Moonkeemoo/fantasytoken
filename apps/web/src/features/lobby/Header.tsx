import { Button } from '../../components/ui/Button.js';
import { formatCents } from '../../lib/format.js';

export interface HeaderProps {
  firstName: string;
  balanceCents: number;
  onTopUp: () => void;
}

export function Header({ firstName, balanceCents, onTopUp }: HeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-tg-text/10 p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-tg-button text-sm text-tg-button-text">
          {firstName.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="text-sm font-bold">Hi, {firstName}</div>
          <div className="text-xs text-tg-hint">balance · {formatCents(balanceCents)}</div>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onTopUp}>
        + Top up
      </Button>
    </div>
  );
}
