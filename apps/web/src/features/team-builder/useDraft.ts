import { useEffect, useState } from 'react';
import type { LineupPick } from './lineupReducer.js';

const KEY = (contestId: string) => `draft:contest:${contestId}`;

export function useDraft(contestId: string): {
  draft: LineupPick[];
  setDraft: (next: LineupPick[]) => void;
  clearDraft: () => void;
} {
  const [draft, setDraftState] = useState<LineupPick[]>(() => {
    try {
      const raw = localStorage.getItem(KEY(contestId));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed as LineupPick[];
      return [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY(contestId), JSON.stringify(draft));
    } catch {
      // INV-7 spirit: localStorage may be full / disabled — ignore, draft just won't persist.
    }
  }, [contestId, draft]);

  return {
    draft,
    setDraft: setDraftState,
    clearDraft: () => {
      setDraftState([]);
      try {
        localStorage.removeItem(KEY(contestId));
      } catch {
        // ignore
      }
    },
  };
}
