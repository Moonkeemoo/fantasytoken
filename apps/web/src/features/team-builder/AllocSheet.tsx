import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  dollarsFor,
  fmtMoney,
  fmtMoneyExact,
  sparkPath,
  SPARK_VIEWBOX,
} from '@fantasytoken/shared';

/**
 * AllocSheet — central primitive of the $-first team-builder redesign (TZ-001 §03).
 * Bottom sheet that lets the player allocate a single token's % share of the
 * portfolio, expressed primarily in dollars (% slider is the secondary control).
 */

export type ContestMode = 'bull' | 'bear';

export interface AllocSheetPick {
  symbol: string;
  alloc: number;
}

export interface AllocSheetToken {
  symbol: string;
  name: string;
  imageUrl: string | null;
  /** Parsed percent change over 24h. `null` if unknown. */
  pctChange24h: number | null;
  /** Display price string (e.g. `$0.00012`). `null` collapses to `—`. */
  priceDisplay?: string | null;
  /** % of contest entrants who already picked this token. `undefined` hides the badge. */
  pickedByPct?: number;
}

export type AllocSheetAction =
  | { kind: 'set'; symbol: string; alloc: number }
  | { kind: 'remove'; symbol: string };

export interface AllocSheetProps {
  open: boolean;
  mode: ContestMode;
  /** Virtual budget for $-display (e.g. 100_000). */
  tier: number;
  lineup: readonly AllocSheetPick[];
  token: AllocSheetToken | null;
  onClose: () => void;
  onConfirm: (action: AllocSheetAction) => void;
}

const SHEET_LABEL_ID_PREFIX = 'alloc-sheet-token-';

