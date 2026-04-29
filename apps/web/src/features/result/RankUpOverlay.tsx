import { useNavigate } from 'react-router-dom';
import type { NextUnlock, RankResponse } from '@fantasytoken/shared';
import { Button } from '../../components/ui/Button.js';
import { telegram } from '../../lib/telegram.js';
import { useEffect } from 'react';

export interface RankUpOverlayProps {
  rank: RankResponse;
  unlock: NextUnlock | null;
  onDismiss: () => void;
}

export function RankUpOverlay({ rank, unlock, onDismiss }: RankUpOverlayProps) {
  const navigate = useNavigate();

  useEffect(() => {
    telegram.hapticNotification('success');
  }, []);

  const cta = unlock?.type === 'contest' ? 'Play it now →' : 'Customize now →';
  const onCta = () => {
    onDismiss();
    if (unlock?.type === 'contest') navigate('/lobby');
    else navigate('/me');
  };

  return (
    <div
      onClick={onDismiss}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-[12px] border-[2.5px] border-ink p-6 text-paper"
        style={{ backgroundColor: rank.color, boxShadow: '8px 8px 0 #1a1814' }}
      >
        <div className="text-center font-mono text-[12px] font-bold uppercase tracking-[0.16em]">
          ★ Rank Up ★
        </div>
        <div className="mt-4 text-center text-[64px] font-extrabold leading-none">
          Rank {rank.currentRank}
        </div>
        <div className="mt-2 text-center font-mono text-[14px] font-bold uppercase tracking-[0.12em]">
          {rank.display}
        </div>

        {unlock && (
          <div className="mt-5 rounded-[6px] border-[1.5px] border-ink bg-ink/30 p-3 text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] opacity-80">
              new unlock
            </div>
            <div className="mt-[2px] text-[16px] font-extrabold">{unlock.name}</div>
            <div className="mt-[2px] text-[11px] italic opacity-90">{unlock.description}</div>
          </div>
        )}

        <Button variant="primary" className="mt-5 w-full" onClick={onCta}>
          {cta}
        </Button>
      </div>
    </div>
  );
}
