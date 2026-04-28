import type { ContestListItem } from '@fantasytoken/shared';
import { Button } from '../../components/ui/Button.js';

export interface ActiveBannerProps {
  active: ContestListItem[];
  onView: (id: string) => void;
}

export function ActiveBanner({ active, onView }: ActiveBannerProps) {
  if (active.length === 0) return null;
  const isMulti = active.length > 1;
  const c = active[0]!;
  return (
    <div className="m-3 flex items-center justify-between rounded-[4px] border-[1.5px] border-ink bg-paper-dim px-3 py-2">
      <div>
        <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-accent">
          ▶ LIVE NOW · contest {isMulti ? `${active.length} live` : '1 of 1'}
        </div>
        <div className="text-[12px] font-bold">{c.name}</div>
      </div>
      <Button size="sm" onClick={() => onView(c.id)}>
        VIEW
      </Button>
    </div>
  );
}
