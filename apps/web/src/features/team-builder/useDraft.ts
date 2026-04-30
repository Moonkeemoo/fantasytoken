import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type AddTokenInput,
  type CtaState,
  type LineupPick,
  type ContestModeForCta,
  addToken as addReducer,
  ctaState,
  dollarsPerPick,
  dollarsTotal,
  evenAllocPct,
  removeToken as removeReducer,
  toggleToken as toggleReducer,
} from './lineupReducer.js';

const KEY = (contestId: string): string => `draft:contest:${contestId}`;

export interface UseDraftOptions {
  /** Drives mode-aware CTA label. */
  mode?: ContestModeForCta;
  /** Drives $ display in selectors (slot tile, hero, etc.). */
  tier?: number;
  /** Trailing label for the GO CTA (e.g. "$0.50 entry", "50 ⭐ entry"). */
  entryLabel?: string;
}

export interface UseDraft {
  draft: LineupPick[];
  setDraft: (next: LineupPick[]) => void;
  clearDraft: () => void;

  // Selectors derived from `draft` (TZ-003: equal-split, no manual alloc)
  evenAllocPct: number;
  dollarsCommitted: number;
  dollarsPerPick: number;
  cta: CtaState;

  // Mutators — single-call additions / removals / toggles. AllocSheet is gone.
  addToken: (input: string | AddTokenInput) => void;
  removeToken: (symbol: string) => void;
  toggleToken: (input: string | AddTokenInput) => void;
}

const DEFAULT_TIER = 100_000;

export function useDraft(contestId: string, options: UseDraftOptions = {}): UseDraft {
  const mode: ContestModeForCta = options.mode ?? 'bull';
  const tier = options.tier ?? DEFAULT_TIER;
  const entryLabel = options.entryLabel ?? '🪙 1 entry';

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

  const clearDraft = useCallback((): void => {
    setDraftState([]);
    try {
      localStorage.removeItem(KEY(contestId));
    } catch {
      // ignore
    }
  }, [contestId]);

  const addToken = useCallback((input: string | AddTokenInput): void => {
    setDraftState((prev) => addReducer(prev, input));
  }, []);

  const removeToken = useCallback((symbol: string): void => {
    setDraftState((prev) => removeReducer(prev, symbol));
  }, []);

  const toggleToken = useCallback((input: string | AddTokenInput): void => {
    setDraftState((prev) => toggleReducer(prev, input));
  }, []);

  const evenPct = useMemo(() => evenAllocPct(draft.length), [draft.length]);
  const committed = useMemo(() => dollarsTotal(draft, tier), [draft, tier]);
  const perPick = useMemo(() => dollarsPerPick(draft, tier), [draft, tier]);
  const cta = useMemo(() => ctaState(draft, mode, entryLabel), [draft, mode, entryLabel]);

  return {
    draft,
    setDraft: setDraftState,
    clearDraft,
    evenAllocPct: evenPct,
    dollarsCommitted: committed,
    dollarsPerPick: perPick,
    cta,
    addToken,
    removeToken,
    toggleToken,
  };
}
