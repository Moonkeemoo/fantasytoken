import { useState } from 'react';
import type { Token } from '@fantasytoken/shared';
import { Label } from '../../components/ui/Label.js';
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
    <div className="flex flex-1 flex-col gap-[6px] px-3 py-2">
      <div className="flex items-center justify-between">
        <Label>pick tokens · sort by 24h ▼</Label>
        {items.length > 0 && (
          <span className="text-[9px] text-muted">{items.length} available</span>
        )}
      </div>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search ticker (e.g. PEPE)"
        className="w-full rounded-[4px] border-[1.5px] border-ink bg-paper px-3 py-2 text-[12px] placeholder:text-muted focus:outline-none"
        autoFocus
      />
      {q.length === 0 && (
        <div className="text-center text-[10px] text-muted">type a ticker to search</div>
      )}
      {q.length > 0 && search.isLoading && (
        <div className="text-center text-[10px] text-muted">searching…</div>
      )}
      {q.length > 0 && !search.isLoading && items.length === 0 && (
        <div className="text-center text-[10px] text-muted">no tokens match &quot;{q}&quot;</div>
      )}
      <div className="flex flex-col gap-[4px]">
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
