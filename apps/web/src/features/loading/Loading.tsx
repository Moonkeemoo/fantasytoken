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

  if (me.isLoading) return <LoadingSplash />;
  if (me.isError) return <LoadingSplash caption="connection issue · retrying…" />;

  const tutorialDone =
    typeof window !== 'undefined' && window.localStorage.getItem(TUTORIAL_DONE_KEY) === '1';
  return <Navigate to={tutorialDone ? '/lobby' : '/tutorial'} replace />;
}
