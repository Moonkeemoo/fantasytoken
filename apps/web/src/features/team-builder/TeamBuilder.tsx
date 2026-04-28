import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Token } from '@fantasytoken/shared';
import { ContestListItem } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';
import { useMe } from '../me/useMe.js';
import { TopUpModal } from '../wallet/TopUpModal.js';
import { ContextBar } from './ContextBar.js';
import { LineupSummary } from './LineupSummary.js';
import { TokenSearch } from './TokenSearch.js';
import { ConfirmBar } from './ConfirmBar.js';
import { useDraft } from './useDraft.js';
import { useSubmitEntry } from './useSubmitEntry.js';
import { addToken, bumpAlloc, removeToken } from './lineupReducer.js';

function useContest(id: string | undefined) {
  return useQuery({
    queryKey: ['contests', id],
    queryFn: () => apiFetch(`/contests/${id!}`, ContestListItem),
    enabled: !!id,
  });
}

export function TeamBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = useMe();
  const contest = useContest(id);
  const { draft, setDraft, clearDraft } = useDraft(id ?? '');
  const submit = useSubmitEntry();
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const onAdd = (t: Token) => setDraft(addToken(draft, t.symbol));
  const onRemove = (sym: string) => setDraft(removeToken(draft, sym));
  const onBump = (sym: string, delta: number) => setDraft(bumpAlloc(draft, sym, delta));

  const onSubmit = () => {
    if (!id) return;
    setErrMsg(null);
    submit.mutate(
      { contestId: id, picks: draft },
      {
        onSuccess: (res) => {
          clearDraft();
          navigate(`/contests/${id}/live?entry=${res.entryId}`);
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

  if (!id) return <div className="p-6 text-hl-red">missing contest id</div>;
  if (me.isLoading || contest.isLoading) return <div className="p-6 text-muted">loading…</div>;
  if (contest.isError || !contest.data)
    return <div className="p-6 text-hl-red">contest not found</div>;
  if (!me.data) return <div className="p-6 text-hl-red">not authenticated</div>;

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <ContextBar
        name={contest.data.name}
        entryFeeCents={contest.data.entryFeeCents}
        prizePoolCents={contest.data.prizePoolCents}
        hasUnsavedPicks={draft.length > 0}
      />
      <LineupSummary picks={draft} onRemove={onRemove} />
      <TokenSearch picks={draft} onAdd={onAdd} onRemove={onRemove} onBump={onBump} />
      {errMsg && <div className="m-3 text-[10px] text-hl-red">{errMsg}</div>}
      <ConfirmBar
        entryFeeCents={contest.data.entryFeeCents}
        balanceCents={me.data.balanceCents}
        picks={draft}
        isSubmitting={submit.isPending}
        onSubmit={onSubmit}
        onTopUp={() => setTopUpOpen(true)}
      />
      <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />
    </div>
  );
}
