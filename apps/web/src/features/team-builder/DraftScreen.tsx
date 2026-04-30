import { useMemo, useState } from 'react';
import type { Token } from '@fantasytoken/shared';
import { fmtMoney, fmtMoneyExact } from '@fantasytoken/shared';
import { formatCents } from '../../lib/format.js';
import { Label } from '../../components/ui/Label.js';
import { AllocSheet, type AllocSheetAction, type ContestMode } from './AllocSheet.js';
import { LineupSlot } from './LineupSlot.js';
import { StartFromStrip, defaultPresets, type StartFromPreset } from './StartFromStrip.js';
import { TokenResultRow } from './TokenResultRow.js';
import { applyPreset, removeToken, setAlloc, type LineupPick } from './lineupReducer.js';
import { useDraft } from './useDraft.js';
import { useTokenSearch } from './useTokenSearch.js';

const N_SLOTS = 5;

export interface DraftScreenProps {
  contestId: string;
  contestName: string;
  mode: ContestMode;
  /** Virtual budget in dollars (e.g. 100_000). UX-only; backend operates in %. */
  tier: number;
  entryFeeCents: number;
  balanceCents: number;
  isSubmitting: boolean;
  errMsg: string | null;
  onSubmit: (picks: LineupPick[]) => void;
  onBack: () => void;
  onTopUp: () => void;
}

