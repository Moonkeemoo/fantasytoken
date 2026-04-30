import type { ContestListItem } from '@fantasytoken/shared';

/**
 * Onboarding R1→R3 (DESIGN.md §8) — action-gated unlocks. Layered ON TOP
 * of rank gating: even if a contest is rank-eligible, we may hide it for
 * users who haven't finished enough contests yet, so the first-launch
 * lobby reads as a single curated path, not a wall of options.
 *
 *   finalizedContests = 0  →  show ONLY Practice in `soon`
 *   finalizedContests = 1  →  + Quick Match  (paid 🪙 1 bull)
 *   finalizedContests ≥ 3  →  unlock everything else (rank-permitting)
 *
 * Bear Trap follows the same path: hidden until 3 finalized so the user
 * has a baseline understanding of the bull mechanic before we introduce
 * the inverted score (INV-4).
 */
export function applyOnboardingGate(
  items: ContestListItem[],
  finalizedContests: number,
): ContestListItem[] {
  if (finalizedContests >= 3) return items; // post-onboarding: nothing hidden
  return items.filter((c) => {
    const isPractice = c.payAll && c.entryFeeCents === 0; // Practice == Free + pay-all
    if (isPractice) return true;

    // Free / 🪙 1 bull (Quick Match): show only after first finalized.
    if (c.entryFeeCents <= 1 && c.type === 'bull') {
      return finalizedContests >= 1;
    }

    // Bear contests + 🪙 5+ bulls: hide entirely until ≥ 3 finalized.
    return false;
  });
}
