import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { Label } from '../../components/ui/Label.js';
import { telegram } from '../../lib/telegram.js';
import { useInviteSheet } from '../referrals/useInviteSheet.js';

/**
 * Carousel sibling of FeaturedHero — same shape, invite content. Yellow note
 * background + "INVITE FRIENDS · F" header to mirror the design mockup. Tap
 * → opens the global InviteCardModal (handled by useInviteSheet).
 */
export function InviteSlide() {
  const showInviteSheet = useInviteSheet((s) => s.show);
  const onClick = () => {
    telegram.hapticImpact('light');
    showInviteSheet();
  };
  return (
    <Card shadow className="m-0 bg-note px-[14px] py-[14px]">
      <div className="flex items-center justify-between">
        <Label>invite friends</Label>
        <span className="rounded-[3px] border-[1.5px] border-accent bg-paper px-[6px] py-[1px] font-mono text-[10px] font-extrabold text-accent">
          F
        </span>
      </div>
      <div className="mt-[6px] text-[22px] font-extrabold leading-tight">
        Earn <span className="text-accent">5%</span> forever
      </div>
      <p className="mt-[4px] text-[12px] leading-snug text-ink-soft">
        Both of you get <span className="font-bold text-ink">$25</span> after their first contest —
        plus 5% of every entry they ever pay.
      </p>
      <div className="my-[10px] border-t border-dashed border-ink/40" />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>per friend</Label>
          <div className="mt-[2px] text-[18px] font-extrabold leading-none">$25</div>
        </div>
        <div>
          <Label>then forever</Label>
          <div className="mt-[2px] text-[18px] font-extrabold leading-none text-accent">5% cut</div>
        </div>
      </div>
      <Button variant="primary" size="md" className="mt-[12px] w-full" onClick={onClick}>
        Send invite link →
      </Button>
    </Card>
  );
}
