import { Button } from '../../components/ui/Button.js';
import { Label } from '../../components/ui/Label.js';
import { formatCents } from '../../lib/format.js';
import { isValid, type LineupPick } from './lineupReducer.js';

export interface ConfirmBarProps {
  entryFeeCents: number;
  balanceCents: number;
  picks: LineupPick[];
  isSubmitting: boolean;
  onSubmit: () => void;
  onTopUp: () => void;
}

export function ConfirmBar({
  entryFeeCents,
  balanceCents,
  picks,
  isSubmitting,
  onSubmit,
  onTopUp,
}: ConfirmBarProps) {
  const valid = isValid(picks);
  const cantAfford = balanceCents < entryFeeCents;

  let cta: { label: string; onClick: () => void; disabled?: boolean };
  if (!valid) {
    cta = {
      label: `Pick ${5 - picks.length} more or fix allocation`,
      onClick: () => {},
      disabled: true,
    };
  } else if (cantAfford && entryFeeCents > 0) {
    cta = {
      label: `Top up ${formatCents(entryFeeCents - balanceCents)} to enter`,
      onClick: onTopUp,
    };
  } else if (isSubmitting) {
    cta = { label: 'Submitting…', onClick: () => {}, disabled: true };
  } else {
    cta = { label: 'Confirm & enter contest →', onClick: onSubmit };
  }

  return (
    <div className="sticky bottom-0 border-t-[1.5px] border-ink bg-paper px-[12px] py-[10px]">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <Label>entry fee</Label>
          <div className="text-[12px] font-bold">{formatCents(entryFeeCents)}</div>
        </div>
        <div className="text-right">
          <Label>your balance</Label>
          <div className="text-[12px] font-bold">{formatCents(balanceCents)}</div>
        </div>
      </div>
      <Button variant="primary" className="w-full" onClick={cta.onClick} disabled={cta.disabled}>
        {cta.label}
      </Button>
    </div>
  );
}
