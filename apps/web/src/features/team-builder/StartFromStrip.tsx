import { Label } from '../../components/ui/Label.js';
import type { LineupPick } from './lineupReducer.js';

export interface StartFromPreset {
  id: string;
  /** Headline shown on the card (`⚖️ Balanced` / `Last team +12.4%`). */
  label: string;
  /** Secondary line (`Sprint #283 · 2d ago` / `Equal split — 20/20/20/20/20`). */
  sub: string;
  /** When `true`, render as dashed (system preset); else solid (personal). */
  isSystem: boolean;
  picks: LineupPick[];
}

export interface StartFromStripProps {
  presets: StartFromPreset[];
  onApply: (preset: StartFromPreset) => void;
}

/**
 * Horizontal strip of "Start From" cards (TZ-001 §05.3). Personal cards (recent
 * lineups) come first with a solid border; system presets after with a dashed
 * border. Tap → reducer.applyPreset.
 *
 * v1 ships with system-preset stubs only (Balanced / Long-tail / Major-heavy).
 * Personal recents wire in once the API exposes a "last lineup" endpoint.
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

/** Three system presets — wired by DraftScreen until personal recents land. */
export function defaultPresets(symbols: readonly string[]): StartFromPreset[] {
  if (symbols.length < 5) return [];
  const [a, b, c, d, e] = symbols;
  if (!a || !b || !c || !d || !e) return [];
  return [
    {
      id: 'balanced',
      label: '⚖️ Balanced',
      sub: '20 / 20 / 20 / 20 / 20',
      isSystem: true,
      picks: [
        { symbol: a, alloc: 20 },
        { symbol: b, alloc: 20 },
        { symbol: c, alloc: 20 },
        { symbol: d, alloc: 20 },
        { symbol: e, alloc: 20 },
      ],
    },
    {
      id: 'top-heavy',
      label: '🦏 Top-heavy',
      sub: '50 / 20 / 15 / 10 / 5',
      isSystem: true,
      picks: [
        { symbol: a, alloc: 50 },
        { symbol: b, alloc: 20 },
        { symbol: c, alloc: 15 },
        { symbol: d, alloc: 10 },
        { symbol: e, alloc: 5 },
      ],
    },
    {
      id: 'long-tail',
      label: '🎲 Long-tail',
      sub: '30 / 25 / 20 / 15 / 10',
      isSystem: true,
      picks: [
        { symbol: a, alloc: 30 },
        { symbol: b, alloc: 25 },
        { symbol: c, alloc: 20 },
        { symbol: d, alloc: 15 },
        { symbol: e, alloc: 10 },
      ],
    },
  ];
}
