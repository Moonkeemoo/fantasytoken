import { useQuery } from '@tanstack/react-query';
import { MeResponse } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch('/me', MeResponse),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
