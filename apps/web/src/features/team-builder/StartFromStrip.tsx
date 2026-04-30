import { Label } from '../../components/ui/Label.js';
import type { AddTokenInput } from './lineupReducer.js';

export interface StartFromPreset {
  id: string;
  /** Headline shown on the card (`⚖️ Balanced 5` / `Last team +12.4%`). */
  label: string;
  /** Secondary line (`Sprint #283 · 2d ago` / `5 picks · 20% each`). */
  sub: string;
  /** When `true`, render as dashed (system preset); else solid (personal). */
  isSystem: boolean;
  /** TZ-003: presets are token lists. Allocations are equal-split, so the
   * preset only carries WHICH tokens. Strategy is encoded in count. */
  picks: AddTokenInput[];
}

export interface StartFromStripProps {
  presets: StartFromPreset[];
  onApply: (preset: StartFromPreset) => void;
}

/**
 * Horizontal strip of "Start From" cards. Personal cards (recent lineups)
 * come first with a solid border; system presets after with a dashed border.
 * Tap → reducer.applyPreset.
 *
 * TZ-003: presets express "strategy through count":
 *   1 token  → All-in conviction
 *   2 tokens → Hedge (50/50)
 *   5 tokens → Spread (20% each)
 */
export function StartFromStrip({ presets, onApply }: StartFromStripProps): JSX.Element | null {
  if (presets.length === 0) return null;

  return (
    <section className="px-3 pb-2 pt-3">
      <Label>Start from</Label>
      <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onApply(preset)}
            className={`flex w-[156px] shrink-0 flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left ${
              preset.isSystem ? 'border-dashed border-line bg-paper-dim/60' : 'border-line bg-paper'
            } hover:bg-paper-dim`}
          >
            <span className="text-[12px] font-bold text-ink">{preset.label}</span>
            <span className="text-[10px] text-muted">{preset.sub}</span>
            {preset.isSystem && <span className="mt-0.5 text-[9px] italic text-muted">preset</span>}
          </button>
        ))}
      </div>
    </section>
  );
}

interface PresetSeedToken {
  symbol: string;
  name?: string;
  imageUrl?: string | null;
}

/** TZ-003 strategy presets — distinct count = distinct game. Takes top-N
 * tokens (caller passes top by mcap or trending) and returns three "shapes":
 * conviction (1 pick), hedge (2 picks), spread (5 picks). */
export function defaultPresets(tokens: readonly PresetSeedToken[]): StartFromPreset[] {
  if (tokens.length < 5) return [];
  const [a, b, c, d, e] = tokens;
  if (!a || !b || !c || !d || !e) return [];
  const meta = (t: PresetSeedToken): AddTokenInput => ({
    symbol: t.symbol,
    ...(t.name !== undefined && { name: t.name }),
    ...(t.imageUrl !== undefined && { imageUrl: t.imageUrl }),
  });
  return [
    {
      id: 'spread',
      label: '⚖️ Spread 5',
      sub: '5 picks · 20% each',
      isSystem: true,
      picks: [meta(a), meta(b), meta(c), meta(d), meta(e)],
    },
    {
      id: 'hedge',
      label: '🪙 Hedge 2',
      sub: '2 picks · 50/50',
      isSystem: true,
      picks: [meta(a), meta(b)],
    },
    {
      id: 'conviction',
      label: '🎯 All-in',
      sub: '1 pick · 100%',
      isSystem: true,
      picks: [meta(a)],
    },
  ];
}
