import { useQuery } from '@tanstack/react-query';
import { LiveResponse } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

export function useLive(contestId: string | undefined) {
  return useQuery({
    queryKey: ['contests', contestId, 'live'],
    queryFn: () => apiFetch(`/contests/${contestId!}/live`, LiveResponse),
    enabled: !!contestId,
    // Aligned with backend syncActive (30s): refetch every 10s so the user feels
    // movement at-most 10s stale within a 30s price refresh window.
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}
