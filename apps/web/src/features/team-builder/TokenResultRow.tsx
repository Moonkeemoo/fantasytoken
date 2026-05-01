import type { Token } from '@fantasytoken/shared';
import { fmtMoney } from '@fantasytoken/shared';
import { TokenIcon } from '../../components/ui/TokenIcon.js';
import { TokenHistogram } from '../../components/ui/TokenHistogram.js';
import type { ContestMode } from './lineupReducer.js';

export interface TokenResultRowProps {
  token: Token;
  inLineup: boolean;
  alloc?: number;
  tier: number;
  mode: ContestMode;
  /** % of contest entrants who already picked this token. `undefined` hides the badge. */
  pickedByPct?: number;
  /** Tap → openSheet(token). Single tap on the whole row, no per-button bumps. */
  onSelect: () => void;
}

function parsePct(s: string | null): number | null {
  if (s === null) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function fmtPct(n: number | null): string {
  if (n === null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}% 24h`;
}

function fmtPriceCompact(s: string | null): string {
  if (s === null) return '—';
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return '—';
  return n < 1 ? `$${n.toPrecision(3)}` : fmtMoney(n);
}

/**
 * One row in the Browse-tokens list (TZ-001 §05.2).
 * Tap anywhere on the row → AllocSheet for this token.
 */
export function TokenResultRow({
  token,
  inLineup,
  alloc,
  mode,
  pickedByPct,
  onSelect,
}: TokenResultRowProps): JSX.Element {
  const d24 = parsePct(token.pctChange24h);
  const trendUp = (d24 ?? 0) > 0;
  const fits = d24 !== null && (mode === 'bull' ? d24 > 0 : d24 < 0);
  const fightsBg = d24 !== null && d24 !== 0 && !fits;
  const trendColor = trendUp ? 'text-bull' : d24 !== null && d24 < 0 ? 'text-bear' : 'text-muted';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-2 rounded-md border bg-paper px-2.5 py-1.5 text-left transition-colors hover:bg-paper-dim ${
        inLineup ? 'border-ink' : 'border-line'
      }`}
    >
      <TokenIcon symbol={token.symbol} imageUrl={token.imageUrl} size={28} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 text-[12px]">
          <b className="font-bold text-ink">{token.symbol}</b>
          <span className="truncate text-muted">{token.name}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="font-mono text-ink-soft">{fmtPriceCompact(token.currentPriceUsd)}</span>
          <span className={trendColor}>{fmtPct(d24)}</span>
          {typeof pickedByPct === 'number' && pickedByPct >= 30 && (
            <span className="text-accent">🔥 {pickedByPct}% picked</span>
          )}
          {typeof pickedByPct === 'number' && pickedByPct >= 15 && pickedByPct < 30 && (
            <span className="text-muted">· {pickedByPct}% picked</span>
          )}
        </div>
      </div>
      <TokenHistogram
        symbol={token.symbol}
        pctChange24h={d24}
        width={56}
        height={22}
        className="shrink-0"
      />
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {fits && <span className="text-[10px] font-semibold text-bull">✓ fit</span>}
        {fightsBg && <span className="text-[10px] font-semibold text-bear">✗ fights</span>}
        {inLineup && alloc !== undefined && (
          <span className="rounded border border-ink bg-paper-dim px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink">
            {alloc}%
          </span>
        )}
      </div>
    </button>
  );
}
