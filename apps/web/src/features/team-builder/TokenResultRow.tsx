import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { ALLOCATION_STEP_PCT, type Token } from '@fantasytoken/shared';

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
    <Card className="flex items-center gap-3 p-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-tg-bg text-[9px] font-bold">
        {token.symbol}
      </div>
      <div className="flex-1 text-sm">
        <div className="font-bold">
          {token.name}{' '}
          <span className="font-normal text-tg-hint">{formatPctChange(token.pctChange24h)}</span>
        </div>
      </div>
      {inLineup && alloc !== undefined ? (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onBump(-ALLOCATION_STEP_PCT)}
            className="!px-2"
          >
            −
          </Button>
          <span className="min-w-[28px] text-center text-sm font-bold">{alloc}%</span>
          <Button
            size="sm"
            variant="primary"
            onClick={() => onBump(+ALLOCATION_STEP_PCT)}
            className="!px-2"
          >
            +
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove} className="ml-1 !px-2">
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
