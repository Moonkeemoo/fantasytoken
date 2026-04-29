import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { TutorialDoneResponse } from '@fantasytoken/shared';
import { Avatar } from '../../components/ui/Avatar.js';
import { Button } from '../../components/ui/Button.js';
import { Label } from '../../components/ui/Label.js';
import { LoadingSplash } from '../loading/LoadingSplash.js';
import { TUTORIAL_DONE_KEY } from '../loading/Loading.js';
import { apiFetch } from '../../lib/api-client.js';
import { formatCents } from '../../lib/format.js';
import { useMe } from '../me/useMe.js';
import { useWelcomeStatus } from './useReferrals.js';

/**
 * REFERRAL_SYSTEM.md §6.5 — first screen a brand-new referee sees instead of
 * the generic 3-step tutorial. Replaces tutorial flow per spec ("Replaces
 * existing tutorial flow для цих users").
 *
 * Loading.tsx already gates entry: only routes here when state==='active' AND
 * recruiter !== null AND tutorial not done. This component just renders.
 *
 * "Find a contest →" CTA marks tutorial done (server + localStorage cache,
 * same flow as Tutorial.tsx) so a back-press can't loop the user back here.
 */
export function RefereeWelcome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe();
  const welcome = useWelcomeStatus();

  if (me.isLoading || welcome.isLoading) return <LoadingSplash />;
  if (!me.data || !welcome.data || !welcome.data.recruiter) {
    // No recruiter (organic signup) shouldn't be routed here, but if they are
    // — punt to /tutorial cleanly instead of rendering a broken header.
    navigate('/tutorial', { replace: true });
    return null;
  }

  const recruiterName = welcome.data.recruiter.firstName ?? 'A friend';
  const refereeBonusCents = welcome.data.welcomeBonusCents; // referee unlock equals signup bonus
  const totalReadyCents = welcome.data.welcomeBonusCents + refereeBonusCents;

  const onStart = () => {
    if (typeof window !== 'undefined') window.localStorage.setItem(TUTORIAL_DONE_KEY, '1');
    apiFetch('/me/tutorial-done', TutorialDoneResponse, { method: 'POST' })
      .then(() => queryClient.invalidateQueries({ queryKey: ['me'] }))
      .catch((err) => {
        console.warn('tutorial-done sync failed', err);
      });
    navigate('/lobby', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-5 pb-3 pt-8">
        <div className="text-[42px]">👋</div>
        <h1 className="text-[28px] font-extrabold leading-tight">
          Welcome, {me.data.user.first_name}!
        </h1>

        {/* Social proof — recruiter avatar + name. Single strongest retention hook. */}
        <div className="flex items-center gap-2 rounded-[6px] border-[1.5px] border-ink bg-paper-dim px-3 py-2">
          <Avatar name={recruiterName} url={welcome.data.recruiter.photoUrl} size={36} />
          <div className="text-[13px] leading-tight">
            <span className="font-extrabold">{recruiterName}</span> invited you to Fantasy Token
            League.
          </div>
        </div>

        {/* Bonus card — yellow note bg, the headline value-prop. */}
        <div className="w-full max-w-[340px] rounded-[6px] border-[1.5px] border-ink bg-note px-[14px] py-3">
          <Label>your starter bonus</Label>
          <div className="mt-2 flex flex-col gap-[6px] font-mono text-[12px]">
            <div className="flex justify-between">
              <span>Welcome bonus</span>
              <span className="font-bold">+{formatCents(welcome.data.welcomeBonusCents)}</span>
            </div>
            <div className="flex justify-between">
              <span>Referral bonus (after 1st game)</span>
              <span className="font-bold">+{formatCents(refereeBonusCents)}</span>
            </div>
            <div className="my-1 border-t border-dashed border-ink/40" />
            <div className="flex justify-between text-[14px]">
              <span className="font-extrabold">Total ready to play</span>
              <span className="font-extrabold">{formatCents(totalReadyCents)}</span>
            </div>
          </div>
        </div>

        {welcome.data.daysUntilExpiry !== null && welcome.data.daysUntilExpiry <= 7 && (
          <div className="text-[11px] text-muted">
            Use within {welcome.data.daysUntilExpiry} day
            {welcome.data.daysUntilExpiry === 1 ? '' : 's'} or it expires.
          </div>
        )}
      </div>

      <div className="px-5 pb-5">
        <Button variant="primary" size="md" onClick={onStart}>
          Find a contest →
        </Button>
      </div>
    </div>
  );
}
