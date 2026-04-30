import { useQuery } from '@tanstack/react-query';
import { LastLineupResponse } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

/**
 * Caller's most recently submitted lineup (any contest, any status).
 * Backs DraftScreen's StartFromStrip personal-preset card.
 */
export function useLastLineup() {
  return useQuery({
    queryKey: ['me', 'last-lineup'],
    queryFn: () => apiFetch('/me/last-lineup', LastLineupResponse),
    // Lineup history changes only when the user submits a new entry — refresh
    // on focus so a fresh contest won't lag stale "Last team" state.
    staleTime: 60_000,
  });
}
