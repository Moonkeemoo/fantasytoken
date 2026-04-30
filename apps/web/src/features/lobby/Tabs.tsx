import { Pill } from '../../components/ui/Pill.js';

// 'all' is a frontend-only concept (cash + free merged client-side).
// Order matters — pills render left-to-right in this order.
export type LobbyFilter = 'all' | 'cash' | 'free';

export interface TabsProps {
  active: LobbyFilter;
  counts: Record<LobbyFilter, number>;
  onChange: (f: LobbyFilter) => void;
}

const LABELS: Record<LobbyFilter, string> = {
  all: 'All',
  cash: 'Cash',
  free: 'Free',
};

export function Tabs({ active, counts, onChange }: TabsProps) {
  // Hide empty filter tabs — a "Cash · 0" pill just looks like dead space.
  // `All` always shows (even at 0) because it owns the merged-list contract.
  const filters = (Object.keys(LABELS) as LobbyFilter[]).filter(
    (f) => f === 'all' || counts[f] > 0,
  );
  return (
    <div className="flex gap-2 px-3 py-2">
      {filters.map((f) => (
        <Pill key={f} active={active === f} onClick={() => onChange(f)}>
          {LABELS[f]} · {counts[f]}
        </Pill>
      ))}
    </div>
  );
}
