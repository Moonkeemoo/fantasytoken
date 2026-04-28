import { Navigate, Route, Routes } from 'react-router-dom';
import { useMe } from './features/me/useMe.js';
import { formatCents } from './lib/format.js';
import { StatusPage } from './features/status/StatusPage.js';

function ScreenPlaceholder({ title }: { title: string }) {
  const me = useMe();
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>{title}</h1>
      {me.isLoading && <p>loading…</p>}
      {me.isError && <p>error: {String(me.error)}</p>}
      {me.data && (
        <p>
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
      <Route path="/lobby" element={<ScreenPlaceholder title="Lobby (S1)" />} />
      <Route path="/contests/:id/build" element={<ScreenPlaceholder title="Team Builder (S2)" />} />
      <Route path="/contests/:id/live" element={<ScreenPlaceholder title="Live Event (S3)" />} />
      <Route path="/contests/:id/result" element={<ScreenPlaceholder title="Result (S4)" />} />
      <Route path="/status" element={<StatusPage />} />
      <Route path="*" element={<div style={{ padding: 24 }}>404 — see /status</div>} />
    </Routes>
  );
}
