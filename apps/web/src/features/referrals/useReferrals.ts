import { useQuery } from '@tanstack/react-query';
import {
  ReferralsFriendResponse,
  ReferralsPayoutsResponse,
  ReferralsSummaryResponse,
  ReferralsTreeResponse,
  WelcomeStatusResponse,
} from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

// Aggregated headline + earnings. Cheap to refetch on focus — TanStack default.
export function useReferralsSummary() {
  return useQuery({
    queryKey: ['referrals', 'summary'],
    queryFn: () => apiFetch('/me/referrals', ReferralsSummaryResponse),
    staleTime: 30_000,
  });
}

// Drill list of L1 + L2 friends with per-friend stats.
export function useReferralsTree() {
  return useQuery({
    queryKey: ['referrals', 'tree'],
    queryFn: () => apiFetch('/me/referrals/tree', ReferralsTreeResponse),
    staleTime: 60_000,
  });
}

// Recent commission payouts. Default limit matches backend (20).
export function useReferralsPayouts(limit = 20) {
  return useQuery({
    queryKey: ['referrals', 'payouts', limit],
    queryFn: () => apiFetch(`/me/referrals/payouts?limit=${limit}`, ReferralsPayoutsResponse),
    staleTime: 30_000,
  });
}

// Per-friend drill-in. 404 from backend (anti-snoop) bubbles as a hook error.
export function useReferralFriend(friendUserId: string | null) {
  return useQuery({
    queryKey: ['referrals', 'friend', friendUserId],
    queryFn: () => apiFetch(`/me/referrals/friend/${friendUserId}`, ReferralsFriendResponse),
    enabled: friendUserId !== null,
    staleTime: 30_000,
  });
}

// Welcome bonus state machine — drives the welcome-screen countdown.
export function useWelcomeStatus() {
  return useQuery({
    queryKey: ['me', 'welcome-status'],
    queryFn: () => apiFetch('/me/welcome-status', WelcomeStatusResponse),
    staleTime: 60_000,
  });
}
