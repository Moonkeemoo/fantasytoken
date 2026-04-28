import { useState } from 'react';
import type { Token } from '@fantasytoken/shared';
import { useTokenSearch } from './useTokenSearch.js';
import { TokenResultRow } from './TokenResultRow.js';
import type { LineupPick } from './lineupReducer.js';

export interface TokenSearchProps {
  picks: LineupPick[];
  onAdd: (token: Token) => void;
  onRemove: (symbol: string) => void;
  onBump: (symbol: string, delta: number) => void;
}

export function TokenSearch({ picks, onAdd, onRemove, onBump }: TokenSearchProps) {
  const [q, setQ] = useState('');
  const search = useTokenSearch(q);
  const items = search.data?.items ?? [];

  const allocBySymbol = new Map(picks.map((p) => [p.symbol, p.alloc]));

  return (
    <div className="flex flex-1 flex-col gap-2 p-3">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search ticker (e.g. PEPE)"
        className="w-full rounded border border-tg-text/20 bg-tg-bg-secondary px-3 py-2 text-sm placeholder:text-tg-hint"
        autoFocus
      />
      {q.length === 0 && (
        <div className="text-center text-xs text-tg-hint">type a ticker to search</div>
      )}
      {q.length > 0 && search.isLoading && (
        <div className="text-center text-xs text-tg-hint">searching…</div>
      )}
      {q.length > 0 && !search.isLoading && items.length === 0 && (
        <div className="text-center text-xs text-tg-hint">no tokens match &quot;{q}&quot;</div>
      )}
      <div className="flex flex-col gap-1">
        {items.map((t) => {
          const alloc = allocBySymbol.get(t.symbol);
          return (
            <TokenResultRow
              key={t.symbol}
              token={t}
              inLineup={allocBySymbol.has(t.symbol)}
              {...(alloc !== undefined ? { alloc } : {})}
              onAdd={() => onAdd(t)}
              onRemove={() => onRemove(t.symbol)}
              onBump={(delta) => onBump(t.symbol, delta)}
            />
          );
        })}
      </div>
    </div>
  );
}
