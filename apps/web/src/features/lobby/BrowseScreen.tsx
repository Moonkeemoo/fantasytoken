import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ContestListItem, LineupsListResponse, type LineupsFilter } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';
import { Label } from '../../components/ui/Label.js';
import { TokenIcon } from '../../components/ui/TokenIcon.js';
import { useCountdown } from '../../lib/countdown.js';
import { useTokenList } from '../team-builder/useTokenList.js';

const FILTERS: ReadonlyArray<{ id: LineupsFilter; label: string; enabled: boolean }> = [
  { id: 'all', label: 'All', enabled: true },
  { id: 'friends', label: 'Friends', enabled: false },
  { id: 'recent', label: 'Just locked', enabled: true },
];

function fmtAgo(iso: string, now: number): string {
  const ms = Math.max(0, now - new Date(iso).getTime());
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtKickoff(ms: number): string {
  if (ms <= 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

export function BrowseScreen(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<LineupsFilter>('all');

  const contestQ = useQuery({
    queryKey: ['contests', id],
    queryFn: () => apiFetch(`/contests/${id!}`, ContestListItem),
    enabled: Boolean(id),
  });

  const lineupsQ = useQuery({
    queryKey: ['contest-lineups', id, filter],
    queryFn: () =>
      apiFetch(`/contests/${id!}/lineups?filter=${filter}&limit=50`, LineupsListResponse),
    enabled: Boolean(id),
    refetchInterval: 30_000,
  });

  const startsAt = contestQ.data?.startsAt;
  const kickoffMs = useCountdown(startsAt ?? new Date(Date.now() + 60 * 60_000).toISOString());

  const now = Date.now();
  const lineups = useMemo(() => lineupsQ.data?.lineups ?? [], [lineupsQ.data]);

  // Symbol → imageUrl map so the mini token-pill row renders real icons
  // instead of the letter fallback. Lineups response itself only carries
  // symbols (privacy contract); we resolve display metadata client-side.
  const tokensQ = useTokenList(250);
  const imageBySymbol = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const t of tokensQ.data?.items ?? []) map.set(t.symbol, t.imageUrl);
    return map;
  }, [tokensQ.data]);

  if (!id) return <div className="p-6 text-hl-red">missing contest id</div>;
  if (contestQ.isLoading) return <div className="p-6 text-muted">loading…</div>;
  if (contestQ.isError || !contestQ.data)
    return <div className="p-6 text-hl-red">contest not found</div>;
  const contest = contestQ.data;

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <button
          onClick={() => navigate(-1)}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-ink bg-paper text-[12px] leading-none"
          aria-label="Back"
        >
          ‹
        </button>
        <div className="flex-1">
          <div className="text-[13px] font-bold leading-tight">Lineups in {contest.name}</div>
          <div className="text-[10px] text-muted">
            {contest.spotsFilled} players · kickoff {fmtKickoff(kickoffMs)}
          </div>
        </div>
      </header>

      <section className="flex gap-1.5 border-b border-line px-3 py-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            disabled={!f.enabled}
            onClick={() => f.enabled && setFilter(f.id)}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
              filter === f.id
                ? 'border-ink bg-ink text-paper'
                : f.enabled
                  ? 'border-line bg-paper text-ink-soft hover:bg-paper-dim'
                  : 'cursor-not-allowed border-line bg-paper-dim/50 text-muted'
            }`}
          >
            {f.label}
            {!f.enabled && <span className="ml-1 text-[9px]">soon</span>}
          </button>
        ))}
      </section>

      <div className="border-b border-line bg-paper-dim/40 px-3 py-2 text-[10px] text-muted">
        Lineups only · stake size & PnL hidden until kickoff
      </div>

      <section className="flex-1 px-3 py-2">
        <Label>{lineupsQ.data?.total ?? 0} lineups</Label>
        {lineupsQ.isLoading && (
          <div className="py-4 text-center text-[11px] text-muted">loading lineups…</div>
        )}
        {!lineupsQ.isLoading && lineups.length === 0 && (
          <div className="py-8 text-center text-[11px] text-muted">no lineups yet</div>
        )}
        <ul className="mt-2 space-y-1.5">
          {lineups.map((l) => (
            <li
              key={`${l.user}-${l.submittedAt}`}
              className="flex items-center gap-2 rounded-md border border-line bg-paper px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-bold text-ink">@{l.user}</div>
                <div className="text-[10px] text-muted">{fmtAgo(l.submittedAt, now)}</div>
              </div>
              <div className="flex shrink-0 gap-1">
                {l.picks.slice(0, 5).map((sym) => (
                  <TokenIcon
                    key={sym}
                    symbol={sym}
                    imageUrl={imageBySymbol.get(sym) ?? null}
                    size={24}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
