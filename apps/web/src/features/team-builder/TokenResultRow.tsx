import { ALLOCATION_STEP_PCT, type Token } from '@fantasytoken/shared';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { TokenIcon } from '../../components/ui/TokenIcon.js';

export interface TokenResultRowProps {
  token: Token;
  inLineup: boolean;
  alloc?: number;
  onAdd: () => void;
  onRemove: () => void;
  onBump: (delta: number) => void;
}

function formatPctChange(s: string | null): string {
  if (s === null) return '—';
  const n = parseFloat(s);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

export function TokenResultRow({
  token,
  inLineup,
  alloc,
  onAdd,
  onRemove,
  onBump,
}: TokenResultRowProps) {
  return (
    <Card className="flex items-center gap-2 !px-[10px] !py-[6px]">
      <TokenIcon symbol={token.symbol} imageUrl={token.imageUrl} size={24} />
      <div className="flex-1 text-[11px]">
        <div className="font-bold leading-tight">
          {token.name}{' '}
          <span className="font-normal text-muted">{formatPctChange(token.pctChange24h)}</span>
        </div>
      </div>
      {inLineup && alloc !== undefined ? (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onBump(-ALLOCATION_STEP_PCT)}
            className="flex h-6 w-6 items-center justify-center rounded-[3px] border-[1.5px] border-ink bg-paper text-[12px] font-bold text-ink"
          >
            −
          </button>
          <span className="min-w-[30px] text-center font-mono text-[11px] font-bold">{alloc}%</span>
          <button
            onClick={() => onBump(+ALLOCATION_STEP_PCT)}
            className="flex h-6 w-6 items-center justify-center rounded-[3px] border-[1.5px] border-ink bg-ink text-[12px] font-bold text-paper"
          >
            +
          </button>
          <Button size="sm" variant="ghost" onClick={onRemove} className="ml-1 !px-[6px]">
            ×
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" onClick={onAdd}>
          + Add
        </Button>
      )}
    </Card>
  );
}