export function AllocSheet({
  open,
  mode,
  tier,
  lineup,
  token,
  onClose,
  onConfirm,
}: AllocSheetProps): JSX.Element | null {
  const labelId = useId();
  const dollarInputRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const existing = token ? lineup.find((p) => p.symbol === token.symbol) : undefined;
  const otherAlloc = useMemo(
    () => lineup.filter((p) => p.symbol !== token?.symbol).reduce((s, p) => s + p.alloc, 0),
    [lineup, token?.symbol],
  );
  const remaining = Math.max(0, 100 - otherAlloc);
  const slotsLeft = 5 - lineup.filter((p) => p.symbol !== token?.symbol).length;
  const isEdit = Boolean(existing);

  const [pct, setPct] = useState<number>(existing?.alloc ?? 0);

  useEffect(() => {
    if (!open || !token) return;
    if (existing) {
      setPct(existing.alloc);
      return;
    }
    if (otherAlloc === 0) setPct(20);
    else if (remaining >= 20) setPct(20);
    else setPct(remaining);
  }, [open, token?.symbol, existing, otherAlloc, remaining, token]);

  // Lock body scroll while open so the sheet behaves like a true modal.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc to close + initial focus on the dollar input.
  useEffect(() => {
    if (!open) return;
    dollarInputRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Hand-rolled focus trap: when Tab leaves the sheet, wrap to first/last interactive.
  const onSheetKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !sheetRef.current) return;
    const focusables = sheetRef.current.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  if (!open || !token) return null;

  const cappedPct = Math.min(pct, remaining);
  const dollars = dollarsFor(cappedPct, tier);
  const willExceedSlots = !isEdit && slotsLeft <= 0;
  const d24 = token.pctChange24h ?? 0;
  const trendUp = d24 >= 0;
  const positive = mode === 'bull' ? d24 > 0 : d24 < 0;
  const sparkColor = trendUp ? 'var(--bull)' : 'var(--bear)';

  const chips = [10, 25, 50].filter((v) => v <= remaining);

  const onDollarInput = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    const num = Number.parseFloat(raw) || 0;
    const newPct = Math.min(remaining, Math.max(0, Math.round((num / tier) * 100)));
    setPct(newPct);
  };

  const onSliderKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPct((v) => Math.min(remaining, v + 5));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPct((v) => Math.max(0, v - 5));
    }
  };

  const confirmDisabled = willExceedSlots || cappedPct === 0;
  const confirmLabel = willExceedSlots
    ? 'Lineup full'
    : `${isEdit ? 'Update' : 'Add'} · ${fmtMoneyExact(dollars)}`;

  const fitText = positive
    ? mode === 'bull'
      ? '✓ Rising — fits your bull contest'
      : '✓ Falling — fits your bear contest'
    : mode === 'bull'
      ? '✗ Falling — fights your bull contest'
      : '✗ Rising — fights your bear contest';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
      onKeyDown={onSheetKeyDown}
    >
      <div
        className="absolute inset-0 bg-ink/40 transition-opacity duration-[180ms]"
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${SHEET_LABEL_ID_PREFIX}${labelId}`}
        className="relative max-h-[62vh] w-full max-w-[480px] overflow-y-auto rounded-t-2xl border border-line bg-paper p-5 shadow-2xl ease-sheet duration-sheet"
        style={{ animation: 'alloc-sheet-slide-up 220ms cubic-bezier(0.2, 0.8, 0.25, 1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line" />

        <div className="flex items-center gap-3 border-b border-line pb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-paper-deep text-2xl">
            {token.imageUrl ? (
              <img src={token.imageUrl} alt="" className="h-9 w-9 rounded-lg" />
            ) : (
              <span className="font-mono text-[14px] font-bold text-ink-soft">
                {token.symbol.slice(0, 3)}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5 text-[14px]">
              <b id={`${SHEET_LABEL_ID_PREFIX}${labelId}`} className="font-bold text-ink">
                {token.symbol}
              </b>
              <span className="truncate text-muted">· {token.name}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="font-mono text-ink-soft">{token.priceDisplay ?? '—'}</span>
              <span className={trendUp ? 'text-bull' : 'text-bear'}>
                {trendUp ? '+' : ''}
                {d24.toFixed(1)}% 24h
              </span>
              {typeof token.pickedByPct === 'number' && token.pickedByPct >= 15 && (
                <span className="text-muted">· {token.pickedByPct}% picked</span>
              )}
            </div>
          </div>
          <svg viewBox={SPARK_VIEWBOX} className="h-6 w-16 shrink-0" fill="none">
            <path
              d={sparkPath(token.symbol, trendUp)}
              stroke={sparkColor}
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div
          className={`mt-3 rounded-md px-3 py-2 text-[12px] ${
            positive ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'
          }`}
        >
          {fitText}
        </div>

        <div className="mt-4">
          <label className="text-label text-muted uppercase">Allocate</label>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-1 rounded-lg border border-line bg-paper-dim px-3 py-2 font-mono text-[20px] font-bold text-ink focus-within:border-ink">
              <span>$</span>
              <input
                ref={dollarInputRef}
                type="text"
                inputMode="decimal"
                value={dollars.toLocaleString('en-US')}
                onChange={onDollarInput}
                className="w-full bg-transparent outline-none"
                aria-label="Dollar amount"
              />
            </div>
            <div className="text-right">
              <div className="font-mono text-pnl-big text-ink">{cappedPct}%</div>
              <div className="text-[10px] text-muted">of {fmtMoney(tier)}</div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setPct(v)}
                className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
                  cappedPct === v
                    ? 'border-ink bg-ink text-paper'
                    : 'border-line bg-paper text-ink-soft hover:bg-paper-dim'
                }`}
              >
                {v}%
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPct(remaining)}
              className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
                cappedPct === remaining && remaining > 0
                  ? 'border-ink bg-ink text-paper'
                  : 'border-line bg-paper text-ink-soft hover:bg-paper-dim'
              }`}
            >
              max ({remaining}%)
            </button>
          </div>

          <div className="mt-4">
            <div className="relative h-1.5 rounded-full bg-paper-deep">
              <span
                className="absolute left-0 top-0 h-full rounded-full bg-ink"
                style={{ width: `${cappedPct}%` }}
              />
              <span
                className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-accent"
                style={{ left: `${remaining}%` }}
                aria-hidden="true"
              />
            </div>
            <input
              type="range"
              min={0}
              max={remaining}
              step={1}
              value={cappedPct}
              onChange={(e) => setPct(Number.parseInt(e.target.value, 10))}
              onKeyDown={onSliderKey}
              className="mt-2 w-full accent-ink"
              aria-label="Allocation percent"
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted">
              <span>0</span>
              <span>cap {remaining}%</span>
              <span>100</span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-[12px] text-ink-soft">
            <span>After this pick</span>
            <b className="font-mono">
              {fmtMoneyExact(dollarsFor(otherAlloc + cappedPct, tier))} of {fmtMoney(tier)}
            </b>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2">
          {isEdit && (
            <button
              type="button"
              onClick={() => onConfirm({ kind: 'remove', symbol: token.symbol })}
              className="rounded-lg border border-bear px-3 py-2 text-[12px] font-semibold text-bear hover:bg-bear/10"
            >
              Remove
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-2 text-[12px] font-semibold text-ink-soft hover:bg-paper-dim"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={confirmDisabled}
            onClick={() => onConfirm({ kind: 'set', symbol: token.symbol, alloc: cappedPct })}
            className={`ml-auto rounded-lg px-4 py-2 text-[13px] font-bold text-paper transition-colors ${
              mode === 'bear'
                ? 'bg-bear hover:bg-bear/90 disabled:bg-bear/40'
                : 'bg-bull hover:bg-bull/90 disabled:bg-bull/40'
            } disabled:cursor-not-allowed`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes alloc-sheet-slide-up {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
