/**
 * MomentBanner — single-shot in-game callout (TZ-001 §08.5).
 * Priority order: top-10 > climbing-fast > dropping-fast.
 * `rankDelta1h` is tracked client-side by useLiveSlice; null = no baseline yet.
 */

export interface MomentBannerProps {
  rank: number | null;
  /** Positive = climbed N ranks in last 1h. `null` until a baseline is recorded. */
  rankDelta1h: number | null;
}

const CLIMB_THRESHOLD = 10;
const DROP_THRESHOLD = -20;
const TOP_RANK = 10;

export function MomentBanner({ rank, rankDelta1h }: MomentBannerProps): JSX.Element | null {
  if (rank !== null && rank <= TOP_RANK) {
    return (
      <div className="mx-3 mt-3 rounded-md bg-gradient-to-r from-gold/30 via-gold/15 to-gold/30 px-3 py-2 text-center text-[12px] font-bold text-ink">
        🏆 You broke into top {TOP_RANK}! Keep the lead.
      </div>
    );
  }

  if (rankDelta1h !== null && rankDelta1h >= CLIMB_THRESHOLD) {
    return (
      <div className="mx-3 mt-3 rounded-md border border-bull/40 bg-bull/10 px-3 py-2 text-center text-[12px] font-bold text-bull">
        🚀 Climbing fast — {rankDelta1h} ranks in an hour
      </div>
    );
  }

  if (rankDelta1h !== null && rankDelta1h <= DROP_THRESHOLD) {
    return (
      <div className="mx-3 mt-3 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-center text-[12px] font-bold text-accent">
        ⚠️ Dropping fast — review your team
      </div>
    );
  }

  return null;
}
