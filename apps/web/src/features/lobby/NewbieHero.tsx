import type { ContestListItem } from '@fantasytoken/shared';
import { Card } from '../../components/ui/Card.js';
import { Button } from '../../components/ui/Button.js';
import { Label } from '../../components/ui/Label.js';

export interface NewbieHeroProps {
  /** The Practice contest pulled from the soon zone — caller resolves it
   * and decides whether to render us. */
  contest: ContestListItem;
  onJoin: (id: string) => void;
}

/**
 * First-launch hero card for brand-new users (`finalizedContests === 0`).
 *
 * The plain ContestList row reads as "one of many cells" the moment the
 * lobby has 8+ items — newcomers reported feeling overwhelmed even though
 * onboarding-gate already filtered Soon to a single Practice card. A
 * full-width hero pulls the eye to the one action that's actually theirs
 * to take, then the rest of the lobby is just context.
 *
 * Quietly disappears once the player finishes their first contest — see
 * Lobby.tsx callsite.
 */
export function NewbieHero({ contest, onJoin }: NewbieHeroProps): JSX.Element {
  return (
    <Card shadow className="m-3 bg-note px-[14px] py-3">
      <div className="flex items-center justify-between">
        <Label>start here</Label>
        <span className="rounded-[3px] border-[1.5px] border-accent bg-paper px-[6px] py-[1px] font-mono text-[10px] font-extrabold text-accent">
          F
        </span>
      </div>
      <div className="mt-[6px] text-[22px] font-extrabold leading-tight">
        {contest.name} <span className="text-accent">· FREE</span>
      </div>
      <p className="mt-[4px] text-[12px] leading-snug text-ink-soft">
        Pick 5 tokens. Allocate 100% of your $100 budget. 10 minutes. Every position pays — you
        can&apos;t lose coins here.
      </p>
      <div className="my-[10px] border-t border-dashed border-ink/40" />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>entry</Label>
          <div className="mt-[2px] text-[18px] font-extrabold leading-none">FREE</div>
        </div>
        <div>
          <Label>round</Label>
          <div className="mt-[2px] text-[18px] font-extrabold leading-none text-accent">10 min</div>
        </div>
      </div>
      <Button
        variant="primary"
        size="md"
        className="mt-[12px] w-full"
        onClick={() => onJoin(contest.id)}
      >
        Join Practice →
      </Button>
    </Card>
  );
}
