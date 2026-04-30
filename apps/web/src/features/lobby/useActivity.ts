import { useQuery } from '@tanstack/react-query';
import { ActivityResponse } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

/**
 * Recent lock-in events for the LockedScreen rotating activity row.
 * Mirrors useLockedState's 30s polling so the player sees the room fill up
 * in step with the player counter.
 */
export function useActivity(contestId: string | undefined) {
  return useQuery({
    queryKey: ['contest-activity', contestId],
    queryFn: () => apiFetch(`/contests/${contestId!}/activity?limit=20`, ActivityResponse),
    enabled: Boolean(contestId),
    refetchInterval: 30_000,
  });
}
