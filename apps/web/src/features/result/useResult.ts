import { useQuery } from '@tanstack/react-query';
import { ResultResponse } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

export function useResult(contestId: string | undefined, entryId?: string) {
  return useQuery({
    queryKey: ['contests', contestId, 'result', entryId],
    queryFn: () => {
      const q = entryId ? `?entry=${entryId}` : '';
      return apiFetch(`/contests/${contestId!}/result${q}`, ResultResponse);
    },
    enabled: !!contestId,
    staleTime: Infinity,
  });
}
