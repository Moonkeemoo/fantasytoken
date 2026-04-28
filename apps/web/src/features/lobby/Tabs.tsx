import type { ContestFilter } from '@fantasytoken/shared';

export interface TabsProps {
  active: ContestFilter;
  counts: Record<ContestFilter, number>;
  onChange: (f: ContestFilter) => void;
}

const LABELS: Record<ContestFilter, string> = {
  cash: 'Cash',
  free: 'Free',
  my: 'My',
};

export function Tabs({ active, counts, onChange }: TabsProps) {
  return (
    <div className="flex gap-2 p-3">
      {(Object.keys(LABELS) as ContestFilter[]).map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={`flex-1 rounded px-3 py-2 text-sm ${
            active === f ? 'bg-tg-button text-tg-button-text' : 'bg-tg-bg-secondary text-tg-text'
          }`}
        >
          {LABELS[f]} · {counts[f]}
        </button>
      ))}
    </div>
  );
}
