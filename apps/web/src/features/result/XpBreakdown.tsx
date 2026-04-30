import type { XpAwardSummary, RankResponse } from '@fantasytoken/shared';
import { Card } from '../../components/ui/Card.js';
import { Label } from '../../components/ui/Label.js';

export interface XpBreakdownProps {
  award: XpAwardSummary;
  /** Optional rank snapshot to show progress bar both pre/post award. */
  rank?: RankResponse | null;
}

/**
 * Displays an "XP earned" block: each breakdown row + accent total + a pre/post
 * progress bar (filled to current xp_in_rank, with the gain laid on top in
 * accent color).
 */
export function XpBreakdown({ award, rank }: XpBreakdownProps) {
  return (
    <Card className="m-3 !px-[14px] !py-3">
      <div className="flex items-baseline justify-between">
        <Label>XP earned</Label>
        <span className="font-mono text-[22px] font-extrabold leading-none text-accent">
          +{award.total}
        </span>
      </div>
      <div className="mt-2 flex flex-col gap-[3px]">
        {award.breakdown.map((row, i) => (
          <div
            key={i}
            className={`flex items-baseline justify-between text-[12px] ${
              row.reason.toLowerCase().includes('multiplier') ||
              row.reason.toLowerCase().includes('bear contest')
                ? 'text-accent'
                : ''
            }`}
            style={{ animation: `ftXpFade 280ms ease-out ${i * 80}ms both` }}
          >
            <span>{row.reason}</span>
            <span className="font-mono font-bold">
              {/* Multiplier rows can be negative (e.g. ×0.5 on Practice
                  yields -5). Render an explicit sign so we don't print
                  the literal "+-5". */}
              {row.amount >= 0 ? '+' : '−'}
              {Math.abs(row.amount)}
            </span>
          </div>
        ))}
      </div>

      {rank && !rank.atMax && (
        <div className="mt-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
            Rank {rank.currentRank} · {rank.display}
          </div>
          <div className="mt-1 h-[8px] w-full overflow-hidden rounded-[3px] border-[1.5px] border-ink bg-paper">
            <div
              className="h-full"
              style={{
                width: `${Math.min(100, Math.round((rank.xpInRank / rank.xpForRank) * 100))}%`,
                backgroundColor: rank.color,
              }}
            />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
            <span>{rank.xpInRank} XP</span>
            <span>{rank.xpForRank} XP</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes ftXpFade {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </Card>
  );
}
