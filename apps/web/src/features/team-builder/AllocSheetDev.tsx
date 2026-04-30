import { useState } from 'react';
import {
  AllocSheet,
  type AllocSheetAction,
  type AllocSheetPick,
  type AllocSheetToken,
  type ContestMode,
} from './AllocSheet.js';

/**
 * Standalone dev story for AllocSheet — exercises the props matrix without
 * needing a real contest API. Linked at `/dev/alloc-sheet`. Not user-facing.
 */

const TOKENS: AllocSheetToken[] = [
  {
    symbol: 'PEPE',
    name: 'Pepe',
    imageUrl: null,
    pctChange24h: 12.4,
    priceDisplay: '$0.0000123',
    pickedByPct: 47,
  },
  {
    symbol: 'SOL',
    name: 'Solana',
    imageUrl: null,
    pctChange24h: -3.2,
    priceDisplay: '$142.31',
    pickedByPct: 22,
  },
  {
    symbol: 'WIF',
    name: 'dogwifhat',
    imageUrl: null,
    pctChange24h: 0.8,
    priceDisplay: '$2.41',
  },
];

export function AllocSheetDev(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [tokenIdx, setTokenIdx] = useState(0);
  const [mode, setMode] = useState<ContestMode>('bull');
  const [tier, setTier] = useState(100_000);
  const [lineup, setLineup] = useState<AllocSheetPick[]>([
    { symbol: 'BTC', alloc: 30 },
    { symbol: 'ETH', alloc: 25 },
  ]);

  const onConfirm = (action: AllocSheetAction): void => {
    if (action.kind === 'remove') {
      setLineup((l) => l.filter((p) => p.symbol !== action.symbol));
    } else {
      setLineup((l) => {
        const exists = l.some((p) => p.symbol === action.symbol);
        if (exists) {
          return l.map((p) => (p.symbol === action.symbol ? { ...p, alloc: action.alloc } : p));
        }
        return [...l, { symbol: action.symbol, alloc: action.alloc }];
      });
    }
    setOpen(false);
  };

  return (
    <div className="min-h-screen bg-paper p-6 text-ink">
      <h1 className="text-[18px] font-bold">AllocSheet · dev story</h1>
      <p className="mt-1 text-[12px] text-muted">
        Standalone harness. Toggle props on the left, click a token to open the sheet.
      </p>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-line bg-paper-dim p-4">
          <h2 className="text-label uppercase text-muted">Contest config</h2>
          <div className="mt-3 flex flex-col gap-3 text-[13px]">
            <label className="flex items-center gap-2">
              <span className="w-20">mode</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as ContestMode)}
                className="rounded border border-line bg-paper px-2 py-1"
              >
                <option value="bull">bull</option>
                <option value="bear">bear</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="w-20">tier $</span>
              <select
                value={tier}
                onChange={(e) => setTier(Number(e.target.value))}
                className="rounded border border-line bg-paper px-2 py-1"
              >
                <option value={100_000}>$100K</option>
                <option value={1_000_000}>$1M</option>
                <option value={10_000_000}>$10M</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => setLineup([])}
              className="self-start rounded border border-line bg-paper px-3 py-1.5 text-[12px]"
            >
              clear lineup
            </button>
            <button
              type="button"
              onClick={() =>
                setLineup([
                  { symbol: 'BTC', alloc: 25 },
                  { symbol: 'ETH', alloc: 25 },
                  { symbol: 'PEPE', alloc: 20 },
                  { symbol: 'WIF', alloc: 15 },
                  { symbol: 'BONK', alloc: 15 },
                ])
              }
              className="self-start rounded border border-line bg-paper px-3 py-1.5 text-[12px]"
            >
              fill lineup (5/5, sum=100)
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-paper-dim p-4">
          <h2 className="text-label uppercase text-muted">Current lineup</h2>
          <ul className="mt-3 space-y-1 text-[12px]">
            {lineup.length === 0 && <li className="text-muted">empty</li>}
            {lineup.map((p) => (
              <li key={p.symbol} className="flex justify-between font-mono">
                <span>{p.symbol}</span>
                <span>{p.alloc}%</span>
              </li>
            ))}
            <li className="mt-2 flex justify-between border-t border-line pt-2 font-mono font-bold">
              <span>sum</span>
              <span>{lineup.reduce((s, p) => s + p.alloc, 0)}%</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-label uppercase text-muted">Tokens — click to allocate</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {TOKENS.map((t, i) => (
            <button
              key={t.symbol}
              type="button"
              onClick={() => {
                setTokenIdx(i);
                setOpen(true);
              }}
              className="rounded-lg border border-line bg-paper px-3 py-2 text-[13px] font-semibold hover:bg-paper-dim"
            >
              {t.symbol} ({(t.pctChange24h ?? 0 >= 0) ? '+' : ''}
              {t.pctChange24h?.toFixed(1)}%)
            </button>
          ))}
        </div>
      </section>

      <AllocSheet
        open={open}
        mode={mode}
        tier={tier}
        lineup={lineup}
        token={TOKENS[tokenIdx] ?? null}
        onClose={() => setOpen(false)}
        onConfirm={onConfirm}
      />
    </div>
  );
}
