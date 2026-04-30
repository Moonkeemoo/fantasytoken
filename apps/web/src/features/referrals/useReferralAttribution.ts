import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '../../lib/api-client.js';
import { telegram } from '../../lib/telegram.js';
import { useMe } from '../me/useMe.js';

const REFERRAL_DONE_KEY = 'ft.referral.consumed';
const ReferralResponse = z.object({ ok: z.boolean(), reason: z.string().optional() });

/**
 * Records the referee → recruiter friendship after auth completes.
 *
 * Used to be a fire-and-forget useEffect inside useMe, which created a
 * race: Loading would call useWelcomeStatus in parallel with /me, get
 * back `recruiter: null` (the referrer_user_id wasn't written yet), and
 * route the user to /tutorial — bypassing the personalised /welcome
 * screen they were supposed to see.
 *
 * Now we own the attribution as a first-class hook: callers can read
 * `pending` and hold off on routing until the friendship row + the
 * welcome-status query reflect reality. On success we invalidate
 * welcome-status + /me so the cached state catches up.
 */
export function useReferralAttribution(): { pending: boolean } {
  const me = useMe();
  const qc = useQueryClient();
  // Fast-path the obvious cases at first render so Loading doesn't have
  // to flash a "linking referral…" splash for organic signups.
  const [state, setState] = useState<'idle' | 'pending' | 'done'>(() => {
    if (typeof window === 'undefined') return 'done';
    if (window.localStorage.getItem(REFERRAL_DONE_KEY) === '1') return 'done';
    const sp = telegram.startParam();
    if (!sp || !sp.startsWith('ref_')) return 'done';
    return 'idle';
  });

  useEffect(() => {
    if (state !== 'idle') return;
    if (!me.data) return; // wait for auth
    if (typeof window === 'undefined') return;

    const sp = telegram.startParam();
    if (!sp || !sp.startsWith('ref_')) {
      setState('done');
      return;
    }
    const inviterTelegramId = Number(sp.slice(4));
    if (!Number.isInteger(inviterTelegramId) || inviterTelegramId <= 0) {
      setState('done');
      return;
    }
    if (inviterTelegramId === me.data.user.id) {
      window.localStorage.setItem(REFERRAL_DONE_KEY, '1');
      setState('done');
      return;
    }

    setState('pending');
    apiFetch('/friends/referral', ReferralResponse, {
      method: 'POST',
      body: JSON.stringify({ inviterTelegramId }),
    })
      .then(async () => {
        window.localStorage.setItem(REFERRAL_DONE_KEY, '1');
        // Welcome-status now has a recruiter; /me may carry the same
        // attribution server-side. Force both caches to refresh so
        // Loading's downstream check picks up the new state.
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['me', 'welcome-status'] }),
          qc.invalidateQueries({ queryKey: ['me'] }),
        ]);
      })
      .catch(() => {
        // Silent: api-client surfaces the error to its global handler;
        // we don't want a hiccup to permanently block the user from
        // reaching the lobby. Falling through to 'done' lets routing
        // fall back to /tutorial.
      })
      .finally(() => setState('done'));
  }, [me.data, qc, state]);

  // Pending whenever attribution might still flip welcome-status. While
  // /me is still loading we also report pending so Loading keeps
  // showing the splash instead of routing on stale data.
  return { pending: state !== 'done' || me.isLoading };
}
