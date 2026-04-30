import { dollarsFor, fmtMoney } from '@fantasytoken/shared';
import { TokenIcon } from '../../components/ui/TokenIcon.js';
import type { LineupPick } from './lineupReducer.js';

export interface LineupSlotProps {
  /** `null` → empty slot ("+" prompt). */
  pick: LineupPick | null;
  tier: number;
  onClick: () => void;
}

/**
 * One of the 5 portfolio slots. $-amount is the headline; alloc% is the
 * secondary line. Tap on a filled slot opens AllocSheet in edit mode; tap on
 * an empty slot is a no-op in v1 (handoff §5.2 "залишимо empty state кліком
 * на token у списку").
 */
export function LineupSlot({ pick, tier, onClick }: LineupSlotProps): JSX.Element {
  if (pick === null) {
    return (
      <button
        type="button"
        disabled
        className="flex h-[68px] flex-1 cursor-not-allowed items-center justify-center rounded-md border border-dashed border-line bg-paper-dim/50 text-[18px] font-bold text-muted"
        aria-label="Empty slot"
      >
        +
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[68px] flex-1 flex-col items-center justify-center gap-0.5 rounded-md border border-line bg-paper px-2 text-center transition-colors hover:bg-paper-dim"
      aria-label={`${pick.symbol} ${pick.alloc}% — tap to edit`}
    >
      <TokenIcon symbol={pick.symbol} imageUrl={pick.imageUrl ?? null} size={20} />
      <span className="font-mono text-[11px] font-bold leading-tight text-ink">
        {fmtMoney(dollarsFor(pick.alloc, tier))}
      </span>
      <span className="text-[9px] text-muted">{pick.alloc}%</span>
    </button>
  );
}
