import { useMemo, useState } from 'react';
import type { Token } from '@fantasytoken/shared';
import { fmtMoney, fmtMoneyExact } from '@fantasytoken/shared';
import { formatCents, formatTimeLeft } from '../../lib/format.js';
import { useCountdown } from '../../lib/countdown.js';
import { Label } from '../../components/ui/Label.js';
import { AllocSheet, type AllocSheetAction, type ContestMode } from './AllocSheet.js';
import { LineupSlot } from './LineupSlot.js';
import { StartFromStrip, defaultPresets, type StartFromPreset } from './StartFromStrip.js';
import { TokenResultRow } from './TokenResultRow.js';
import {
  applyPreset,
  removeToken,
  setAlloc,
  type AddTokenInput,
  type LineupPick,
} from './lineupReducer.js';
import { useDraft } from './useDraft.js';
import { useLastLineup } from './useLastLineup.js';
import { useTokenList } from './useTokenList.js';
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
  /** ISO timestamp — kickoff. Drives the "47:12 to start" status pill. */
  startsAt: string;
  endsAt: string;
  spotsFilled: number;
  prizePoolCents: number;
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
    startsAt,
    endsAt,
    spotsFilled,
    prizePoolCents,
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
  const search = useTokenSearch(q, contestId);
  const defaultTokens = useTokenList(50);

  // Source of truth for the Browse-tokens list:
  // - typing → search results (contest-scoped: includes pickedByPct)
  // - empty  → top-N by market cap so the section is never blank
  const items = useMemo<Token[]>(() => {
    if (q.length === 0) return defaultTokens.data?.items ?? [];
    return search.data?.items ?? [];
  }, [q, search.data, defaultTokens.data]);

  const allocBySymbol = useMemo(() => new Map(draft.map((p) => [p.symbol, p.alloc])), [draft]);
  const cantAfford = balanceCents < entryFeeCents;

  const lastLineupQ = useLastLineup();

  // Symbol → display metadata map so any preset (system or personal) can
  // carry imageUrl into the resulting picks. LineupSlot renders the icon
  // straight from pick.imageUrl; without this map we'd fall back to the
  // letter avatar even for top-50 mainstream tokens.
  const tokenLookup = useMemo(() => {
    const map = new Map<string, { name: string; imageUrl: string | null }>();
    for (const t of defaultTokens.data?.items ?? []) {
      map.set(t.symbol, { name: t.name, imageUrl: t.imageUrl });
    }
    return map;
  }, [defaultTokens.data]);

  const presetSeedTokens = useMemo(
    () => (defaultTokens.data?.items ?? []).slice(0, 5),
    [defaultTokens.data],
  );

  const presets = useMemo<StartFromPreset[]>(() => {
    const base = defaultPresets(presetSeedTokens);
    const last = lastLineupQ.data?.lineup;
    if (!last || last.picks.length !== 5) return base;
    const pnl = last.pnlPct;
    const pnlLabel = pnl === null ? '' : ` ${pnl > 0 ? '+' : ''}${pnl.toFixed(1)}%`;
    const personal: StartFromPreset = {
      id: 'last-team',
      label: `Last team${pnlLabel}`,
      sub: last.contestName,
      isSystem: false,
      picks: last.picks.map((p) => {
        const meta = tokenLookup.get(p.symbol);
        return {
          symbol: p.symbol,
          alloc: p.alloc,
          ...(meta?.name !== undefined && { name: meta.name }),
          ...(meta?.imageUrl !== undefined && { imageUrl: meta.imageUrl }),
        };
      }),
    };
    return [personal, ...base];
  }, [presetSeedTokens, lastLineupQ.data, tokenLookup]);

  const onTokenSelect = (token: Token): void => {
    openSheet({
      symbol: token.symbol,
      name: token.name,
      imageUrl: token.imageUrl,
      pctChange24h: token.pctChange24h !== null ? Number.parseFloat(token.pctChange24h) : null,
      priceDisplay: token.currentPriceUsd ? `$${Number.parseFloat(token.currentPriceUsd)}` : null,
      ...(token.pickedByPct !== undefined && { pickedByPct: token.pickedByPct }),
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
      const input: AddTokenInput = {
        symbol: action.symbol,
        ...(action.name !== undefined && { name: action.name }),
        ...(action.imageUrl !== undefined && { imageUrl: action.imageUrl }),
      };
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
        ? 'bg-bear text-paper'
        : 'bg-bull text-paper'
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

  const startMs = useCountdown(startsAt);
  const durationLabel = useMemo(() => {
    const minutes = Math.round(
      (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000,
    );
    if (minutes >= 60 * 24) return `${Math.round(minutes / 60 / 24)}d`;
    if (minutes >= 60) return `${Math.round(minutes / 60)}h`;
    return `${minutes}m`;
  }, [startsAt, endsAt]);
  const endLabel = useMemo(
    () =>
      new Date(endsAt).toLocaleString('en-US', {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [endsAt],
  );

  const modePillClass =
    mode === 'bear' ? 'border-bear text-bear bg-bear/5' : 'border-bull text-bull bg-bull/5';

  return (
    <div className="flex min-h-screen flex-col bg-paper pb-14 text-ink">
      <header className="relative border-b border-line px-3 pb-2 pt-3">
        <button
          onClick={onBack}
          className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-ink bg-paper text-[12px] leading-none"
          aria-label="Back to lobby"
        >
          ‹
        </button>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 text-[14px] font-bold leading-tight">
            <span>{contestName}</span>
            <span
              className={`rounded-full border px-1.5 py-px text-[9px] font-bold uppercase ${modePillClass}`}
            >
              {mode}
            </span>
            <span className="rounded-full bg-ink px-1.5 py-px font-mono text-[9px] font-bold text-paper">
              {fmtMoney(tier)}
            </span>
          </div>
          <div className="mt-0.5 text-[10px] text-muted">
            {durationLabel} · ends {endLabel}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
          <span className="flex items-center gap-1 rounded-full border border-line bg-paper px-2 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            <span className="font-mono">{formatTimeLeft(startMs)} to start</span>
          </span>
          <span className="rounded-full border border-line bg-paper px-2 py-0.5 font-mono">
            {spotsFilled} in
          </span>
          <span className="font-mono font-bold text-gold">{formatCents(prizePoolCents)}</span>
        </div>
      </header>

      <section className="border-b border-line px-3 py-2">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5">
            <Label>Your lineup</Label>
            <span className="text-[10px] text-muted">budget {fmtMoney(tier)}</span>
          </div>
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
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 Search ticker or paste contract…"
          className="w-full rounded-md border border-line bg-paper px-3 py-2 text-[12px] placeholder:text-muted focus:border-ink focus:outline-none"
          aria-label="Search tokens"
        />

        <div className="flex items-center justify-between">
          <Label>Browse tokens</Label>
          {sortedItems.length > 0 && (
            <span className="text-[10px] text-muted">
              {sortedItems.length} · {q.length > 0 ? 'matches' : 'top by mcap'} · 24h{' '}
              {mode === 'bull' ? '↓' : '↑'}
            </span>
          )}
        </div>

        {q.length > 0 && search.isLoading && sortedItems.length === 0 && (
          <div className="text-center text-[10px] text-muted">searching…</div>
        )}
        {q.length > 0 && !search.isLoading && sortedItems.length === 0 && (
          <div className="text-center text-[10px] text-muted">
            no tokens match &quot;{q.trim()}&quot;
          </div>
        )}
        {q.length === 0 && defaultTokens.isLoading && (
          <div className="text-center text-[10px] text-muted">loading tokens…</div>
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
                {...(t.pickedByPct !== undefined ? { pickedByPct: t.pickedByPct } : {})}
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

      <div className="sticky bottom-14 border-t border-line bg-paper px-3 py-2">
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
