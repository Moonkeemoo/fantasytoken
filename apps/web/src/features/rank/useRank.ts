import { useQuery } from '@tanstack/react-query';
import { RankResponse, TeaserResponse } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

export function useRank() {
  return useQuery({
    queryKey: ['me', 'rank'],
    queryFn: () => apiFetch('/me/rank', RankResponse),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useTeaser() {
  return useQuery({
    queryKey: ['me', 'rank', 'teaser'],
    queryFn: () => apiFetch('/me/rank/teaser', TeaserResponse),
    staleTime: 30_000,
  });
}
