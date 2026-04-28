import { Bar } from '../../components/ui/Bar.js';
import { Card } from '../../components/ui/Card.js';
import { Label } from '../../components/ui/Label.js';
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
      <div className="mt-2 flex gap-[6px]">
        {slots.map((_, i) => {
          const p = picks[i];
          if (p) {
            return (
              <button
                key={p.symbol}
                onClick={() => onRemove(p.symbol)}
                className="flex h-[36px] w-[36px] flex-col items-center justify-center rounded-full border-[1.5px] border-ink bg-paper text-[9px] font-bold leading-tight"
                title="Tap to remove"
              >
                <span>{p.symbol}</span>
                <span className="text-[8px] text-muted">{p.alloc}%</span>
              </button>
            );
          }
          return (
            <div
              key={i}
              className="flex h-[36px] w-[36px] items-center justify-center rounded-full border-[1.5px] border-dashed border-ink/40 text-[18px] text-muted"
            >
              +
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-[6px]">
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
