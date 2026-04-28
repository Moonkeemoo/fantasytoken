import type { ContestListItem } from '@fantasytoken/shared';
import { Bar } from '../../components/ui/Bar.js';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { Label } from '../../components/ui/Label.js';
import { formatCents, formatTimeLeft } from '../../lib/format.js';
import { useCountdown } from '../../lib/countdown.js';

export interface FeaturedHeroProps {
  contest: ContestListItem;
  onEnter: (id: string) => void;
}

export function FeaturedHero({ contest, onEnter }: FeaturedHeroProps) {
  const ms = useCountdown(contest.startsAt);
  return (
    <Card variant="dim" shadow className="m-3 px-[14px] py-3">
      <Label>★ FEATURED CONTEST</Label>
      <div className="mt-1 text-[15px] font-bold leading-tight">{contest.name}</div>
      <div className="mt-2 flex justify-between">
        <Stat label="prize pool" value={formatCents(contest.prizePoolCents)} />
        <Stat label="entry" value={formatCents(contest.entryFeeCents)} />
        <Stat label="time" value={formatTimeLeft(ms)} mono />
      </div>
      <div className="mt-2 flex items-center gap-[6px]">
        <Label>spots</Label>
        <div className="flex-1">
          <Bar value={contest.spotsFilled / contest.maxCapacity} />
        </div>
        <span className="font-mono text-[10px]">
          {contest.spotsFilled}/{contest.maxCapacity}
        </span>
      </div>
      <Button variant="primary" className="mt-[10px] w-full" onClick={() => onEnter(contest.id)}>
        Enter contest →
      </Button>
    </Card>
  );
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className={`text-[18px] font-bold leading-tight ${mono ? 'font-mono' : ''}`}>
        {value}
      </div>
    </div>
  );
}
