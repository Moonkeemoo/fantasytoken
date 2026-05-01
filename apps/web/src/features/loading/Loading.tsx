import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useMe } from '../me/useMe.js';
import { useWelcomeStatus } from '../referrals/useReferrals.js';
import { useReferralAttribution } from '../referrals/useReferralAttribution.js';
import { telegram } from '../../lib/telegram.js';
import { LoadingSplash } from './LoadingSplash.js';

// Matches `result_<uuid>` in the start_param. Used by bot finalize-DMs to
// deep-link the user straight to the result page they were nudged about.
const RESULT_DEEP_LINK = /^result_([0-9a-f-]{36})$/i;

export const TUTORIAL_DONE_KEY = 'ft.tutorial.done';

export function Loading() {
  const me = useMe();
  // Welcome status is read here too so first-time referees skip the generic
  // tutorial and get their personalised /welcome screen instead. Cheap query,
  // 60s staleTime — it shares cache with anyone else who reads it later.
  const welcome = useWelcomeStatus();
  // Block routing until the referral friendship POST settles. Without this
  // a fresh referee would race past welcome-status (which still reports
  // recruiter=null) and end up on /tutorial instead of /welcome.
  const attribution = useReferralAttribution();

  // Soft handoff: while the me query is in flight (or transiently errored on cold
  // start) keep showing the splash. Once data is available we redirect via the
  // <Navigate> below — useEffect not needed.
  useEffect(() => {
    // No-op; explicit hook so React Strict Mode double-mount behavior surfaces during dev.
  }, []);

  if (me.isLoading || !me.data || welcome.isLoading) return <LoadingSplash />;
  if (me.isError) return <LoadingSplash caption="connection issue · retrying…" />;
  // Hold while the referral POST is in flight — the next render after it
  // resolves invalidates welcome-status and we re-evaluate the recruiter
  // check below with the fresh data.
  if (attribution.pending) return <LoadingSplash caption="linking your invite…" />;

  // Bot deep-link: ?startapp=result_<contestId> jumps the user straight to
  // the result page (skips lobby). Takes precedence over tutorial/welcome
  // routing — the user explicitly tapped the DM, they want their result.
  const sp = telegram.startParam();
  const m = sp ? RESULT_DEEP_LINK.exec(sp) : null;
  if (m) return <Navigate to={`/contests/${m[1]}/result`} replace />;

  // Server is the source of truth — survives wipes and crosses devices, fixes
  // the bug where a wiped account skipped the tutorial because localStorage
  // still held the flag from the previous identity. localStorage is kept in
  // sync on tutorial finish so future cold starts can route instantly.
  // Tutorial flag: trust EITHER server flag OR localStorage. Earlier we
  // strictly used the server value and removed the cache when server
  // said false — a transient /me/tutorial-done failure (network blip or
  // 401 race) made the user re-do the tutorial on every cold start.
  // Now localStorage acts as a sticky positive fallback; the next /me
  // refetch will eventually flip the server flag too.
  const cachedDone =
    typeof window !== 'undefined' && window.localStorage.getItem(TUTORIAL_DONE_KEY) === '1';
  const tutorialDone = me.data.tutorialDone || cachedDone;
  if (tutorialDone && typeof window !== 'undefined') {
    window.localStorage.setItem(TUTORIAL_DONE_KEY, '1');
  }

  if (tutorialDone) return <Navigate to="/lobby" replace />;

  // Fresh referee (active welcome bonus + recruiter present) → personalised
  // welcome screen instead of the generic tutorial. Falling welcome.data
  // (e.g. transient error) just defaults to the existing /tutorial flow.
  if (welcome.data && welcome.data.state === 'active' && welcome.data.recruiter !== null) {
    return <Navigate to="/welcome" replace />;
  }
  return <Navigate to="/tutorial" replace />;
}
