import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type CtaState,
  type LineupPick,
  ctaState,
  dollarsTotal,
  remainingPct,
  setAlloc as setAllocReducer,
  totalAlloc,
} from './lineupReducer.js';
import type { AllocSheetToken, ContestMode } from './AllocSheet.js';

const KEY = (contestId: string): string => `draft:contest:${contestId}`;

export interface UseDraftOptions {
  /** Drives mode-aware CTA label and contest-fit hint inside the sheet. */
  mode?: ContestMode;
  /** Drives $ display in selectors (slot tile, hero, etc.). */
  tier?: number;
  /** Trailing label for the GO CTA (e.g. "$0.50 entry", "50 ⭐ entry"). */
  entryLabel?: string;
}

export interface UseDraft {
  draft: LineupPick[];
  setDraft: (next: LineupPick[]) => void;
  clearDraft: () => void;

  // Selectors derived from `draft`
  totalAlloc: number;
  remainingPct: number;
  dollarsCommitted: number;
  cta: CtaState;

  // AllocSheet trigger plumbing
  sheetToken: AllocSheetToken | null;
  sheetOpen: boolean;
  openSheet: (token: AllocSheetToken) => void;
  closeSheet: () => void;

  /** Bound shortcut so AllocSheet `onConfirm` can write back without prop-drilling. */
  setAlloc: (symbol: string, alloc: number) => void;
}

const DEFAULT_TIER = 100_000;

export function useDraft(contestId: string, options: UseDraftOptions = {}): UseDraft {
  const mode = options.mode ?? 'bull';
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

  const [sheetToken, setSheetToken] = useState<AllocSheetToken | null>(null);

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

  const openSheet = useCallback((token: AllocSheetToken): void => {
    setSheetToken(token);
  }, []);

  const closeSheet = useCallback((): void => {
    setSheetToken(null);
  }, []);

  const setAlloc = useCallback((symbol: string, alloc: number): void => {
    setDraftState((prev) => setAllocReducer(prev, symbol, alloc));
  }, []);

  const total = useMemo(() => totalAlloc(draft), [draft]);
  const remaining = useMemo(() => remainingPct(draft), [draft]);
  const committed = useMemo(() => dollarsTotal(draft, tier), [draft, tier]);
  const cta = useMemo(() => ctaState(draft, mode, entryLabel), [draft, mode, entryLabel]);

  return {
    draft,
    setDraft: setDraftState,
    clearDraft,
    totalAlloc: total,
    remainingPct: remaining,
    dollarsCommitted: committed,
    cta,
    sheetToken,
    sheetOpen: sheetToken !== null,
    openSheet,
    closeSheet,
    setAlloc,
  };
}
