import type { ContestListItem } from '@fantasytoken/shared';
import { Label } from '../../components/ui/Label.js';
import { ContestRow } from './ContestRow.js';

export interface ContestListProps {
  items: ContestListItem[];
  balanceCents: number;
  onJoin: (id: string) => void;
  onView: (id: string) => void;
  onResult: (id: string) => void;
  onTopUp: () => void;
  heading?: string;
}

export function ContestList({
  items,
  balanceCents,
  onJoin,
  onView,
  onResult,
  onTopUp,
  heading = 'All contests',
}: ContestListProps) {
  if (items.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[11px] text-muted">
        No contests right now — check back later.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-[6px] px-3 py-2">
      <Label>{heading}</Label>
      {items.map((c) => (
        <ContestRow
          key={c.id}
          contest={c}
          balanceCents={balanceCents}
          onJoin={onJoin}
          onView={onView}
          onResult={onResult}
          onTopUp={onTopUp}
        />
      ))}
    </div>
  );
}
