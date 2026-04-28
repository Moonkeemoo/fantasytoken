import { Bar } from '../../components/ui/Bar.js';
import { PORTFOLIO_TOKEN_COUNT, PORTFOLIO_PCT_TOTAL } from '@fantasytoken/shared';
import { isValid, type LineupPick } from './lineupReducer.js';

export interface LineupSummaryProps {
  picks: LineupPick[];
  onRemove: (symbol: string) => void;
}

export function LineupSummary({ picks, onRemove }: LineupSummaryProps) {
  const sum = picks.reduce((s, p) => s + p.alloc, 0);
  const valid = isValid(picks);
  const slots = Array.from({ length: PORTFOLIO_TOKEN_COUNT });

  return (
    <div className="m-3 rounded border border-tg-text/10 bg-tg-bg-secondary p-3">
      <div className="text-xs uppercase tracking-wide text-tg-hint">
        your lineup · {picks.length} of {PORTFOLIO_TOKEN_COUNT} picked
      </div>
      <div className="mt-2 flex gap-2">
        {slots.map((_, i) => {
          const p = picks[i];
          if (p) {
            return (
              <button
                key={p.symbol}
                onClick={() => onRemove(p.symbol)}
                className="flex h-12 w-12 flex-col items-center justify-center rounded-full border border-tg-text/30 bg-tg-bg text-[10px] leading-tight"
                title="Tap to remove"
              >
                <span className="font-bold">{p.symbol}</span>
                <span className="text-tg-hint">{p.alloc}%</span>
              </button>
            );
          }
          return (
            <div
              key={i}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-tg-text/30 text-2xl text-tg-hint"
            >
              +
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="font-mono text-xs">{sum}%</span>
        <div className="flex-1">
          <Bar value={sum / PORTFOLIO_PCT_TOTAL} />
        </div>
        <span className={`text-xs font-bold ${valid ? 'text-green-600' : 'text-tg-hint'}`}>
          {valid ? '✓ valid' : `needs ${PORTFOLIO_PCT_TOTAL - sum}%`}
        </span>
      </div>
    </div>
  );
}
