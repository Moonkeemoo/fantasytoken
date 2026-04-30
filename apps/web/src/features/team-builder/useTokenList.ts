import { useQuery } from '@tanstack/react-query';
import { TokenList } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

/**
 * Default token list (top by market cap) — used to populate the Browse-tokens
 * section when the search query is empty, and to seed system presets.
 *
 * Doesn't carry per-contest pickedByPct yet; the badge on TokenResultRow only
 * shows once the user types a query and useTokenSearch is in flight.
 */
export function useTokenList(limit = 50) {
  return useQuery({
    queryKey: ['tokens', 'list', limit],
    queryFn: () => apiFetch(`/tokens?limit=${limit}`, TokenList),
    staleTime: 60_000,
  });
}
