import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMe } from '../me/useMe.js';
import { useContests } from '../lobby/useContests.js';
import { Header } from '../lobby/Header.js';
import { ContestList } from '../lobby/ContestList.js';
import { TopUpModal } from '../wallet/TopUpModal.js';
import { Label } from '../../components/ui/Label.js';
import { LoadingSplash } from '../loading/LoadingSplash.js';

const IN_PROGRESS_STATUSES = new Set(['scheduled', 'active', 'finalizing']);

export function LiveList() {
  const navigate = useNavigate();
  const me = useMe();
  const my = useContests('my');
  const [topUpOpen, setTopUpOpen] = useState(false);

  // Hard filter on `userHasEntered` — backend's filter='my' should already
  // do this, but several test-flow rounds left orphan rows visible. Belt
  // and braces: only contests where this user actually has an entry.
  const items = (my.data?.items ?? []).filter((c) => c.userHasEntered);
  const inProgress = useMemo(
    () =>
      items
        .filter((c) => IN_PROGRESS_STATUSES.has(c.status))
        .slice()
        .sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1)),
    [items],
  );
  const history = useMemo(
    () =>
      items
        .filter((c) => c.status === 'finalized' || c.status === 'cancelled')
        .slice()
        .sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1)),
    [items],
  );

  if (me.isLoading) return <LoadingSplash />;
  if (me.isError || !me.data)
    return <div className="p-6 text-hl-red">error: {String(me.error)}</div>;

  const goTeamBuilder = (id: string) => navigate(`/contests/${id}/build`);
  const goLive = (id: string) => navigate(`/contests/${id}/live`);
  const goLocked = (id: string) => navigate(`/contests/${id}/locked`);
  const goResult = (id: string) => navigate(`/contests/${id}/result`);

  return (
    <div className="flex min-h-screen flex-col bg-paper pb-14 text-ink">
      <Header
        firstName={me.data.user.first_name}
        photoUrl={me.data.user.photo_url}
        balanceCents={me.data.balanceCents}
        onTopUp={() => setTopUpOpen(true)}
      />
      <div className="px-3 py-2">
        <Label>your contests</Label>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-[11px] text-muted">
          No contests yet — pick one from <strong>Play</strong>.
        </div>
      ) : (
        <>
          {inProgress.length > 0 && (
            <ContestList
              items={inProgress}
              balanceCents={me.data.balanceCents}
              onJoin={goTeamBuilder}
              onView={goLive}
              onLocked={goLocked}
              onResult={goResult}
              onTopUp={() => setTopUpOpen(true)}
              heading="Live now"
            />
          )}
          {history.length > 0 && (
            <ContestList
              items={history}
              balanceCents={me.data.balanceCents}
              onJoin={goTeamBuilder}
              onView={goLive}
              onLocked={goLocked}
              onResult={goResult}
              onTopUp={() => setTopUpOpen(true)}
              heading="History"
            />
          )}
        </>
      )}
      <div className="flex-1" />
      <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />
    </div>
  );
}
