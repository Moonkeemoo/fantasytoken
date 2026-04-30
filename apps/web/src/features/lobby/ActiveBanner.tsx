import type { ContestListItem } from '@fantasytoken/shared';
import { Button } from '../../components/ui/Button.js';
import { useCountdown } from '../../lib/countdown.js';
import { formatTimeLeft } from '../../lib/format.js';

export interface ActiveBannerProps {
  inProgress: ContestListItem[];
  /** Route handler for active/finalizing contests → /live. */
  onView: (id: string) => void;
  /** Route handler for entered-but-pre-kickoff contests → /locked.
   * Critical: without this branch the banner sent scheduled-entered contests
   * to /live, where they rendered as a confused "PRE-START" empty state. */
  onLocked: (id: string) => void;
}

/**
 * Shown for any contest where the user is entered AND not yet finalized.
 * Status-aware: scheduled → "STARTS IN", active → "● LIVE NOW", finalizing → "WRAPPING UP".
 */
export function ActiveBanner({ inProgress, onView, onLocked }: ActiveBannerProps) {
  if (inProgress.length === 0) return null;
  const c = inProgress[0]!;
  const more = inProgress.length - 1;
  const target = c.status === 'scheduled' ? onLocked : onView;

  return (
    <div className="m-3 flex items-center justify-between rounded-[4px] border-[1.5px] border-ink bg-paper-dim px-3 py-2">
      <div>
        <BannerLabel contest={c} />
        <div className="text-[12px] font-bold leading-tight">
          {c.name}
          {more > 0 && <span className="ml-1 text-[10px] text-muted">(+{more} more)</span>}
        </div>
      </div>
      <Button size="sm" onClick={() => target(c.id)}>
        VIEW
      </Button>
    </div>
  );
}

function BannerLabel({ contest }: { contest: ContestListItem }) {
  const ms = useCountdown(contest.startsAt);
  if (contest.status === 'active') {
    return (
      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-accent">
        ▶ LIVE NOW · your contest
      </div>
    );
  }
  if (contest.status === 'finalizing') {
    return (
      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-muted">
        WRAPPING UP · your contest
      </div>
    );
  }
  return (
    <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-muted">
      STARTS IN {formatTimeLeft(ms)} · your contest
    </div>
  );
}
