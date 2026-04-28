import type { LeaderboardEntry } from '@fantasytoken/shared';
import { Button } from '../../components/ui/Button.js';
import { Avatar } from '../../components/ui/Avatar.js';
import { formatPnl } from '../../lib/format.js';

export interface LeaderboardModalProps {
  open: boolean;
  onClose: () => void;
  entries: LeaderboardEntry[];
}

export function LeaderboardModal({ open, onClose, entries }: LeaderboardModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/40" onClick={onClose}>
      <div
        className="mt-auto flex max-h-[80vh] flex-col rounded-t-[4px] border-t-[1.5px] border-ink bg-paper p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[14px] font-bold">Leaderboard</h2>
          <Button size="sm" variant="ghost" onClick={onClose}>
            ✕
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-[2px] text-[12px]">
            {entries.map((e) => (
              <div
                key={e.entryId}
                className={`flex items-center justify-between rounded-[2px] px-1 py-[2px] ${
                  e.isMe ? 'bg-note' : ''
                }`}
              >
                <span className="flex items-center gap-[6px] truncate">
                  <strong className="font-mono text-[10px]">#{e.rank}</strong>
                  <Avatar name={e.displayName} url={e.avatarUrl} size={20} bot={e.isBot} />
                  <span className="truncate">
                    {e.displayName}
                    {e.isBot && <span className="ml-1 text-[10px] text-muted">(bot)</span>}
                    {e.isMe && <span className="ml-1 text-[10px] text-muted">(you)</span>}
                  </span>
                </span>
                <span className={`font-bold ${e.scorePct >= 0 ? 'text-hl-green' : 'text-hl-red'}`}>
                  {formatPnl(e.scorePct)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