export function DraftScreen(props: DraftScreenProps): JSX.Element {
  const {
    contestId,
    contestName,
    mode,
    tier,
    entryFeeCents,
    balanceCents,
    isSubmitting,
    errMsg,
    onSubmit,
    onBack,
    onTopUp,
  } = props;

  const entryLabel = `${formatCents(entryFeeCents)} entry`;
  const draftCtx = useDraft(contestId, { mode, tier, entryLabel });
  const { draft, setDraft, cta, dollarsCommitted, sheetToken, sheetOpen, openSheet, closeSheet } =
    draftCtx;

  const [q, setQ] = useState('');
  const search = useTokenSearch(q);
  const items = useMemo(() => search.data?.items ?? [], [search.data]);
  const allocBySymbol = useMemo(() => new Map(draft.map((p) => [p.symbol, p.alloc])), [draft]);
  const cantAfford = balanceCents < entryFeeCents;

  const presets = useMemo<StartFromPreset[]>(
    () => defaultPresets(items.slice(0, 5).map((t) => t.symbol)),
    [items],
  );

  const onTokenSelect = (token: Token): void => {
    openSheet({
      symbol: token.symbol,
      name: token.name,
      imageUrl: token.imageUrl,
      pctChange24h: token.pctChange24h !== null ? Number.parseFloat(token.pctChange24h) : null,
      priceDisplay: token.currentPriceUsd ? `$${Number.parseFloat(token.currentPriceUsd)}` : null,
    });
  };

  const onSlotSelect = (pick: LineupPick): void => {
    openSheet({
      symbol: pick.symbol,
      name: pick.name ?? pick.symbol,
      imageUrl: pick.imageUrl ?? null,
      pctChange24h: null,
    });
  };

  const onSheetConfirm = (action: AllocSheetAction): void => {
    if (action.kind === 'remove') {
      setDraft(removeToken(draft, action.symbol));
    } else {
      const meta = items.find((t) => t.symbol === action.symbol);
      const input = meta
        ? { symbol: meta.symbol, name: meta.name, imageUrl: meta.imageUrl }
        : action.symbol;
      setDraft(setAlloc(draft, input, action.alloc));
    }
    closeSheet();
  };

  const onPresetApply = (preset: StartFromPreset): void => {
    setDraft(applyPreset(preset.picks));
  };

  const slots: Array<LineupPick | null> = Array.from(
    { length: N_SLOTS },
    (_, i) => draft[i] ?? null,
  );

  const ctaDisabled = cta.kind !== 'ready' || isSubmitting;
  const showTopUp = cta.kind === 'ready' && cantAfford && entryFeeCents > 0;

  const onCtaClick = (): void => {
    if (showTopUp) {
      onTopUp();
      return;
    }
    if (cta.kind !== 'ready' || isSubmitting) return;
    onSubmit(draft);
  };

  const ctaTone =
    cta.kind === 'ready'
      ? mode === 'bear'
        ? 'bg-bear text-paper hover:bg-bear/90'
        : 'bg-bull text-paper hover:bg-bull/90'
      : cta.kind === 'over'
        ? 'bg-bear/30 text-bear'
        : 'bg-paper-deep text-muted';

  const ctaLabel = showTopUp
    ? `Top up ${formatCents(entryFeeCents - balanceCents)} to enter`
    : isSubmitting
      ? 'Submitting…'
      : cta.label;

  const sortedItems = useMemo(() => {
    if (items.length === 0) return items;
    const withD24 = items.map((t) => ({
      t,
      d24: t.pctChange24h !== null ? Number.parseFloat(t.pctChange24h) : 0,
    }));
    withD24.sort((a, b) => (mode === 'bull' ? b.d24 - a.d24 : a.d24 - b.d24));
    return withD24.map((x) => x.t);
  }, [items, mode]);

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="flex items-start justify-between border-b border-line px-3 py-2">
        <button onClick={onBack} className="flex items-center gap-2" aria-label="Back to lobby">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-ink bg-paper text-[12px] leading-none">
            ‹
          </span>
          <div className="text-left">
            <div className="text-[13px] font-bold leading-tight">{contestName}</div>
            <div className="text-[10px] text-muted">
              {fmtMoney(tier)} budget · {formatCents(entryFeeCents)} entry
            </div>
          </div>
        </button>
        <div className="text-right">
          <Label>step 1/2</Label>
        </div>
      </header>

      <section className="border-b border-line px-3 py-2">
        <div className="flex items-baseline justify-between">
          <Label>Your lineup</Label>
          <div className="text-[10px] text-muted">
            <span className={draft.length === N_SLOTS ? 'font-bold text-ink' : ''}>
              {draft.length}
            </span>
            /{N_SLOTS} ·{' '}
            <span className={draftCtx.totalAlloc === 100 ? 'font-bold text-ink' : ''}>
              {fmtMoneyExact(dollarsCommitted)}
            </span>{' '}
            · {draftCtx.totalAlloc}%
          </div>
        </div>
        <div className="mt-2 flex gap-1.5">
          {slots.map((pick, i) => (
            <LineupSlot
              key={pick?.symbol ?? `empty-${i}`}
              pick={pick}
              tier={tier}
              onClick={() => pick && onSlotSelect(pick)}
            />
          ))}
        </div>
        <div className="mt-2 h-1 w-full rounded-full bg-paper-deep">
          <div
            className={`h-full rounded-full transition-all ${
              draftCtx.totalAlloc > 100 ? 'bg-bear' : 'bg-ink'
            }`}
            style={{ width: `${Math.min(100, draftCtx.totalAlloc)}%` }}
          />
        </div>
      </section>

      <section className="flex flex-1 flex-col gap-2 px-3 py-2">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search ticker or paste contract…"
          className="w-full rounded-md border border-line bg-paper px-3 py-2 text-[12px] placeholder:text-muted focus:border-ink focus:outline-none"
          autoFocus
        />

        <div className="flex items-center justify-between">
          <Label>Browse tokens</Label>
          {sortedItems.length > 0 && (
            <span className="text-[10px] text-muted">
              {sortedItems.length} · sorted by 24h {mode === 'bull' ? '↓' : '↑'}
            </span>
          )}
        </div>

        {q.length === 0 && sortedItems.length === 0 && (
          <div className="py-8 text-center text-[11px] text-muted">
            type a ticker to search · pick 5 tokens to compete
          </div>
        )}
        {q.length > 0 && search.isLoading && (
          <div className="text-center text-[10px] text-muted">searching…</div>
        )}
        {q.length > 0 && !search.isLoading && sortedItems.length === 0 && (
          <div className="text-center text-[10px] text-muted">no tokens match &quot;{q}&quot;</div>
        )}

        <div className="flex flex-col gap-1">
          {sortedItems.map((t) => {
            const alloc = allocBySymbol.get(t.symbol);
            return (
              <TokenResultRow
                key={t.symbol}
                token={t}
                inLineup={alloc !== undefined}
                {...(alloc !== undefined ? { alloc } : {})}
                tier={tier}
                mode={mode}
                onSelect={() => onTokenSelect(t)}
              />
            );
          })}
        </div>
      </section>

      {presets.length > 0 && draft.length === 0 && (
        <StartFromStrip presets={presets} onApply={onPresetApply} />
      )}

      {errMsg && (
        <div className="mx-3 mb-2 rounded-md border border-bear bg-bear/10 px-3 py-2 text-[11px] text-bear">
          {errMsg}
        </div>
      )}

      <div className="sticky bottom-0 border-t border-line bg-paper px-3 py-2">
        <button
          type="button"
          onClick={onCtaClick}
          disabled={ctaDisabled && !showTopUp}
          className={`w-full rounded-lg py-3 text-[13px] font-bold uppercase tracking-wider transition-colors ${ctaTone} disabled:cursor-not-allowed`}
        >
          {ctaLabel}
        </button>
      </div>

      <AllocSheet
        open={sheetOpen}
        mode={mode}
        tier={tier}
        lineup={draft}
        token={sheetToken}
        onClose={closeSheet}
        onConfirm={onSheetConfirm}
      />
    </div>
  );
}
