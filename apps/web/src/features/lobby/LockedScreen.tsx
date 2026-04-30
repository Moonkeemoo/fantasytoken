import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  DEFAULT_VIRTUAL_BUDGET_USD,
  dollarsFor,
  fmtMoney,
  fmtMoneyExact,
} from '@fantasytoken/shared';
import { TokenIcon } from '../../components/ui/TokenIcon.js';
import { Label } from '../../components/ui/Label.js';
import { useCountdown } from '../../lib/countdown.js';
import { formatCents } from '../../lib/format.js';
import type { LineupPick } from '../team-builder/lineupReducer.js';
import { useLockedState } from './useLockedState.js';

interface LockedNavState {
  picks?: LineupPick[];
}

function formatCountdown(ms: number): { primary: string; subtitle: string } {
  if (ms <= 0) return { primary: '00:00', subtitle: 'starting…' };
  const totalSec = Math.floor(ms / 1000);
  const hr = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const pad = (n: number): string => n.toString().padStart(2, '0');
  if (hr > 0) {
    return {
      primary: `${pad(hr)}:${pad(min)}`,
      subtitle: `${pad(sec)}s`,
    };
  }
  return {
    primary: `${pad(min)}:${pad(sec)}`,
    subtitle: 'mm : ss',
  };
}

export function LockedScreen(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const stateQuery = useLockedState(id);
  const navState = (location.state ?? {}) as LockedNavState;

  const tier = DEFAULT_VIRTUAL_BUDGET_USD;
  const picks = useMemo(() => navState.picks ?? [], [navState.picks]);

  const startsAt = stateQuery.data?.startsAt;
  const ms = useCountdown(startsAt ?? new Date(Date.now() + 60 * 60_000).toISOString());

  // Auto-nav to /live once the contest opens. Re-checks on every tick.
  useEffect(() => {
    if (!id || !startsAt) return;
    if (Date.now() >= new Date(startsAt).getTime()) {
      navigate(`/contests/${id}/live`, { replace: true });
    }
  }, [id, startsAt, ms, navigate]);

  if (!id) return <div className="p-6 text-hl-red">missing contest id</div>;
  if (stateQuery.isLoading) return <div className="p-6 text-muted">loading…</div>;
  if (stateQuery.isError || !stateQuery.data)
    return <div className="p-6 text-hl-red">contest not found</div>;

  const contest = stateQuery.data;
  const time = formatCountdown(ms);
  const maxAlloc = picks.length === 0 ? 100 : Math.max(...picks.map((p) => p.alloc), 80);
  const dollarsCommitted = picks.reduce((s, p) => s + dollarsFor(p.alloc, tier), 0);

  const endLabel = new Date(contest.endsAt).toLocaleString('en-US', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="border-b border-line px-3 py-2">
        <div className="text-[13px] font-bold leading-tight">{contest.name}</div>
        <div className="text-[10px] text-muted">
          {fmtMoney(tier)} budget · ends {endLabel}
        </div>
      </header>

      <section className="px-3 pt-4">
        <div className="flex items-center justify-center gap-2 text-[12px] font-bold uppercase tracking-wider text-bull">
          <span className="h-2 w-2 animate-pulse rounded-full bg-bull" />
          <span>You&apos;re locked in</span>
        </div>
      </section>

      <section className="px-3 pt-6 text-center">
        <Label>Kickoff in</Label>
        <div className="mt-1 font-mono text-countdown text-ink">
          <span>{time.primary.split(':')[0]}</span>
          <span className="animate-pulse text-ink-soft">:</span>
          <span>{time.primary.split(':')[1]}</span>
        </div>
        <div className="mt-1 text-[11px] text-muted">{time.subtitle}</div>
      </section>

      <section className="mx-3 mt-6 rounded-lg border border-line bg-paper-dim/50 p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-pnl-big text-ink">{contest.spotsFilled}</div>
            <Label>players in</Label>
          </div>
          <div className="text-right">
            <div className="font-mono text-pnl-big text-gold">
              {formatCents(contest.prizePoolCents)}
            </div>
            <Label>prize pool</Label>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 border-t border-line pt-2 text-[11px] text-ink-soft">
          <span className="h-1.5 w-1.5 rounded-full bg-bull" />
          <span className="truncate">You just locked in</span>
          <span className="ml-auto text-muted">just now</span>
        </div>
      </section>

      <section className="mx-3 mt-4">
        <div className="flex items-baseline justify-between">
          <Label>Your team</Label>
          <span className="text-[10px] text-muted">
            {picks.length} picks · {fmtMoneyExact(dollarsCommitted)} committed
          </span>
        </div>
        <ul className="mt-2 space-y-1.5">
          {picks.length === 0 && (
            <li className="rounded-md border border-dashed border-line bg-paper-dim/50 px-3 py-3 text-center text-[11px] text-muted">
              Lineup details unavailable. Check back at kickoff.
            </li>
          )}
          {picks.map((p) => (
            <li
              key={p.symbol}
              className="flex items-center gap-2 rounded-md border border-line bg-paper px-2 py-1.5"
            >
              <TokenIcon symbol={p.symbol} imageUrl={p.imageUrl ?? null} size={24} />
              <div className="flex-1">
                <div className="text-[12px] font-bold text-ink">{p.symbol}</div>
                <div className="text-[10px] font-mono text-muted">
                  {fmtMoneyExact(dollarsFor(p.alloc, tier))} · {p.alloc}%
                </div>
              </div>
              <div className="h-1 w-20 rounded-full bg-paper-deep">
                <div
                  className="h-full rounded-full bg-ink"
                  style={{ width: `${(p.alloc / maxAlloc) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-auto sticky bottom-0 flex gap-2 border-t border-line bg-paper px-3 py-2">
        <button
          type="button"
          disabled
          className="flex-1 rounded-lg border border-line bg-paper px-3 py-2.5 text-[12px] font-semibold text-muted disabled:cursor-not-allowed"
          aria-label="Share lineup (coming soon)"
        >
          📤 Share lineup
        </button>
        <button
          type="button"
          onClick={() => navigate(`/contests/${id}/browse`)}
          className="flex-1 rounded-lg bg-ink px-3 py-2.5 text-[12px] font-bold text-paper hover:bg-ink-soft"
        >
          Browse others →
        </button>
      </div>
    </div>
  );
}
