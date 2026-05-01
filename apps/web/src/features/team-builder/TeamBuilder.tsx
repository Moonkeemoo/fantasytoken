import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ContestListItem } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';
import { useMe } from '../me/useMe.js';
import { TopUpModal } from '../wallet/TopUpModal.js';
import { DraftScreen } from './DraftScreen.js';
import { useSubmitEntry } from './useSubmitEntry.js';
import type { LineupPick } from './lineupReducer.js';

function useContest(id: string | undefined) {
  return useQuery({
    queryKey: ['contests', id],
    queryFn: () => apiFetch(`/contests/${id!}`, ContestListItem),
    enabled: !!id,
    // While the user picks their lineup, the contest can transition
    // scheduled → active and the room can fill. Without polling the build
    // screen showed "00:00 to start" with 20/20 filled and a still-active
    // GO CTA — tap landed on a backend "contest closed" error. 10s tick
    // catches the kickoff window with room for the redirect effect to fire.
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: 'always',
  });
}

export function TeamBuilder(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = useMe();
  const contest = useContest(id);
  const submit = useSubmitEntry();
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpHint, setTopUpHint] = useState<{ required: number; current: number } | undefined>();
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const onSubmit = (picks: LineupPick[]): void => {
    if (!id) return;
    setErrMsg(null);
    // TZ-003: wire payload is just the symbol list. Backend computes
    // equal-split allocations.
    const wirePicks = picks.map((p) => p.symbol);
    submit.mutate(
      { contestId: id, picks: wirePicks },
      {
        onSuccess: (res) => {
          try {
            localStorage.removeItem(`draft:contest:${id}`);
          } catch {
            // ignore
          }
          navigate(`/contests/${id}/locked?entry=${res.entryId}`, {
            replace: true,
            state: { picks },
          });
        },
        onError: (err) => {
          const msg = String(err);
          // Backend (TZ-002) returns 402 with `code: INSUFFICIENT_COINS` and a
          // `details: { required, current }` payload so we can prefill the
          // top-up hint. Older 'INSUFFICIENT_BALANCE' kept as a fallback.
          if (
            msg.includes('INSUFFICIENT_COINS') ||
            msg.includes('INSUFFICIENT_BALANCE') ||
            msg.includes('402')
          ) {
            const detailsMatch = /"details":\s*({[^}]+})/.exec(msg);
            if (detailsMatch && detailsMatch[1]) {
              try {
                const details = JSON.parse(detailsMatch[1]) as {
                  required?: number;
                  current?: number;
                };
                if (typeof details.required === 'number' && typeof details.current === 'number') {
                  setTopUpHint({ required: details.required, current: details.current });
                }
              } catch {
                // fall through with no hint
              }
            }
            setTopUpOpen(true);
          } else {
            setErrMsg(msg);
          }
        },
      },
    );
  };

  useEffect(() => {
    document.title = contest.data ? `Build · ${contest.data.name}` : 'Team Builder';
  }, [contest.data]);

  // INV-10: lineups immutable after submit. If the user already entered this
  // contest, route them onward — never re-show the editable Build screen.
  // Once-only: TeamBuilder's `useContest` polls every 10s to catch
  // scheduled→active transitions, so without a fired-flag this effect
  // re-navigates each tick and clobbers `location.state.picks` that the
  // submit handler attaches (LockedScreen renders empty in that case).
  const redirectFiredRef = useRef(false);
  useEffect(() => {
    if (redirectFiredRef.current) return;
    if (!id || !contest.data?.userHasEntered) return;
    redirectFiredRef.current = true;
    const next =
      contest.data.status === 'active'
        ? `/contests/${id}/live`
        : contest.data.status === 'finalized' || contest.data.status === 'cancelled'
          ? `/contests/${id}/result`
          : `/contests/${id}/locked`;
    navigate(next, { replace: true });
  }, [id, contest.data, navigate]);

  if (!id) return <div className="p-6 text-hl-red">missing contest id</div>;
  if (me.isLoading || contest.isLoading) return <div className="p-6 text-muted">loading…</div>;
  if (contest.isError || !contest.data)
    return <div className="p-6 text-hl-red">contest not found</div>;
  if (!me.data) return <div className="p-6 text-hl-red">not authenticated</div>;

  return (
    <>
      <DraftScreen
        contestId={id}
        contestName={contest.data.name}
        mode={contest.data.type}
        // ADR-0003: virtualBudget is display-only. Backend stores cents;
        // DraftScreen and AllocSheet expect dollars. Convert at the boundary.
        // Coin economy (TZ-002): virtualBudgetCents stores whole dollars,
        // not cents. Drop the legacy /100 divide — it was turning the new
        // \$1K Practice floor into "\$10" on the build screen.
        tier={contest.data.virtualBudgetCents}
        entryFeeCents={contest.data.entryFeeCents}
        balanceCents={me.data.balanceCents}
        startsAt={contest.data.startsAt}
        endsAt={contest.data.endsAt}
        spotsFilled={contest.data.spotsFilled}
        prizePoolCents={contest.data.prizePoolCents}
        isSubmitting={submit.isPending}
        errMsg={errMsg}
        onSubmit={onSubmit}
        onBack={() => navigate(-1)}
        onTopUp={() => setTopUpOpen(true)}
      />
      <TopUpModal
        open={topUpOpen}
        onClose={() => {
          setTopUpOpen(false);
          setTopUpHint(undefined);
        }}
        {...(topUpHint && { insufficient: topUpHint })}
      />
    </>
  );
}
