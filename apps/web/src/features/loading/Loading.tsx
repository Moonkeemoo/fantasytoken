import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useMe } from '../me/useMe.js';
import { useWelcomeStatus } from '../referrals/useReferrals.js';
import { LoadingSplash } from './LoadingSplash.js';

export const TUTORIAL_DONE_KEY = 'ft.tutorial.done';

export function Loading() {
  const me = useMe();
  // Welcome status is read here too so first-time referees skip the generic
  // tutorial and get their personalised /welcome screen instead. Cheap query,
  // 60s staleTime — it shares cache with anyone else who reads it later.
  const welcome = useWelcomeStatus();

  // Soft handoff: while the me query is in flight (or transiently errored on cold
  // start) keep showing the splash. Once data is available we redirect via the
  // <Navigate> below — useEffect not needed.
  useEffect(() => {
    // No-op; explicit hook so React Strict Mode double-mount behavior surfaces during dev.
  }, []);

  if (me.isLoading || !me.data || welcome.isLoading) return <LoadingSplash />;
  if (me.isError) return <LoadingSplash caption="connection issue · retrying…" />;

  // Server is the source of truth — survives wipes and crosses devices, fixes
  // the bug where a wiped account skipped the tutorial because localStorage
  // still held the flag from the previous identity. localStorage is kept in
  // sync on tutorial finish so future cold starts can route instantly.
  const tutorialDone = me.data.tutorialDone;
  if (tutorialDone && typeof window !== 'undefined') {
    window.localStorage.setItem(TUTORIAL_DONE_KEY, '1');
  } else if (!tutorialDone && typeof window !== 'undefined') {
    window.localStorage.removeItem(TUTORIAL_DONE_KEY);
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
