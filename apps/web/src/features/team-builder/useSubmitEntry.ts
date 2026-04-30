import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EntrySubmissionResult } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

export interface SubmitArgs {
  contestId: string;
  /** TZ-003: wire format is just the symbol list (1–5 unique). Backend
   * computes the equal allocation. */
  picks: string[];
}

export function useSubmitEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contestId, picks }: SubmitArgs) =>
      apiFetch(`/contests/${contestId}/enter`, EntrySubmissionResult, {
        method: 'POST',
        body: JSON.stringify({ picks }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['contests'] });
    },
  });
}
