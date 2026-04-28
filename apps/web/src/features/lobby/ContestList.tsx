import type { ContestListItem } from '@fantasytoken/shared';
import { ContestRow } from './ContestRow.js';

export interface ContestListProps {
  items: ContestListItem[];
  balanceCents: number;
  onJoin: (id: string) => void;
  onTopUp: () => void;
}

export function ContestList({ items, balanceCents, onJoin, onTopUp }: ContestListProps) {
  if (items.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-sm text-tg-hint">
        No contests right now — check back later.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="text-xs uppercase tracking-wide text-tg-hint">All contests</div>
      {items.map((c) => (
        <ContestRow
          key={c.id}
          contest={c}
          balanceCents={balanceCents}
          onJoin={onJoin}
          onTopUp={onTopUp}
        />
      ))}
    </div>
  );
}
