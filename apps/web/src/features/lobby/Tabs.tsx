import type { ContestFilter } from '@fantasytoken/shared';
import { Pill } from '../../components/ui/Pill.js';

export interface TabsProps {
  active: ContestFilter;
  counts: Record<ContestFilter, number>;
  onChange: (f: ContestFilter) => void;
}

const LABELS: Record<ContestFilter, string> = {
  cash: 'Cash',
  free: 'Free',
  my: 'Live',
};

export function Tabs({ active, counts, onChange }: TabsProps) {
  return (
    <div className="flex gap-2 px-3 py-2">
      {(Object.keys(LABELS) as ContestFilter[]).map((f) => (
        <Pill key={f} active={active === f} onClick={() => onChange(f)}>
          {LABELS[f]} · {counts[f]}
        </Pill>
      ))}
    </div>
  );
}
