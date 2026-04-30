import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ReferralsPayoutsResponse } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';
import { formatCents } from '../../lib/format.js';
import { telegram } from '../../lib/telegram.js';
import { useRealtime } from '../../lib/realtime.js';

const LAST_SEEN_KEY = 'ft.referrals.lastSeenPayoutId';

/**
 * Global in-app toast — REFERRAL_SYSTEM.md §6.4.
 *
 * Two ingestion paths run side-by-side:
 *  1. WebSocket (push) — sub-second latency. Server publishes a 'commission'
 *     event the moment payCommissions credits the recipient.
 *  2. REST polling (fallback) — every 60s. Catches any commission missed by
 *     the WS path: cold-start window before the connection opens, transparent
 *     proxy that strips WS, dropped reconnect, etc.
 *
 * Both paths funnel through the same setShown so we never double-pop. The
 * lastSeenId marker (localStorage) keeps a cold reload from re-popping every
 * historical payout.
 *
 * Mounted once at the App root so it sees every screen.
 */
/** Discriminated state so the toast can render commission OR signup-unlock
 * with the same component (avoids two near-identical floating elements
 * stacking on top of each other). */
type ToastState =
  | {
      kind: 'commission';
      id: string;
      payoutCents: number;
      sourceFirstName: string | null;
      sourcePrizeCents: number;
      level: 1 | 2;
    }
  | {
      kind: 'referral_unlock';
      id: string;
      bonusType: 'REFEREE' | 'RECRUITER';
      amountCents: number;
      sourceFirstName: string | null;
    };

export function CommissionToast() {
  const navigate = useNavigate();
  const [shown, setShown] = useState<ToastState | null>(null);

  const q = useQuery({
    queryKey: ['referrals', 'payouts', 5],
    queryFn: () => apiFetch('/me/referrals/payouts?limit=5', ReferralsPayoutsResponse),
    // WS is primary — polling backed off to 60s as a safety net. Still
    // refetches on focus so opening the app surfaces anything missed offline.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // WS path — fires sub-second after the credit. Two event kinds map to
  // the same toast surface (commission + referral_unlock) so the user
  // sees a single consistent affordance regardless of which flow paid.
  const realtime = useRealtime();
  useEffect(() => {
    const ev = realtime.lastEvent;
    if (!ev) return;
    if (ev.kind === 'commission') {
      // Synthetic id so the polling-side dedup also recognises this toast.
      // `ws:` prefix avoids ever colliding with a real referral_payouts UUID.
      const synthId = `ws:${Date.now()}`;
      setShown({
        kind: 'commission',
        id: synthId,
        payoutCents: ev.payoutCents,
        sourceFirstName: ev.sourceFirstName,
        sourcePrizeCents: ev.sourcePrizeCents,
        level: ev.level,
      });
      telegram.hapticNotification('success');
    } else if (ev.kind === 'referral_unlock') {
      setShown({
        kind: 'referral_unlock',
        id: `ws-unlock:${Date.now()}`,
        bonusType: ev.bonusType,
        amountCents: ev.amountCents,
        sourceFirstName: ev.sourceFirstName,
      });
      telegram.hapticNotification('success');
    }
    // Don't write LAST_SEEN here — once polling sees the matching real row it
    // will compare against this synthId, miss, and we'd briefly re-pop. Keep
    // the LAST_SEEN as the canonical authoritative marker (real row id).
  }, [realtime.lastEvent]);

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
        kind: 'commission',
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

  // Per-kind copy. Both variants share the same animation + slide affordance
  // and route the user to /me so they can see the matching transaction in
  // their referrals breakdown.
  let icon: string;
  let title: string;
  let subtitle: string;
  if (shown.kind === 'commission') {
    const friend = shown.sourceFirstName ?? 'Your friend';
    icon = '💸';
    title = `+${formatCents(shown.payoutCents)} from ${friend}'s win`;
    subtitle = `L${shown.level} commission · ${shown.level === 1 ? '5%' : '1%'} of ${formatCents(shown.sourcePrizeCents)} prize`;
  } else {
    icon = '🎉';
    if (shown.bonusType === 'RECRUITER') {
      const friend = shown.sourceFirstName ?? 'Your friend';
      title = `+${formatCents(shown.amountCents)} — ${friend} played their first`;
      subtitle = 'Referral signup bonus unlocked';
    } else {
      title = `+${formatCents(shown.amountCents)} welcome bonus unlocked`;
      subtitle = 'Your first contest is in — credit applied';
    }
  }

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
      <span className="text-[20px] leading-none">{icon}</span>
      <div className="flex-1">
        <div className="text-[13px] font-extrabold leading-tight">{title}</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-paper/70">
          {subtitle}
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
