import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Token } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

const SearchResponse = z.object({ items: z.array(Token) });

/**
 * Token search with optional contest scoping.
 * When `contestId` is provided, the response includes per-symbol `pickedByPct`
 * (drives the 🔥 N% picked badge on TokenResultRow).
 */
export function useTokenSearch(rawQuery: string, contestId?: string) {
  const [debounced, setDebounced] = useState(rawQuery);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(rawQuery), 250);
    return () => clearTimeout(id);
  }, [rawQuery]);

  return useQuery({
    queryKey: ['tokens', 'search', debounced, contestId ?? null],
    queryFn: () => {
      const params = new URLSearchParams({ q: debounced });
      if (contestId) params.set('contestId', contestId);
      return apiFetch(`/tokens/search?${params.toString()}`, SearchResponse);
    },
    enabled: debounced.length > 0,
    staleTime: 60_000,
  });
}
