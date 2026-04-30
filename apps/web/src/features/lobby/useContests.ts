import { useQuery } from '@tanstack/react-query';
import { ContestFilter, ContestListResponse } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

export function useContests(filter: ContestFilter) {
  return useQuery({
    queryKey: ['contests', filter],
    queryFn: () => apiFetch(`/contests?filter=${filter}`, ContestListResponse),
    refetchInterval: 30_000, // 30s polling per spec.
    // TG WebView pauses background queries by default, freezing the lobby
    // until manual reload. Force-tick anyway.
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: 'always',
    staleTime: 10_000,
  });
}
