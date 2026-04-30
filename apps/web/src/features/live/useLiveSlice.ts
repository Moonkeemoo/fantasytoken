import { useEffect, useMemo, useRef } from 'react';
import type { LeaderboardEntry, LiveResponse } from '@fantasytoken/shared';

/**
 * Derives leaderboard slices and a client-side `rankDelta1h` from successive
 * Live responses (TZ-001 §08.5 MomentBanner, ADR-0003 var. A).
 *
 * `rankDelta1h` is computed by sampling rank-vs-time into a ring buffer and
 * comparing the current rank against the oldest sample within a ~1h window.
 * Lossy by design — it's a UX hint, not an audit log. When the user re-opens
 * the screen the buffer starts fresh: showing no banner is better than
 * inventing motion that didn't happen this session.
 */

interface RankSample {
  rank: number;
  at: number;
}

const ONE_HOUR_MS = 60 * 60_000;
const MAX_SAMPLES = 240; // safety cap (~30s polling × 240 = 2h coverage)

export interface LiveSlice {
  /** Window of 5 entries centred on `me` (or empty if me not present). */
  aroundMe: LeaderboardEntry[];
  /** Positive = climbed N ranks; negative = dropped N. `null` if no baseline yet. */
  rankDelta1h: number | null;
}

export function useLiveSlice(live: LiveResponse | null): LiveSlice {
  const samplesRef = useRef<RankSample[]>([]);

  useEffect(() => {
    if (!live || live.rank === null) return;
    const now = Date.now();
    const samples = samplesRef.current;
    samples.push({ rank: live.rank, at: now });
    // Drop entries older than 1h + ring-buffer cap.
    const cutoff = now - ONE_HOUR_MS;
    while (samples.length > 0 && samples[0]!.at < cutoff) samples.shift();
    while (samples.length > MAX_SAMPLES) samples.shift();
  }, [live]);

  return useMemo<LiveSlice>(() => {
    if (!live) return { aroundMe: [], rankDelta1h: null };

    const all = live.leaderboardAll;
    const meIdx = all.findIndex((e) => e.isMe);
    const aroundMe =
      meIdx === -1 ? [] : all.slice(Math.max(0, meIdx - 2), Math.min(all.length, meIdx + 3));

    let rankDelta1h: number | null = null;
    const samples = samplesRef.current;
    if (live.rank !== null && samples.length >= 2) {
      const baseline = samples[0]!;
      // Lower rank number = better. delta>0 means climbing.
      rankDelta1h = baseline.rank - live.rank;
    }

    return { aroundMe, rankDelta1h };
  }, [live]);
}
