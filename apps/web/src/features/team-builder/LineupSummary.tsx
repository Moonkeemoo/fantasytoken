import { Bar } from '../../components/ui/Bar.js';
import { Card } from '../../components/ui/Card.js';
import { Label } from '../../components/ui/Label.js';
import { TokenIcon } from '../../components/ui/TokenIcon.js';
import { PORTFOLIO_PCT_TOTAL, PORTFOLIO_TOKEN_COUNT } from '@fantasytoken/shared';
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
    <Card className="m-3 px-[14px] py-3">
      <Label>
        your lineup · {picks.length} of {PORTFOLIO_TOKEN_COUNT} picked
      </Label>
      {/* Full-width 5-col grid so each slot owns 1/5 of the row regardless
          of screen width. Filled slots show real token icon + ticker + alloc;
          empty slots show a dashed "+" placeholder of the same footprint. */}
      <div className="mt-2 grid grid-cols-5 gap-[6px]">
        {slots.map((_, i) => {
          const p = picks[i];
          if (p) {
            return (
              <button
                key={p.symbol}
                onClick={() => onRemove(p.symbol)}
                className="flex flex-col items-center gap-[3px] rounded-[6px] border-[1.5px] border-ink bg-paper px-[2px] py-[6px] active:bg-paper-dim"
                title="Tap to remove"
              >
                <TokenIcon symbol={p.symbol} imageUrl={p.imageUrl ?? null} size={28} />
                <span className="w-full truncate text-center text-[10px] font-bold leading-none">
                  {p.symbol}
                </span>
                <span className="font-mono text-[11px] font-extrabold leading-none text-accent">
                  {p.alloc}%
                </span>
              </button>
            );
          }
          return (
            <div
              key={i}
              className="flex aspect-square flex-col items-center justify-center rounded-[6px] border-[1.5px] border-dashed border-ink/30 text-[20px] leading-none text-muted"
            >
              +
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-[6px]">
        <span className="font-mono text-[10px]">{sum}%</span>
        <div className="flex-1">
          <Bar value={sum / PORTFOLIO_PCT_TOTAL} />
        </div>
        <span className={`text-[10px] font-bold ${valid ? 'text-hl-green' : 'text-muted'}`}>
          {valid ? '✓ valid' : `needs ${PORTFOLIO_PCT_TOTAL - sum}%`}
        </span>
      </div>
    </Card>
  );
}
