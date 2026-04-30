import { useQuery } from '@tanstack/react-query';
import { LiveResponse } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

export function useLive(contestId: string | undefined) {
  return useQuery({
    queryKey: ['contests', contestId, 'live'],
    queryFn: () => apiFetch(`/contests/${contestId!}/live`, LiveResponse),
    enabled: !!contestId,
    // Aligned with backend syncActive (15s): refetch every 5s so the user
    // feels motion at-most 5s stale within the 15s price refresh window.
    refetchInterval: 5_000,
    staleTime: 2_500,
  });
}
