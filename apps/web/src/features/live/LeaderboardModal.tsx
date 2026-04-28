import type { LeaderboardEntry } from '@fantasytoken/shared';
import { Button } from '../../components/ui/Button.js';
import { formatPct } from '../../lib/format.js';

export interface LeaderboardModalProps {
  open: boolean;
  onClose: () => void;
  entries: LeaderboardEntry[];
}

export function LeaderboardModal({ open, onClose, entries }: LeaderboardModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/50" onClick={onClose}>
      <div
        className="mt-auto flex max-h-[80vh] flex-col rounded-t-lg bg-tg-bg p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-bold">Leaderboard</h2>
          <Button size="sm" variant="ghost" onClick={onClose}>
            ✕
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-1 text-sm">
            {entries.map((e) => (
              <div
                key={e.entryId}
                className={`flex items-center justify-between rounded px-2 py-1 ${
                  e.isMe ? 'bg-yellow-100/40' : ''
                }`}
              >
                <span>
                  <strong>#{e.rank}</strong> {e.displayName}
                  {e.isBot && <span className="ml-1 text-xs text-tg-hint">(bot)</span>}
                  {e.isMe && <span className="ml-1 text-xs text-tg-hint">(you)</span>}
                </span>
                <span
                  className={`font-bold ${e.scorePct >= 0 ? 'text-green-600' : 'text-tg-error'}`}
                >
                  {formatPct(e.scorePct)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
