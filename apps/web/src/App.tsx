import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Lobby } from './features/lobby/Lobby.js';
import { TeamBuilder } from './features/team-builder/TeamBuilder.js';
import { useMe } from './features/me/useMe.js';
import { formatCents } from './lib/format.js';
import { StatusPage } from './features/status/StatusPage.js';
import { Live } from './features/live/Live.js';
import { LiveList } from './features/live-list/LiveList.js';
import { Result } from './features/result/Result.js';

function ScreenPlaceholder({ title }: { title: string }) {
  const me = useMe();
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <div className="flex items-center gap-2 border-b-[1.5px] border-ink px-3 py-2">
        <button
          onClick={() => navigate('/lobby')}
          className="flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-ink bg-paper text-[12px] leading-none"
        >
          ‹
        </button>
        <h1 className="text-[14px] font-bold">{title}</h1>
      </div>
      <div className="p-6">
        {me.isLoading && <p className="text-muted">loading…</p>}
        {me.isError && <p className="text-hl-red">error: {String(me.error)}</p>}
        {me.data && (
          <p className="mt-2 text-sm">
            Hi, {me.data.user.first_name} · balance {formatCents(me.data.balanceCents)}
          </p>
        )}
        <p className="mt-4 text-xs text-muted">This screen isn&apos;t built yet.</p>
      </div>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/lobby" replace />} />
      <Route path="/lobby" element={<Lobby />} />
      <Route path="/contests/:id/build" element={<TeamBuilder />} />
      <Route path="/contests/:id/live" element={<Live />} />
      <Route path="/contests/:id/result" element={<Result />} />
      <Route path="/live" element={<LiveList />} />
      <Route path="/wallet" element={<ScreenPlaceholder title="Wallet (stub)" />} />
      <Route path="/me" element={<ScreenPlaceholder title="Profile (stub)" />} />
      <Route path="/status" element={<StatusPage />} />
      <Route
        path="*"
        element={
          <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-paper p-6 text-ink">
            <div className="text-[42px] font-extrabold">404</div>
            <a
              href="/lobby"
              className="font-mono text-[11px] uppercase tracking-[0.04em] text-accent"
            >
              ← back to lobby
            </a>
          </div>
        }
      />
    </Routes>
  );
}
