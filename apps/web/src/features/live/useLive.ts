import { useQuery } from '@tanstack/react-query';
import { LiveResponse } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

export function useLive(contestId: string | undefined) {
  return useQuery({
    queryKey: ['contests', contestId, 'live'],
    queryFn: () => apiFetch(`/contests/${contestId!}/live`, LiveResponse),
    enabled: !!contestId,
    // ADR-0003 / handoff §13 Q2: 30s polling for v1. The price refresh is on
    // the same cadence; sub-30s ticks just churn cache without showing new info.
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
