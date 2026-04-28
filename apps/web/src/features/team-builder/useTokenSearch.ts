import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Token } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

const SearchResponse = z.object({ items: z.array(Token) });

export function useTokenSearch(rawQuery: string) {
  const [debounced, setDebounced] = useState(rawQuery);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(rawQuery), 250);
    return () => clearTimeout(id);
  }, [rawQuery]);

  return useQuery({
    queryKey: ['tokens', 'search', debounced],
    queryFn: () => apiFetch(`/tokens/search?q=${encodeURIComponent(debounced)}`, SearchResponse),
    enabled: debounced.length > 0,
    staleTime: 60_000,
  });
}
