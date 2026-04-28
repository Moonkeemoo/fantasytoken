import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { MeResponse } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';
import { telegram } from '../../lib/telegram.js';

const REFERRAL_DONE_KEY = 'ft.referral.consumed';
const ReferralResponse = z.object({ ok: z.boolean(), reason: z.string().optional() });

export function useMe() {
  const q = useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch('/me', MeResponse),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Once we're authed, consume start_param=ref_<tgId> to record the friendship.
  // Idempotent: localStorage flag prevents repeat calls. Backend is also idempotent
  // on insert via ON CONFLICT DO NOTHING.
  useEffect(() => {
    if (!q.data) return;
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(REFERRAL_DONE_KEY) === '1') return;
    const sp = telegram.startParam();
    if (!sp || !sp.startsWith('ref_')) return;
    const inviterTelegramId = Number(sp.slice(4));
    if (!Number.isInteger(inviterTelegramId) || inviterTelegramId <= 0) return;
    if (inviterTelegramId === q.data.user.id) {
      window.localStorage.setItem(REFERRAL_DONE_KEY, '1');
      return;
    }
    apiFetch('/friends/referral', ReferralResponse, {
      method: 'POST',
      body: JSON.stringify({ inviterTelegramId }),
    })
      .then(() => window.localStorage.setItem(REFERRAL_DONE_KEY, '1'))
      .catch(() => {
        // Silent — don't block UI on referral hiccups; INV-7 covered by api-client surface.
      });
  }, [q.data]);

  return q;
}
