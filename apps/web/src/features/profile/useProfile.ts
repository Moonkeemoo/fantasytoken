import { useQuery } from '@tanstack/react-query';
import { ProfileResponse } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => apiFetch('/profile', ProfileResponse),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
