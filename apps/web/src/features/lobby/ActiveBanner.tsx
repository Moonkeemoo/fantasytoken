import type { ContestListItem } from '@fantasytoken/shared';
import { Button } from '../../components/ui/Button.js';

export interface ActiveBannerProps {
  active: ContestListItem[];
  onView: (id: string) => void;
}

export function ActiveBanner({ active, onView }: ActiveBannerProps) {
  if (active.length === 0) return null;
  if (active.length === 1) {
    const c = active[0]!;
    return (
      <div className="flex items-center justify-between bg-tg-button/10 px-4 py-2">
        <div>
          <div className="text-xs font-bold uppercase text-tg-button">▶ Live now</div>
          <div className="text-sm">{c.name}</div>
        </div>
        <Button variant="primary" size="sm" onClick={() => onView(c.id)}>
          VIEW
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between bg-tg-button/10 px-4 py-2">
      <div>
        <div className="text-xs font-bold uppercase text-tg-button">▶ Live now</div>
        <div className="text-sm">{active.length} contests live</div>
      </div>
      <Button variant="primary" size="sm" onClick={() => onView(active[0]!.id)}>
        VIEW
      </Button>
    </div>
  );
}
