import { useQuery } from '@tanstack/react-query';
import { MeResponse } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

/**
 * Auth + caller's user shape. Pure read — referral attribution lives in
 * `useReferralAttribution` so callers can hold off on routing until the
 * friendship is actually recorded (otherwise welcome-status returns
 * recruiter=null racy and Loading skips the /welcome screen).
 */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch('/me', MeResponse),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
