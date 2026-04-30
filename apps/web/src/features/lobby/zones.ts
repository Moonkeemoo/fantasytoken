import type { ContestListItem } from '@fantasytoken/shared';

/** Lobby zones (DESIGN.md §4). Each contest goes into exactly ONE zone per
 * user, by priority: My > Soon > Watch > Locked. */
export interface LobbyZones {
  /** Contests where the user has an entry, status ∈ {scheduled, active}. */
  my: ContestListItem[];
  /** Joinable: scheduled, not entered, rank-eligible. */
  soon: ContestListItem[];
  /** Spectator: active, not entered. (Includes rank-locked actives — you
   * can still watch a contest above your tier.) */
  watch: ContestListItem[];
  /** Rank-gated, scheduled — visible aspirational. */
  locked: ContestListItem[];
}

const IN_PROGRESS = new Set(['scheduled', 'active', 'finalizing']);

export function zoneContests(items: readonly ContestListItem[], userRank: number): LobbyZones {
  const my: ContestListItem[] = [];
  const soon: ContestListItem[] = [];
  const watch: ContestListItem[] = [];
  const locked: ContestListItem[] = [];

  for (const c of items) {
    // Priority 1 — user is in this contest, still in progress.
    if (c.userHasEntered && IN_PROGRESS.has(c.status)) {
      my.push(c);
      continue;
    }
    // Priority 2 — joinable: scheduled (pre-kickoff) AND rank-eligible.
    if (c.status === 'scheduled' && c.minRank <= userRank) {
      soon.push(c);
      continue;
    }
    // Priority 3 — spectator: any live contest you're not in.
    if (c.status === 'active') {
      watch.push(c);
      continue;
    }
    // Priority 4 — rank-locked aspirational. Only show scheduled (active +
    // rank-locked already routed to spectator above).
    if (c.status === 'scheduled' && c.minRank > userRank) {
      locked.push(c);
      continue;
    }
  }

  // Sort within each zone (DESIGN.md §4 sorting rules):
  //   My: ends_at ASC — most urgent ending first.
  //   Soon: starts_at ASC — soonest kickoff first.
  //   Watch: ends_at ASC — finishing soon first; high-stakes nudge later.
  //   Locked: rank-distance ASC — closest to unlock first.
  my.sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt));
  soon.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  watch.sort(
    (a, b) =>
      // primary: ends_at; secondary: high-stakes nudge (entryFee desc) so a
      // whale battle ending at the same time floats above a 🪙 1.
      Date.parse(a.endsAt) - Date.parse(b.endsAt) || b.entryFeeCents - a.entryFeeCents,
  );
  locked.sort((a, b) => a.minRank - b.minRank);

  return { my, soon, watch, locked };
}
