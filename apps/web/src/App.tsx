import { Navigate, Route, Routes } from 'react-router-dom';
import { Lobby } from './features/lobby/Lobby.js';
import { TeamBuilder } from './features/team-builder/TeamBuilder.js';
import { useMe } from './features/me/useMe.js';
import { formatCents } from './lib/format.js';
import { StatusPage } from './features/status/StatusPage.js';

function ScreenPlaceholder({ title }: { title: string }) {
  const me = useMe();
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold">{title}</h1>
      {me.isLoading && <p className="text-tg-hint">loading…</p>}
      {me.isError && <p className="text-tg-error">error: {String(me.error)}</p>}
      {me.data && (
        <p className="mt-2 text-sm">
          Hi, {me.data.user.first_name} · balance {formatCents(me.data.balanceCents)}
        </p>
      )}
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/lobby" replace />} />
      <Route path="/lobby" element={<Lobby />} />
      <Route path="/contests/:id/build" element={<TeamBuilder />} />
      <Route path="/contests/:id/live" element={<ScreenPlaceholder title="Live Event (S3)" />} />
      <Route path="/contests/:id/result" element={<ScreenPlaceholder title="Result (S4)" />} />
      <Route path="/live" element={<ScreenPlaceholder title="Live (stub)" />} />
      <Route path="/wallet" element={<ScreenPlaceholder title="Wallet (stub)" />} />
      <Route path="/me" element={<ScreenPlaceholder title="Profile (stub)" />} />
      <Route path="/status" element={<StatusPage />} />
      <Route path="*" element={<div className="p-6">404 — see /status</div>} />
    </Routes>
  );
}
