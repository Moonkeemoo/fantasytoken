import type { ContestListItem } from '@fantasytoken/shared';
import { Bar } from '../../components/ui/Bar.js';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { formatCents, formatTimeLeft } from '../../lib/format.js';
import { useCountdown } from '../../lib/countdown.js';

export interface FeaturedHeroProps {
  contest: ContestListItem;
  onEnter: (id: string) => void;
}

export function FeaturedHero({ contest, onEnter }: FeaturedHeroProps) {
  const ms = useCountdown(contest.startsAt);
  return (
    <Card className="m-3">
      <div className="text-xs uppercase tracking-wide text-tg-hint">★ Featured contest</div>
      <div className="mt-1 text-lg font-bold">{contest.name}</div>
      <div className="mt-2 flex justify-between">
        <Stat label="prize pool" value={formatCents(contest.prizePoolCents)} />
        <Stat label="entry" value={formatCents(contest.entryFeeCents)} />
        <Stat label="starts in" value={formatTimeLeft(ms)} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-tg-hint">spots</span>
        <div className="flex-1">
          <Bar value={contest.spotsFilled / contest.maxCapacity} />
        </div>
        <span className="font-mono text-xs">
          {contest.spotsFilled}/{contest.maxCapacity}
        </span>
      </div>
      <Button variant="primary" className="mt-3 w-full" onClick={() => onEnter(contest.id)}>
        Enter contest →
      </Button>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-tg-hint">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}
