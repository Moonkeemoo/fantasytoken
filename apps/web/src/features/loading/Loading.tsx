import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useMe } from '../me/useMe.js';
import { LoadingSplash } from './LoadingSplash.js';

export const TUTORIAL_DONE_KEY = 'ft.tutorial.done';

export function Loading() {
  const me = useMe();

  // Soft handoff: while the me query is in flight (or transiently errored on cold
  // start) keep showing the splash. Once data is available we redirect via the
  // <Navigate> below — useEffect not needed.
  useEffect(() => {
    // No-op; explicit hook so React Strict Mode double-mount behavior surfaces during dev.
  }, []);

  if (me.isLoading || !me.data) return <LoadingSplash />;
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
  return <Navigate to={tutorialDone ? '/lobby' : '/tutorial'} replace />;
}
