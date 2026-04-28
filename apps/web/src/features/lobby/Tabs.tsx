import { Pill } from '../../components/ui/Pill.js';

export type LobbyFilter = 'cash' | 'free';

export interface TabsProps {
  active: LobbyFilter;
  counts: Record<LobbyFilter, number>;
  onChange: (f: LobbyFilter) => void;
}

const LABELS: Record<LobbyFilter, string> = {
  cash: 'Cash',
  free: 'Free',
};

export function Tabs({ active, counts, onChange }: TabsProps) {
  return (
    <div className="flex gap-2 px-3 py-2">
      {(Object.keys(LABELS) as LobbyFilter[]).map((f) => (
        <Pill key={f} active={active === f} onClick={() => onChange(f)}>
          {LABELS[f]} · {counts[f]}
        </Pill>
      ))}
    </div>
  );
}
