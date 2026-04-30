import { useQuery } from '@tanstack/react-query';
import { ContestListItem } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

/**
 * Polls contest meta every 30s for room-fill / kickoff transition.
 *
 * Once a dedicated /contests/:id/state endpoint ships (handoff §10.2), swap
 * the schema and add `pendingState.activity` to the response. The hook signature
 * is forward-compatible — callers only consume the fields exposed below.
 */
export function useLockedState(contestId: string | undefined) {
  return useQuery({
    queryKey: ['contest-locked-state', contestId],
    queryFn: () => apiFetch(`/contests/${contestId!}`, ContestListItem),
    enabled: Boolean(contestId),
    refetchInterval: 30_000,
  });
}
