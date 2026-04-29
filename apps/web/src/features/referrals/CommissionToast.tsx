import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ReferralsPayoutsResponse } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';
import { formatCents } from '../../lib/format.js';
import { telegram } from '../../lib/telegram.js';

const LAST_SEEN_KEY = 'ft.referrals.lastSeenPayoutId';

/**
 * Global in-app toast — REFERRAL_SYSTEM.md §6.4.
 *
 * Polls /me/referrals/payouts every 30s (V1 fallback; WebSocket is V2). On a
 * fresh payout (id newer than the last one we've shown) slides a black/red
 * banner down from the top. Click → opens /me referrals section. Does NOT
 * auto-dismiss — it's money, the user closes it themselves.
 *
 * Mounted once at the App root so it sees every screen. Single global instance,
 * cheap query, no per-route plumbing.
 */
export function CommissionToast() {
  const navigate = useNavigate();
  const [shown, setShown] = useState<{
    id: string;
    payoutCents: number;
    sourceFirstName: string | null;
    sourcePrizeCents: number;
    level: 1 | 2;
  } | null>(null);

  const q = useQuery({
    queryKey: ['referrals', 'payouts', 5],
    queryFn: () => apiFetch('/me/referrals/payouts?limit=5', ReferralsPayoutsResponse),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  useEffect(() => {
    if (!q.data || q.data.items.length === 0) return;
    const newest = q.data.items[0]!; // route returns DESC order
    const lastSeen =
      typeof window !== 'undefined' ? window.localStorage.getItem(LAST_SEEN_KEY) : null;

    // First-ever poll for this device: prime the lastSeen marker WITHOUT
    // showing a toast — otherwise every existing payout would pop on cold load.
    if (lastSeen === null) {
      window.localStorage.setItem(LAST_SEEN_KEY, newest.id);
      return;
    }

    if (newest.id !== lastSeen) {
      setShown({
        id: newest.id,
        payoutCents: newest.payoutCents,
        sourceFirstName: newest.sourceFirstName,
        sourcePrizeCents: newest.sourcePrizeCents,
        level: newest.level,
      });
      window.localStorage.setItem(LAST_SEEN_KEY, newest.id);
      telegram.hapticNotification('success');
    }
  }, [q.data]);

  if (!shown) return null;

  const friend = shown.sourceFirstName ?? 'Your friend';
  return (
    <button
      onClick={() => {
        setShown(null);
        navigate('/me');
      }}
      // Slide-down on mount via Tailwind's animate-in equivalent done with a
      // CSS keyframe inline so we don't pull in tailwindcss-animate just for this.
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 border-b-2 border-accent bg-ink px-4 py-3 text-left text-paper shadow-lg"
      style={{ animation: 'commission-slide 500ms ease-out' }}
    >
      <span className="text-[20px] leading-none">💸</span>
      <div className="flex-1">
        <div className="text-[13px] font-extrabold leading-tight">
          +{formatCents(shown.payoutCents)} from {friend}'s win
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-paper/70">
          L{shown.level} commission · {shown.level === 1 ? '5%' : '1%'} of{' '}
          {formatCents(shown.sourcePrizeCents)} prize
        </div>
      </div>
      <span className="font-mono text-[16px] text-paper/80">›</span>
      <style>{`
        @keyframes commission-slide {
          from { transform: translateY(-100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </button>
  );
}
