import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EntrySubmissionResult, type EntryPick } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

export interface SubmitArgs {
  contestId: string;
  picks: EntryPick[];
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
