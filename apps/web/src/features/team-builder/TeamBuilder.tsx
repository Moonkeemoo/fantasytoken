import { useEffect, useState } from 'react';
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
  });
}

export function TeamBuilder(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = useMe();
  const contest = useContest(id);
  const submit = useSubmitEntry();
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const onSubmit = (picks: LineupPick[]): void => {
    if (!id) return;
    setErrMsg(null);
    // Strip display-only metadata before posting — backend zod schema only
    // accepts { symbol, alloc } and would reject the enriched LineupPick.
    const wirePicks = picks.map((p) => ({ symbol: p.symbol, alloc: p.alloc }));
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
          if (msg.includes('402') || msg.includes('INSUFFICIENT_BALANCE')) {
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
  useEffect(() => {
    if (!id || !contest.data?.userHasEntered) return;
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
        tier={Math.round(contest.data.virtualBudgetCents / 100)}
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
      <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />
    </>
  );
}
